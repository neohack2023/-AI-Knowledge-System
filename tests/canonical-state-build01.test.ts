import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  reconciliationProjectionClasses,
  validateCanonicalStateReconciliation,
  type CanonicalStateProjection,
  type CanonicalStateReconciliation,
  type ReconciliationFindingClass,
  type ReconciliationOverallState,
  type ReconciliationProjectionClass,
} from "../shared/canonical-state-reconciliation.ts";
import {
  finalizeCanonicalStateReconciliation,
  type CanonicalStateReconciliationDraft,
} from "../shared/canonical-state-classifier.ts";
import {
  CanonicalStateOperatorAgreementError,
  assertMachineOperatorAgreement,
  buildCanonicalStateOperatorTelemetry,
  buildCanonicalStateOperatorView,
  renderCanonicalStateOperatorView,
  validateMachineOperatorAgreement,
} from "../shared/canonical-state-operator-renderer.ts";

const baseline = JSON.parse(readFileSync(
  new URL("./fixtures/canonical-state-reconciliation/healthy-baseline.json", import.meta.url),
  "utf8",
)) as CanonicalStateReconciliation;

type FixtureExpected = {
  overall_state: ReconciliationOverallState;
  fail_visible: boolean;
  blocked_current_state_claim: boolean;
  reason_codes: string[];
  finding_classes: ReconciliationFindingClass[];
  affected_projection_classes: ReconciliationProjectionClass[];
};

type FixtureDefinition = {
  id: string;
  projection_mutations: Partial<Record<ReconciliationProjectionClass, Partial<CanonicalStateProjection>>>;
  expected: FixtureExpected;
};

type FixtureFile = { fixtures: FixtureDefinition[] };

const fixtureFile = JSON.parse(readFileSync(
  new URL("./fixtures/canonical-state-reconciliation/build01-fixtures.json", import.meta.url),
  "utf8",
)) as FixtureFile;

const canonicalFixtureIds = [
  "FX-01_HEALTHY_BASELINE",
  "FX-02_HANDOFF_STALE",
  "FX-03_AUTHORITY_CONFLICT",
  "FX-04_LEDGER_COVERAGE_OVERCLAIM",
  "FX-05_INTERFACE_MODE_DRIFT",
  "FX-06_REGISTRY_STATUS_DRIFT",
  "FX-07_SCOPE_LEAK",
  "FX-08_SCHEMA_DRIFT",
  "FX-09_PROVIDER_UNAVAILABLE",
  "FX-10_MULTI_PROJECTION_DRIFT",
] as const;

const projectionOrder = new Map<ReconciliationProjectionClass, number>(
  reconciliationProjectionClasses.map((projectionClass, index) => [projectionClass, index]),
);

const orderedClasses = (classes: readonly ReconciliationProjectionClass[]) => (
  [...new Set(classes)].sort(
    (left, right) => (projectionOrder.get(left) ?? 999) - (projectionOrder.get(right) ?? 999),
  )
);

const draftForFixture = (fixture: FixtureDefinition): CanonicalStateReconciliationDraft => {
  const working = structuredClone(baseline);
  working.reconciliation_id = `rec-${fixture.id.toLowerCase().replace(/_/g, "-")}`;
  working.execution_id = `exec-${fixture.id.toLowerCase().replace(/_/g, "-")}`;
  working.generated_at = "2026-08-20T22:44:00.000Z";

  for (const [projectionClass, patch] of Object.entries(fixture.projection_mutations)) {
    const projection = working.projections.find((candidate) => candidate.projection_class === projectionClass);
    assert.ok(projection, `fixture ${fixture.id} references known projection ${projectionClass}`);
    Object.assign(projection, structuredClone(patch));
  }

  const { findings: _findings, overall_state: _overall, fail_visible: _failVisible, ...draft } = working;
  return draft;
};

const resultForFixture = (fixture: FixtureDefinition) => (
  finalizeCanonicalStateReconciliation(draftForFixture(fixture))
);

const affectedClasses = (result: CanonicalStateReconciliation) => orderedClasses(
  result.findings.flatMap((finding) => finding.projection_classes),
);

