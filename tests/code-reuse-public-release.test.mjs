import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyPath,
  parseManifest,
} from "../scripts/public-release/lib.mjs";

const manifestText = readFileSync(new URL("../public-release-manifest.yaml", import.meta.url), "utf8");
const manifest = parseManifest(manifestText);

const expectClassification = (filePath, classification, ruleId) => {
  const result = classifyPath(manifest, filePath);
  assert.equal(result.allowed, true, `${filePath} should be publishable`);
  assert.equal(result.classification, classification);
  assert.equal(result.rule?.id, ruleId);
};

test("reusable-code release surface is classified by responsibility instead of one broad rule", () => {
  expectClassification(
    "reusable-code/CODESTORE_POLICY.md",
    "PUBLIC_TEMPLATE",
    "reusable-code-policy-docs",
  );
  expectClassification(
    "reusable-code/tools/admission_verifier.py",
    "PUBLIC_CORE",
    "reusable-code-tooling",
  );
  expectClassification(
    "reusable-code/registry/manifest.schema.json",
    "PUBLIC_CORE",
    "reusable-code-registry-schema",
  );
  expectClassification(
    "reusable-code/fixtures/SEED-001/validation-receipt.json",
    "PUBLIC_SYNTHETIC_FIXTURE",
    "reusable-code-synthetic-fixtures",
  );
  expectClassification(
    "reusable-code/fixtures/SEED-002/admission-result.json",
    "PUBLIC_SYNTHETIC_FIXTURE",
    "reusable-code-synthetic-fixtures",
  );
  expectClassification(
    "reusable-code/units/SEED-003/src/canonical_json.py",
    "PUBLIC_CORE",
    "reusable-code-verified-unit-seed003",
  );
});

test("unreviewed reusable-code paths remain unresolved rather than inheriting broad public access", () => {
  const unknown = classifyPath(manifest, "reusable-code/private-provenance/raw-export.json");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.classification, "UNRESOLVED");
  assert.equal(unknown.rule, null);

  const futureUnit = classifyPath(manifest, "reusable-code/units/SEED-999/src/future.py");
  assert.equal(futureUnit.allowed, false);
  assert.equal(futureUnit.classification, "UNRESOLVED");
  assert.equal(futureUnit.rule, null);
});

test("deny-first secret rules still override reusable-code public classifications", () => {
  const fixtureSecret = classifyPath(manifest, "reusable-code/fixtures/SEED-003/.env.local");
  assert.equal(fixtureSecret.allowed, false);
  assert.equal(fixtureSecret.classification, "SECRET");
  assert.equal(fixtureSecret.rule?.id, "environment-files");

  const unitSecret = classifyPath(manifest, "reusable-code/units/SEED-003/.env.local");
  assert.equal(unitSecret.allowed, false);
  assert.equal(unitSecret.classification, "SECRET");
  assert.equal(unitSecret.rule?.id, "environment-files");
});
