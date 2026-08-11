export type ScopeResolution = {
  requested_scope: string;
  normalized_request: string;
  resolved_scope_key: string;
  resolution_method: "EXACT_SCOPE_KEY" | "REGISTERED_ALIAS";
};

export type RepositorySourceRecord = {
  resource_id: string;
  scope_key: string;
  title: string;
  authority_role: "EXECUTION_TRUTH";
  source_system: "GITHUB";
  source_ref: string;
  updated_at: string;
  content: string;
  tags: string[];
};

export type ContextPacket = {
  packet_id: string;
  scope_key: string;
  query: string;
  source_records: RepositorySourceRecord[];
  source_count: number;
  packet_bytes: number;
  token_estimate: number;
  rejected_objects: number;
  conflicts: number;
  assembled_at: string;
};

export type RuntimeStageTiming = {
  stage: "scope_resolution" | "capability_discovery" | "source_retrieval" | "packet_assembly" | "workflow_result";
  latency_ms: number;
};

export type PerformanceReceipt = {
  receipt_id: string;
  trace_id: string;
  outcome: "COMPLETED" | "NO_MATCH" | "FAILED";
  total_latency_ms: number;
  stage_timings: RuntimeStageTiming[];
  retrieved_sources: number;
  source_reads: Array<{
    source_system: "GITHUB";
    resource_id: string;
    source_ref: string;
    latency_ms: number;
    latency_basis: "BATCH_OBSERVED";
  }>;
  packet_bytes: number;
  packet_tokens_estimate: number;
  rejected_objects: number;
  conflicts: number;
  completed_at: string;
};

export type RuntimeTraceEvent = {
  event_id: string;
  sequence: number;
  event_type: string;
  emitted_at: string;
  data: Record<string, unknown>;
};

export type VerticalSliceTrace = {
  trace_id: string;
  request_text: string;
  requested_scope: string;
  resolved_scope_key: string | null;
  capability_id: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  created_at: string;
  completed_at: string | null;
  events: RuntimeTraceEvent[];
  packet: ContextPacket | null;
  result: Record<string, unknown> | null;
  receipt: PerformanceReceipt | null;
  error: { code: string; message: string } | null;
};

export type ExecuteVerticalSliceRequest = {
  request_text: string;
  requested_scope: string;
};
