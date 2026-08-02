import { createHash } from "node:crypto";
import type { RegressionArtifact, RegressionArtifactInput, RegressionArtifactKind } from "./types.ts";

const classifyFailure = (code: string): RegressionArtifactKind => {
  if (code.includes("PROVENANCE") || code.includes("AUTHORIZATION") || code.includes("AUTHORITY")) return "AUTHORITY_VIOLATION";
  if (code.includes("SCOPE")) return "SCOPE_ROUTING_FAILURE";
  if (code.includes("RETRIEVAL")) return "RETRIEVAL_FAILURE";
  if (code.includes("MODEL") || code.includes("LLM")) return "MODEL_BEHAVIOR_FAILURE";
  if (code.includes("ASSERT") || code.includes("INVARIANT") || code.includes("VALIDATION")) return "DETERMINISTIC_BUG";
  return "WORKFLOW_FAILURE";
};

const evaluationTargetsFor = (kind: RegressionArtifactKind) => {
  switch (kind) {
    case "AUTHORITY_VIOLATION": return ["governance-regression", "authority-policy-eval"];
    case "SCOPE_ROUTING_FAILURE": return ["scope-router-regression"];
    case "RETRIEVAL_FAILURE": return ["retrieval-eval"];
    case "MODEL_BEHAVIOR_FAILURE": return ["model-eval"];
    case "DETERMINISTIC_BUG": return ["deterministic-regression-test"];
    default: return ["workflow-regression-test"];
  }
};

export class RegressionArtifactService {
  createCandidate({ execution, error }: RegressionArtifactInput): RegressionArtifact {
    const failureKind = classifyFailure(error.code);
    const stableSignatureInput = JSON.stringify({
      workflow_id: execution.workflow_id,
      scope_key: execution.scope_key,
      current_stage: execution.current_stage,
      error_code: error.code,
      error_message: error.message,
    });
    const failureSignature = createHash("sha256").update(stableSignatureInput).digest("hex");

    return {
      schema_name: "RegressionArtifact",
      schema_version: "1.0",
      regression_id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      execution_id: execution.execution_id,
      workflow_id: execution.workflow_id,
      scope_key: execution.scope_key,
      failure_kind: failureKind,
      failure_signature: failureSignature,
      error: structuredClone(error),
      input: structuredClone(execution.input),
      current_stage: execution.current_stage,
      parent_execution_id: execution.parent_execution_id,
      requested_by: execution.requested_by,
      expected_behavior: `Workflow '${execution.workflow_id}' should satisfy its registered execution contract without this failure.`,
      actual_behavior: `${error.code}: ${error.message}`,
      promotion_state: "CANDIDATE",
      evaluation_targets: evaluationTargetsFor(failureKind),
    };
  }
}
