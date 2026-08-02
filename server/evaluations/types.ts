import type { JsonObject, WorkflowExecution, WorkflowExecutionError } from "../workflows/types.ts";

export type RegressionArtifactKind =
  | "DETERMINISTIC_BUG"
  | "RETRIEVAL_FAILURE"
  | "SCOPE_ROUTING_FAILURE"
  | "AUTHORITY_VIOLATION"
  | "MODEL_BEHAVIOR_FAILURE"
  | "WORKFLOW_FAILURE";

export type RegressionArtifact = {
  schema_name: "RegressionArtifact";
  schema_version: "1.0";
  regression_id: string;
  created_at: string;
  execution_id: string;
  workflow_id: string;
  scope_key: string;
  failure_kind: RegressionArtifactKind;
  failure_signature: string;
  error: WorkflowExecutionError;
  input: JsonObject;
  current_stage: string | null;
  parent_execution_id: string | null;
  requested_by: string | null;
  expected_behavior: string;
  actual_behavior: string;
  promotion_state: "CANDIDATE";
  evaluation_targets: string[];
};

export type RegressionArtifactInput = {
  execution: Readonly<WorkflowExecution>;
  error: WorkflowExecutionError;
};
