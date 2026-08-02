import assert from "node:assert/strict";
import test from "node:test";

import { ContextProvenanceService, ProvenanceValidationError } from "../server/provenance/service.ts";
import type { ContextProvenanceEmission } from "../server/provenance/types.ts";

const service = new ContextProvenanceService();
const binding = {
  execution_id: "execution-001",
  workflow_id: "epistemic-contract-test",
  scope_key: "global-working-memory",
};

const validEmission = (): ContextProvenanceEmission => ({
  object_id: "claim-001",
  object_type: "workflow_execution_input",
  operation: "RETRIEVAL",
  epistemic_type: "CLAIM",
  source_system: "TRANSIENT_CONTEXT",
  source_id: "workflow_execution.input",
  source_version: null,
  source_fingerprint: "sha256:source",
  retrieved_at: new Date().toISOString(),
  object_fingerprint: "sha256:object",
  authority_owner: "WorkflowExecutionKernel",
  authority_domain: "execution-local input",
  authority_state: "NON_AUTHORITATIVE",
  confidence: 1,
  access_policy_refs: ["execution-local-read"],
  write_policy_refs: [],
});

test("provenance emission preserves explicit epistemic classification", () => {
  const envelope = service.emit(binding, validEmission());
  assert.equal(envelope.epistemic_type, "CLAIM");
});

test("provenance validation fails closed on an unknown epistemic classification", () => {
  const invalid = {
    ...validEmission(),
    epistemic_type: "MODEL_GUESS",
  } as unknown as ContextProvenanceEmission;

  assert.throws(
    () => service.emit(binding, invalid),
    (error) => {
      assert.ok(error instanceof ProvenanceValidationError);
      assert.equal(error.code, "PROVENANCE_VALIDATION_FAILED");
      assert.match(error.message, /epistemic_type must be one of/);
      return true;
    },
  );
});
