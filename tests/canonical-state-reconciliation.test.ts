import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CanonicalStateReconciliationValidationError,
  assertCanonicalStateReconciliation,
  reconciliationProjectionClasses,
  validateCanonicalStateReconciliation,
  type CanonicalStateReconciliation,
} from "../shared/canonical-state-reconciliation.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, "fixtures", "canonical-state-reconciliation");

const readJson = (name: string) => JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, name), "utf8"),
) as unknown;

const healthyFixture = () => structuredClone(
  readJson("healthy-baseline.json"),
) as CanonicalStateReconciliation;

const setPath = (target: unknown, dottedPath: string, value: unknown) => {
  const parts = dottedPath.split(".");
  let cursor = target as Record<string, unknown> | unknown[];
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    cursor = Array.isArray(cursor)
      ? cursor[Number(key)] as Record<string, unknown> | unknown[]
      : cursor[key] as Record<string, unknown> | unknown[];
  }
  const finalKey = parts.at(-1)!;
  if (Array.isArray(cursor)) cursor[Number(finalKey)] = value;
  else cursor[finalKey] = value;
};

test("B01.1 healthy baseline validates all six required projection classes", () => {
  const fixture = healthyFixture();
  assert.deepEqual(validateCanonicalStateReconciliation(fixture), []);
  assert.doesNotThrow(() => assertCanonicalStateReconciliation(fixture));
  assert.deepEqual(
    fixture.projections.map((projection) => projection.projection_class),
    reconciliationProjectionClasses,
  );
  assert.equal(fixture.write_authorization, "NONE");
  assert.equal(fixture.mutation_performed, false);
  assert.equal(fixture.overall_state, "HEALTHY");
});

test("B01.1 fail-closed schema fixtures reject governance and freshness violations", () => {
  const fixtureSet = readJson("fail-closed-schema.json") as {
    cases: Array<{ id: string; path: string; value: unknown; expected_issue: string }>;
  };

  for (const fixtureCase of fixtureSet.cases) {
    const input = healthyFixture() as unknown;
    setPath(input, fixtureCase.path, fixtureCase.value);
    const issues = validateCanonicalStateReconciliation(input);
    assert.ok(
      issues.some((issue) => issue.includes(fixtureCase.expected_issue)),
      `${fixtureCase.id} did not produce expected issue ${fixtureCase.expected_issue}. Observed: ${issues.join(" | ")}`,
    );
  }
});

test("B01.1 non-current projection status requires a bounded reason code", () => {
  const fixture = healthyFixture();
  fixture.projections[1].status = "STALE";
  fixture.overall_state = "DRIFTED";
  fixture.fail_visible = true;

  const issues = validateCanonicalStateReconciliation(fixture);
  assert.ok(issues.some((issue) => issue.includes("reason_codes must explain non-current projection status STALE")));
});

test("B01.1 missing a required projection fails closed", () => {
  const fixture = healthyFixture();
  fixture.projections = fixture.projections.filter((projection) => projection.projection_class !== "registry");
  fixture.overall_state = "BLOCKED";
  fixture.fail_visible = true;

  const issues = validateCanonicalStateReconciliation(fixture);
  assert.ok(issues.some((issue) => issue.includes("exactly one registry projection; observed 0")));
});

test("B01.1 unavailable projections can be represented only with explicit failure evidence", () => {
  const fixture = healthyFixture();
  const runtime = fixture.projections.find((projection) => projection.projection_class === "runtime")!;
  runtime.status = "UNAVAILABLE";
  runtime.reason_codes = ["RUNTIME_ARTIFACT_MISSING"];
  runtime.provenance_envelope_id = null;
  runtime.missing_provenance_reason = "required runtime provider unavailable during fixture run";
  fixture.overall_state = "DEGRADED";
  fixture.fail_visible = true;

  assert.deepEqual(validateCanonicalStateReconciliation(fixture), []);
});

test("B01.1 assert helper returns one stable validation error class and code", () => {
  const fixture = healthyFixture() as unknown as Record<string, unknown>;
  fixture.write_authorization = "IMPLICIT";

  assert.throws(
    () => assertCanonicalStateReconciliation(fixture),
    (error) => {
      assert.ok(error instanceof CanonicalStateReconciliationValidationError);
      assert.equal(error.code, "CANONICAL_STATE_RECONCILIATION_INVALID");
      assert.match(error.message, /write_authorization must remain "NONE"/);
      return true;
    },
  );
});

test("B01.1 malformed inputs fail closed without leaking native exceptions", () => {
  for (const value of [null, [], "state", 42]) {
    assert.doesNotThrow(() => validateCanonicalStateReconciliation(value));
    assert.ok(validateCanonicalStateReconciliation(value).length > 0);
  }
});
