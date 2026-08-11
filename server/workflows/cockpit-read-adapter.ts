import type { NextActionEnvelope } from "../../shared/next-actions.ts";
import type {
  ExecutionEvent,
  ExecutionSnapshot,
  WorkflowExecutionStatus,
} from "./types.ts";

export const cockpitLiveReadSchema = {
  name: "CockpitLiveExecutionReadEnvelope",
  version: "0.1",
} as const;

export type CockpitDisplayStatus =
  | "QUEUED"
  | "ACTIVE"
  | "WAITING"
  | "APPROVAL REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type CockpitNodeId =
  | "source"
  | "scope"
  | "capability"
  | "retrieval"
  | "stone"
  | "mason"
  | "write-plan"
  | "approval"
  | "execution"
  | "verification"
  | "receipt"
  | "next-action";

export type CockpitWorkflowEvent = {
  id: string;
  timestamp: string;
  event_type: string;
  workflow_id: string;
  execution_id: string;
  scope_key: string;
  stage: string;
  node_id: CockpitNodeId;
  source: string;
  authority: string;
  capability: string;
  operation: string;
  status: CockpitDisplayStatus;
  duration?: number;
  input_summary?: string;
  output_summary?: string;
  provenance: string;
  error?: string;
  next_stage?: CockpitNodeId;
  next_action_envelope?: NextActionEnvelope;
};

const terminalStatuses = new Set<WorkflowExecutionStatus>(["COMPLETED", "FAILED", "CANCELLED"]);

const displayStatus = (status: WorkflowExecutionStatus): CockpitDisplayStatus => {
  switch (status) {
    case "RUNNING": return "ACTIVE";
    case "WAITING":
    case "PAUSED": return "WAITING";
    case "APPROVAL_REQUIRED": return "APPROVAL REQUIRED";
    default: return status;
  }
};

const nodeFor = (eventType: string): CockpitNodeId => {
  if (eventType.startsWith("next_action.")) return "next-action";
  if (eventType.includes("governed_write.authorization") || eventType.startsWith("approval.")) return "approval";
  if (eventType.includes("write_plan")) return "write-plan";
  if (eventType.startsWith("scope.")) return "scope";
  if (eventType.startsWith("capability.")) return "capability";
  if (eventType.startsWith("retrieval.") || eventType.includes("provenance.retrieval")) return "retrieval";
  if (eventType.startsWith("stone.")) return "stone";
  if (eventType.startsWith("mason.")) return "mason";
  if (eventType.startsWith("verification.") || eventType.includes("provenance.transformation")) return "verification";
  if (eventType.startsWith("receipt.") || terminalEventTypes.has(eventType) || eventType === "diagnostic.completed") return "receipt";
  if (eventType === "diagnostic.input.validated") return "scope";
  if (eventType.startsWith("diagnostic.") || eventType.includes("governed_write")) return "execution";
  return "source";
};

const terminalEventTypes = new Set([
  "workflow.execution.completed",
  "workflow.execution.failed",
  "workflow.execution.cancelled",
]);

const stageLabels: Record<CockpitNodeId, string> = {
  source: "Intent",
  scope: "Scope resolution",
  capability: "Capability",
  retrieval: "Retrieval",
  stone: "STONE",
  mason: "MASON",
  "write-plan": "Write plan",
  approval: "Authorization",
  execution: "Execution",
  verification: "Verification",
  receipt: "Receipt",
  "next-action": "Next actions",
};

const stringData = (event: ExecutionEvent, key: string) => {
  const value = event.data?.[key];
  return typeof value === "string" ? value : undefined;
};

const sourceFor = (event: ExecutionEvent) => {
  const explicit = stringData(event, "source_system");
  if (explicit) return explicit;
  if (event.event_type.startsWith("next_action.")) return "NextActionEnvelope";
  if (event.event_type.startsWith("diagnostic.")) return "InternalDiagnosticWorkflowHandler";
  return "WorkflowExecutionKernel";
};

const authorityFor = (event: ExecutionEvent) => {
  const source = sourceFor(event).toUpperCase();
  if (source === "NOTION") return "Notion migrated project-memory authority";
  if (source === "DRIVE" || source === "GOOGLE_DRIVE") return "Drive runtime/control-plane mirror";
  if (source === "GITHUB") return "GitHub repository execution truth";
  if (source === "TRANSIENT_CONTEXT") return "Non-authoritative execution input";
  if (source === "WORKFLOW_KERNEL") return "Derived server execution evidence";
  if (event.event_type.startsWith("next_action.")) return "Workflow transition registry";
  if (nodeFor(event.event_type) === "approval") return "User authorization boundary";
  return "Server runtime execution state";
};

const durationSince = (event: ExecutionEvent, previous?: ExecutionEvent) => {
  if (!previous) return undefined;
  const currentTime = Date.parse(event.emitted_at);
  const previousTime = Date.parse(previous.emitted_at);
  if (!Number.isFinite(currentTime) || !Number.isFinite(previousTime)) return undefined;
  return Math.max(0, currentTime - previousTime);
};