for (const fixture of fixtureFile.fixtures) {
  test(`${fixture.id} is deterministic, schema-valid, fail-visible, and operator-consistent`, () => {
    const baselineBefore = JSON.stringify(baseline);
    const fixtureBefore = JSON.stringify(fixture);

    const first = resultForFixture(fixture);
    const second = resultForFixture(fixture);
    assert.deepEqual(second, first);

    assert.deepEqual(validateCanonicalStateReconciliation(first), []);
    assert.equal(first.overall_state, fixture.expected.overall_state);
    assert.equal(first.fail_visible, fixture.expected.fail_visible);
    assert.equal(first.write_authorization, "NONE");
    assert.equal(first.mutation_performed, false);
    assert.deepEqual(first.findings.map((finding) => finding.reason_code), fixture.expected.reason_codes);
    assert.deepEqual(first.findings.map((finding) => finding.drift_class), fixture.expected.finding_classes);
    assert.deepEqual(affectedClasses(first), fixture.expected.affected_projection_classes);

    const operatorView = buildCanonicalStateOperatorView(first);
    assert.deepEqual(validateMachineOperatorAgreement(first, operatorView), []);
    assert.doesNotThrow(() => assertMachineOperatorAgreement(first, operatorView));
    assert.equal(operatorView.overall_state, first.overall_state);
    assert.equal(operatorView.fail_visible, first.fail_visible);
    assert.equal(operatorView.blocked_current_state_claim, fixture.expected.blocked_current_state_claim);
    assert.equal(operatorView.write_authorization, "NONE");
    assert.equal(operatorView.mutation_performed, false);

    const rendered = renderCanonicalStateOperatorView(first);
    assert.match(rendered, new RegExp(`^AIOS STATE · ${fixture.expected.overall_state}`, "m"));
    assert.match(rendered, /^scope: global-working-memory$/m);
    assert.match(rendered, new RegExp(`^fail_visible: ${fixture.expected.fail_visible}$`, "m"));
    assert.match(rendered, /^write_authorization: NONE$/m);
    for (const reasonCode of fixture.expected.reason_codes) assert.ok(rendered.includes(reasonCode));

    const telemetry = buildCanonicalStateOperatorTelemetry(operatorView);
    assert.equal(telemetry.overall_state, first.overall_state);
    assert.equal(telemetry.fail_visible, first.fail_visible);
    assert.deepEqual(telemetry.finding_reason_codes, fixture.expected.reason_codes);
    assert.deepEqual(telemetry.affected_projection_classes, fixture.expected.affected_projection_classes);

    const telemetryJson = JSON.stringify(telemetry);
    const renderedAndTelemetry = `${rendered}\n${telemetryJson}`;
    for (const forbidden of [
      "source_fingerprint",
      "provenance_envelope_id",
      "observed_claims",
      "sha256:handoff-fixture",
      "prov-handoff-001",
      "handoff:global-working-memory",
    ]) {
      assert.equal(renderedAndTelemetry.includes(forbidden), false, `operator output must not expose ${forbidden}`);
    }

    assert.equal(JSON.stringify(baseline), baselineBefore, "fixture execution must not mutate the shared source baseline");
    assert.equal(JSON.stringify(fixture), fixtureBefore, "fixture execution must not mutate its fixture definition");
  });
}

test("operator agreement validator fails closed when visible state is tampered", () => {
  const result = resultForFixture(fixtureFile.fixtures[1]);
  const operatorView = buildCanonicalStateOperatorView(result);
  const tampered = { ...operatorView, overall_state: "HEALTHY" as const };
  assert.ok(validateMachineOperatorAgreement(result, tampered).length > 0);
  assert.throws(
    () => assertMachineOperatorAgreement(result, tampered),
    (error: unknown) => error instanceof CanonicalStateOperatorAgreementError
      && error.code === "CANONICAL_STATE_OPERATOR_MACHINE_MISMATCH",
  );
});

test("Build 01 acceptance gate covers exactly the ten contracted deterministic fixtures", () => {
  assert.equal(fixtureFile.fixtures.length, 10);
  assert.deepEqual(fixtureFile.fixtures.map((fixture) => fixture.id), canonicalFixtureIds);

  const outcomes = fixtureFile.fixtures.map((fixture) => resultForFixture(fixture));
  assert.equal(outcomes.every((result) => validateCanonicalStateReconciliation(result).length === 0), true);
  assert.equal(outcomes.every((result) => result.write_authorization === "NONE" && result.mutation_performed === false), true);
  assert.equal(outcomes.every((result) => validateMachineOperatorAgreement(result, buildCanonicalStateOperatorView(result)).length === 0), true);

  const healthy = outcomes.find((result) => result.reconciliation_id.includes("fx-01-healthy-baseline"));
  assert.equal(healthy?.overall_state, "HEALTHY");
  assert.equal(healthy?.fail_visible, false);

  for (const nonHealthy of outcomes.filter((result) => result !== healthy)) {
    assert.notEqual(nonHealthy.overall_state, "HEALTHY");
    assert.equal(nonHealthy.fail_visible, true);
    assert.equal(nonHealthy.findings.some((finding) => finding.blocks_current_state), true);
  }

  const authorityConflict = outcomes[2];
  assert.equal(authorityConflict.overall_state, "BLOCKED");
  assert.equal(authorityConflict.findings[0].drift_class, "AUTHORITY_DRIFT");

  const scopeLeak = outcomes[6];
  assert.equal(scopeLeak.overall_state, "BLOCKED");
  assert.equal(scopeLeak.findings[0].drift_class, "SCOPE_ISOLATION_VIOLATION");

  const unavailable = outcomes[8];
  assert.equal(unavailable.overall_state, "DEGRADED");
  assert.notEqual(unavailable.overall_state, "HEALTHY");

  const unknownDraft = draftForFixture(fixtureFile.fixtures[0]);
  unknownDraft.projections = unknownDraft.projections.map((projection) => (
    projection.projection_class === "runtime"
      ? { ...projection, status: "UNKNOWN", reason_codes: ["FRESHNESS_UNPROVEN"] }
      : projection
  ));
  const unknown = finalizeCanonicalStateReconciliation(unknownDraft);
  assert.equal(unknown.overall_state, "DEGRADED");
  assert.equal(unknown.fail_visible, true);
  assert.notEqual(unknown.overall_state, "HEALTHY");

  assert.deepEqual(
    orderedClasses(outcomes[0].projections.map((projection) => projection.projection_class)),
    [...reconciliationProjectionClasses],
  );
});
