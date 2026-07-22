export type ObservabilityJson = Record<string, unknown>;

export const sourceSystems = [
  "NOTION",
  "GOOGLE_DRIVE",
  "GITHUB",
  "TRANSIENT_CONTEXT",
  "INTERNAL",
  "OTHER",
] as const;

export type SourceSystem = (typeof sourceSystems)[number];

export const authorityRoles = [
  "AUTHORITATIVE_MEMORY",
  "RUNTIME_CONTROL_PLANE",
  "EXECUTION_TRUTH",
  "TRANSIENT",
  "NONE",
  "OTHER",
] as const;

export type AuthorityRole = (typeof authorityRoles)[number];
export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type CognitionTraceStatus = "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED";
export type ObservabilityCategory =
  | "SYSTEM"
  | "INTENT"
  | "SCOPE"
  | "AUTHORITY"
  | "SOURCE"
  | "PACKET"
  | "PREFERENCE"
  | "WORKFLOW"
  | "RESPONSE";

export type ObservabilityEvent = {
  event_id: string;
  trace_id: string;
  execution_id: string;
  category: ObservabilityCategory;
  event_type: string;
  sequence: number;
  emitted_at: string;
  data?: ObservabilityJson;
};

export type IntentObservation = {
  status: "NOT_OBSERVED" | "DETECTED" | "AMBIGUOUS";
  primary_intent: string | null;
  confidence: ConfidenceBand | null;
  signals: string[];
  observed_at: string | null;
};

export type ScopeResolutionObservation = {
  status: "REQUESTED_ONLY" | "RESOLVED" | "AMBIGUOUS";
  requested_scope_key: string;
  resolved_scope_key: string | null;
  reason: string | null;
  observed_at: string | null;
};

export type AuthorityObservation = {
  authority_id: string;
  subject: string;
  system: SourceSystem;
  authority_role: AuthorityRole;
  reason: string;
  observed_at: string;
  metadata?: ObservabilityJson;
};

export type SourceReadObservation = {
  read_id: string;
  system: SourceSystem;
  resource: string;
  purpose: string;
  authority_role: AuthorityRole;
  operation: "READ";
  result: "SUCCESS" | "MISS" | "BLOCKED" | "FAILED";
  latency_ms: number | null;
  observed_at: string;
  metadata?: ObservabilityJson;
};

export type PacketObservation = {
  packet_id: string;
  status: "CREATED" | "ASSEMBLED" | "REJECTED";
  scope_key: string;
  created_at: string;
  candidate_items: number | null;
  included_items: number | null;
  rejected_stale: number | null;
  rejected_scope: number | null;
  token_estimate: number | null;
  sources: SourceSystem[];
  metadata?: ObservabilityJson;
};

export type PreferenceObservation = {
  preference_id: string;
  status: "APPLIED" | "INACTIVE" | "CONFLICT";
  source: string;
  reason: string;
  observed_at: string;
  metadata?: ObservabilityJson;
};

export type CognitionTraceMetrics = {
  event_count: number;
  source_read_count: number;
  source_reads_by_system: Partial<Record<SourceSystem, number>>;
  packet_count: number;
  preference_applied_count: number;
  preference_conflict_count: number;
};

export type CognitionTrace = {
  trace_id: string;
  execution_id: string;
  workflow_id: string;
  requested_by: string | null;
  system_active: true;
  status: CognitionTraceStatus;
  created_at: string;
  completed_at: string | null;
  intent: IntentObservation;
  scope_resolution: ScopeResolutionObservation;
  authority_resolutions: AuthorityObservation[];
  source_reads: SourceReadObservation[];
  packets: PacketObservation[];
  preferences: PreferenceObservation[];
  events: ObservabilityEvent[];
  metrics: CognitionTraceMetrics;
};

export type CreateCognitionTraceInput = {
  execution_id: string;
  workflow_id: string;
  requested_by: string | null;
  requested_scope_key: string;
  created_at: string;
};

export type RecordIntentInput = {
  primary_intent: string;
  confidence: ConfidenceBand;
  signals?: string[];
  ambiguous?: boolean;
};

export type RecordScopeResolutionInput = {
  resolved_scope_key: string | null;
  status: "RESOLVED" | "AMBIGUOUS";
  reason: string;
};

export type RecordAuthorityInput = {
  subject: string;
  system: SourceSystem;
  authority_role: AuthorityRole;
  reason: string;
  metadata?: ObservabilityJson;
};

export type RecordSourceReadInput = {
  system: SourceSystem;
  resource: string;
  purpose: string;
  authority_role: AuthorityRole;
  result: SourceReadObservation["result"];
  latency_ms?: number | null;
  metadata?: ObservabilityJson;
};

export type RecordPacketInput = {
  packet_id?: string;
  status: PacketObservation["status"];
  scope_key: string;
  candidate_items?: number | null;
  included_items?: number | null;
  rejected_stale?: number | null;
  rejected_scope?: number | null;
  token_estimate?: number | null;
  sources?: SourceSystem[];
  metadata?: ObservabilityJson;
};

export type RecordPreferenceInput = {
  preference_id: string;
  status: PreferenceObservation["status"];
  source: string;
  reason: string;
  metadata?: ObservabilityJson;
};

export interface WorkflowObservationEmitter {
  intent(observation: RecordIntentInput): void;
  scope(observation: RecordScopeResolutionInput): void;
  authority(observation: RecordAuthorityInput): void;
  sourceRead(observation: RecordSourceReadInput): void;
  packet(observation: RecordPacketInput): string;
  preference(observation: RecordPreferenceInput): void;
  event(category: ObservabilityCategory, eventType: string, data?: ObservabilityJson): void;
}