const outputSummary = (event: ExecutionEvent) => {
  const errorCode = stringData(event, "error_code");
  if (errorCode) return `Execution failed: ${errorCode}`;
  const envelopeId = stringData(event, "envelope_id");
  if (envelopeId) return `Evidence envelope ${envelopeId}`;
  const recommended = stringData(event, "recommended_action");
  if (recommended) return `Recommended transition ${recommended}`;
  if (terminalEventTypes.has(event.event_type)) return `Kernel status ${event.status}`;
  return event.stage ? `Stage ${event.stage} · ${event.status}` : `Kernel status ${event.status}`;
};

const provenanceSummary = (event: ExecutionEvent, snapshot: ExecutionSnapshot) => {
  const envelopeId = stringData(event, "envelope_id");
  const authorityState = stringData(event, "authority_state");
  if (envelopeId) return `${authorityState ?? "Execution evidence"} · ${envelopeId}`;
  return `${snapshot.provenance_envelopes.length} execution-bound provenance envelope${snapshot.provenance_envelopes.length === 1 ? "" : "s"}`;
};

const projectEvent = (
  event: ExecutionEvent,
  snapshot: ExecutionSnapshot,
  previous: ExecutionEvent | undefined,
  next: ExecutionEvent | undefined,
): CockpitWorkflowEvent => {
  const nodeId = nodeFor(event.event_type);
  const nextNode = next ? nodeFor(next.event_type) : undefined;
  const inputCount = Object.keys(snapshot.execution.input).length;
  const result: CockpitWorkflowEvent = {
    id: event.event_id,
    timestamp: event.emitted_at,
    event_type: event.event_type,
    workflow_id: event.workflow_id,
    execution_id: event.execution_id,
    scope_key: event.scope_key,
    stage: stageLabels[nodeId],
    node_id: nodeId,
    source: sourceFor(event),
    authority: authorityFor(event),
    capability: `workflow:${event.workflow_id}`,
    operation: event.event_type,
    status: displayStatus(event.status),
    input_summary: event.sequence === 1 ? `${inputCount} input properties bound` : undefined,
    output_summary: outputSummary(event),
    provenance: provenanceSummary(event, snapshot),
    ...(nextNode && nextNode !== nodeId ? { next_stage: nextNode } : {}),
  };

  const duration = durationSince(event, previous);
  if (duration !== undefined) result.duration = duration;
  if (snapshot.execution.error && event.status === "FAILED") {
    result.error = `${snapshot.execution.error.code}: ${snapshot.execution.error.message}`;
  }
  if (event.event_type === "next_action.generated" && snapshot.execution.next_action_envelope) {
    result.next_action_envelope = snapshot.execution.next_action_envelope;
  }
  return result;
};

export const projectCockpitLiveRead = (snapshot: ExecutionSnapshot, afterSequence = 0) => {
  const normalizedAfterSequence = Number.isFinite(afterSequence)
    ? Math.max(0, Math.floor(afterSequence))
    : 0;
  const allEvents = snapshot.events.map((event, index, events) => (
    projectEvent(event, snapshot, events[index - 1], events[index + 1])
  ));
  const events = allEvents.filter((_event, index) => snapshot.events[index].sequence > normalizedAfterSequence);
  const lastSequence = snapshot.events.at(-1)?.sequence ?? 0;
  const terminal = terminalStatuses.has(snapshot.execution.status);

  return {
    schema_name: cockpitLiveReadSchema.name,
    schema_version: cockpitLiveReadSchema.version,
    transport: "LIVE_SERVER_POLL" as const,
    generated_at: new Date().toISOString(),
    execution: {
      execution_id: snapshot.execution.execution_id,
      workflow_id: snapshot.execution.workflow_id,
      scope_key: snapshot.execution.scope_key,
      mode: snapshot.execution.mode,
      status: snapshot.execution.status,
      display_status: displayStatus(snapshot.execution.status),
      current_stage: snapshot.execution.current_stage,
      created_at: snapshot.execution.created_at,
      started_at: snapshot.execution.started_at,
      completed_at: snapshot.execution.completed_at,
      parent_execution_id: snapshot.execution.parent_execution_id,
      result_class: snapshot.execution.result_class,
      error: snapshot.execution.error,
      next_action_envelope: snapshot.execution.next_action_envelope,
      selected_next_action: snapshot.execution.selected_next_action,
    },
    events,
    cursor: {
      after_sequence: normalizedAfterSequence,
      last_sequence: lastSequence,
      terminal,
      poll_after_ms: terminal ? 0 : 500,
    },
    authority_context: {
      execution_state_authority: "WorkflowExecutionKernel",
      implementation_truth: "GITHUB",
      connector_projections: {
        notion: {
          authority: "MIGRATED_PROJECT_MEMORY",
          access: "NOT_ACCESSED_BY_EXECUTION",
          write_authorization: "NONE",
        },
        drive: {
          authority: "RUNTIME_CONTROL_PLANE_MIRROR",
          access: "NOT_ACCESSED_BY_EXECUTION",
          write_authorization: "NONE",
        },
        github: {
          authority: "REPOSITORY_EXECUTION_TRUTH",
          access: "IMPLEMENTATION_BOUND_ONLY",
          write_authorization: "NONE",
        },
      },
    },
    provenance: {
      envelope_count: snapshot.provenance_envelopes.length,
      envelope_ids: snapshot.provenance_envelopes.map((envelope) => envelope.envelope_id),
    },
  };
};

export type CockpitLiveExecutionReadEnvelope = ReturnType<typeof projectCockpitLiveRead>;
