import type { RuntimeMode } from "../../shared/runtime-mode.ts";
import type { NextActionEnvelope, NextActionSelection } from "../../shared/next-actions.ts";
import type {
  ContextProvenanceEmission,
  ContextProvenanceEnvelope,
  GovernedWriteAuthorization,
} from "../provenance/types.ts";

export const executionStatuses = [
  "QUEUED",
  "RUNNING",
  "WAITING",
  "APPROVAL_REQUIRED",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;

export type WorkflowExecutionStatus = (typeof executionStatuses)[number];
export type WorkflowExecutionMode = Extract<RuntimeMode, "LIVE">;
export type JsonObject = Record<string, unknown>;

export type WorkflowExecution = {
  execution_id: string;
  workflow_id: string;
  scope_key: string;
  requested_by: string | null;
  parent_execution_id: string | null;
  mode: WorkflowExecutionMode;
  status: WorkflowExecutionStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_stage: string | null;
  input: JsonObject;
  output: JsonObject | null;
  error: WorkflowExecutionError | null;
  result_class: string | null;
  next_action_envelope: NextActionEnvelope | null;
  selected_next_action: NextActionSelection | null;
};

export type WorkflowExecutionError = {
  code: string;
  message: string;
};

export type ExecutionEvent = {
  event_id: string;
  execution_id: string;
  workflow_id: string;
  scope_key: string;
  event_type: string;
  status: WorkflowExecutionStatus;
  stage: string | null;
  sequence: number;
  emitted_at: string;
  data?: JsonObject;
};

export type HandlerResult = {
  status: "RUNNING" | "WAITING" | "APPROVAL_REQUIRED" | "COMPLETED";
  current_stage: string | null;
  output?: JsonObject;
  result_class?: string;
  event_type: string;
  event_data?: JsonObject;
  provenance_emissions?: ContextProvenanceEmission[];
};

export type WorkflowProvenanceContext = {
  list: () => ContextProvenanceEnvelope[];
  emit: (input: ContextProvenanceEmission) => ContextProvenanceEnvelope;
  assertGovernedWriteAuthorization: (input: GovernedWriteAuthorization) => void;
};

export type WorkflowHandlerContext = {
  execution: Readonly<WorkflowExecution>;
  now: () => string;
  provenance: WorkflowProvenanceContext;
};

export interface WorkflowHandler {
  readonly workflow_id: string;
  readonly version: string;
  readonly allowed_scope_keys: readonly string[];
  readonly supports_pause: boolean;
  readonly supports_cancel: boolean;
  start(context: WorkflowHandlerContext): Promise<HandlerResult>;
  advance(context: WorkflowHandlerContext): Promise<HandlerResult>;
}

export type CreateExecutionRequest = {
  workflow_id: string;
  scope_key: string;
  requested_by?: string | null;
  parent_execution_id?: string | null;
  mode: Extract<RuntimeMode, "LIVE" | "SIMULATION">;
  input?: JsonObject;
};

export type ExecutionSnapshot = {
  execution: WorkflowExecution;
  events: ExecutionEvent[];
  provenance_envelopes: ContextProvenanceEnvelope[];
};
