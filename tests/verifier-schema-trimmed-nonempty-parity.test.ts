import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  VerifierAcceptanceValidationError,
  createVerifierAcceptanceReceipt,
  type VerifierAcceptanceInput,
} from "../server/coding-harness/index.ts";

const HEAD = "38917a9028ef64161adf3d9a4d2212a3917e1b31";

const baseAcceptance = (): VerifierAcceptanceInput => ({
  acceptance_id: "acc-proof-001",
  scope_key: "global-working-memory",
  task_id: "task-verifier-runtime-001",
  artifact_or_object_id: "neohack2023/-AI-Knowledge-System",
  artifact_version_or_head: HEAD,
  artifact_digest: `git-sha:${HEAD}`,
  obligation_id: "proof-validity",
  obligation_description: "Proof validity",
  verifier_id: "kernel-01",
  verifier_version: "1.0.0",
  verifier_authority_class: "HARD_KERNEL",
  verifier_input_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  verifier_freshness_state: "CURRENT",
  coverage_state: "COMPLETE_FOR_OBLIGATION",
  result: "PASS",
  higher_priority_verifier_ids: [],
  lower_priority_evidence_ids: [],
  retry_allowed: true,
  repair_feedback_pointer: null,
  receipt_pointer: null,
});

const trimmedNonemptyFields = [
  "acceptance_id",
  "scope_key",
  "task_id",
  "artifact_or_object_id",
  "artifact_version_or_head",
  "artifact_digest",
  "obligation_id",
  "obligation_description",
  "verifier_version",
  "verifier_input_digest",
] as const;

test("runtime rejects whitespace-only values for every trimmed-nonempty verifier field", () => {
  for (const field of trimmedNonemptyFields) {
    assert.throws(
      () => createVerifierAcceptanceReceipt({ ...baseAcceptance(), [field]: " \t\n " }),
      (error) => {
        assert.ok(error instanceof VerifierAcceptanceValidationError);
        assert.ok(error.issues.includes(`${field} must be a non-empty string`));
        return true;
      },
    );
  }

  for (const field of ["repair_feedback_pointer", "receipt_pointer"] as const) {
    assert.throws(
      () => createVerifierAcceptanceReceipt({ ...baseAcceptance(), [field]: " \t " }),
      (error) => {
        assert.ok(error instanceof VerifierAcceptanceValidationError);
        assert.ok(error.issues.includes(`${field} must be null or a non-empty string`));
        return true;
      },
    );
  }
});

test("published verifier schema encodes trimmed-nonempty value semantics", async () => {
  const schema = JSON.parse(await readFile(
    new URL("../schemas/aios-verifier-acceptance-v0.1.schema.json", import.meta.url),
    "utf8",
  )) as { properties?: Record<string, { pattern?: string; minLength?: number; type?: string | string[] }> };

  for (const field of trimmedNonemptyFields) {
    const property = schema.properties?.[field];
    assert.equal(property?.minLength, 1, `${field} must remain non-empty`);
    assert.equal(property?.pattern, "\\S", `${field} must require a non-whitespace character`);
    assert.equal(new RegExp(property?.pattern ?? "").test(" \t\n "), false);
    assert.equal(new RegExp(property?.pattern ?? "").test(" value "), true);
  }

  for (const field of ["repair_feedback_pointer", "receipt_pointer"] as const) {
    const property = schema.properties?.[field];
    assert.deepEqual(property?.type, ["string", "null"]);
    assert.equal(property?.minLength, 1);
    assert.equal(property?.pattern, "\\S");
    assert.equal(new RegExp(property?.pattern ?? "").test("   "), false);
    assert.equal(new RegExp(property?.pattern ?? "").test("pointer"), true);
  }
});
