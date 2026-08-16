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
});

test("unreviewed reusable-code paths remain unresolved rather than inheriting broad public access", () => {
  const unknown = classifyPath(manifest, "reusable-code/private-provenance/raw-export.json");
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.classification, "UNRESOLVED");
  assert.equal(unknown.rule, null);
});

test("deny-first secret rules still override reusable-code public classifications", () => {
  const secret = classifyPath(manifest, "reusable-code/fixtures/SEED-003/.env.local");
  assert.equal(secret.allowed, false);
  assert.equal(secret.classification, "SECRET");
  assert.equal(secret.rule?.id, "environment-files");
});
