import type { RuntimeMode } from "../../shared/runtime-mode.ts";
import type { CognitionTrace, WorkflowObservationEmitter } from "../observability/types.ts";

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
  mode: WorkflowExecutionMode;
  status: WorkflowExecutionStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_stage: string | null;
  input: JsonObject;
  output: JsonObject | null;
  error: WorkflowExecutionError | null;
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
  event_type: string;
  event_data?: JsonObject;
};

export type WorkflowHandlerContext = {
  execution: Readonly<WorkflowExecution>;
  now: () => string;
  observe: WorkflowObservationEmitter;
};

export interface WorkflowHandler {
  readonly workflow_id: string;
  readonly version: string;
  readonly supports_pause: boolean;
  readonly supports_cancel: boolean;
  start(context: WorkflowHandlerContext): Promise<HandlerResult>;
  advance(context: WorkflowHandlerContext): Promise<HandlerResult>;
}

export type CreateExecutionRequest = {
  workflow_id: string;
  scope_key: string;
  requested_by?: string | null;
  mode: Extract<RuntimeMode, "LIVE" | "SIMULATION">;
  input?: JsonObject;
};

export type ExecutionSnapshot = {
  execution: WorkflowExecution;
  events: ExecutionEvent[];
  trace: CognitionTrace;
};
