import type {
  CognitionTrace,
  CognitionTraceStatus,
  CreateCognitionTraceInput,
  ObservabilityCategory,
  ObservabilityJson,
  RecordAuthorityInput,
  RecordIntentInput,
  RecordPacketInput,
  RecordPreferenceInput,
  RecordScopeResolutionInput,
  RecordSourceReadInput,
  SourceSystem,
  WorkflowObservationEmitter,
} from "./types.ts";

const emptyMetrics = () => ({
  event_count: 0,
  source_read_count: 0,
  source_reads_by_system: {} as Partial<Record<SourceSystem, number>>,
  packet_count: 0,
  preference_applied_count: 0,
  preference_conflict_count: 0,
});

export class CognitionTraceStore {
  private readonly traces = new Map<string, CognitionTrace>();
  private readonly traceByExecution = new Map<string, string>();
  private latestTraceId: string | null = null;

  createTrace(input: CreateCognitionTraceInput): CognitionTrace {
    const trace: CognitionTrace = {
      trace_id: crypto.randomUUID(),
      execution_id: input.execution_id,
      workflow_id: input.workflow_id,
      requested_by: input.requested_by,
      system_active: true,
      status: "QUEUED",
      created_at: input.created_at,
      completed_at: null,
      intent: {
        status: "NOT_OBSERVED",
        primary_intent: null,
        confidence: null,
        signals: [],
        observed_at: null,
      },
      scope_resolution: {
        status: "REQUESTED_ONLY",
        requested_scope_key: input.requested_scope_key,
        resolved_scope_key: null,
        reason: "The workflow request supplied a scope key; no scope resolver observation has been recorded.",
        observed_at: null,
      },
      authority_resolutions: [],
      source_reads: [],
      packets: [],
      preferences: [],
      events: [],
      metrics: emptyMetrics(),
    };

    this.traces.set(trace.trace_id, trace);
    this.traceByExecution.set(trace.execution_id, trace.trace_id);
    this.latestTraceId = trace.trace_id;
    this.recordEvent(trace.execution_id, "SYSTEM", "system.activated", {
      activation_source: "SERVER_WORKFLOW_KERNEL",
      requested_scope_key: input.requested_scope_key,
      intent_status: "NOT_OBSERVED",
    });
    return this.snapshot(trace);
  }

  getTrace(traceId: string): CognitionTrace | null {
    const trace = this.traces.get(traceId);
    return trace ? this.snapshot(trace) : null;
  }

  getTraceByExecution(executionId: string): CognitionTrace | null {
    const traceId = this.traceByExecution.get(executionId);
    return traceId ? this.getTrace(traceId) : null;
  }

  getLatestTrace(): CognitionTrace | null {
    return this.latestTraceId ? this.getTrace(this.latestTraceId) : null;
  }

  setStatus(executionId: string, status: CognitionTraceStatus, completedAt: string | null = null): void {
    const trace = this.requireTraceByExecution(executionId);
    trace.status = status;
    if (completedAt) trace.completed_at = completedAt;
  }

  recordIntent(executionId: string, input: RecordIntentInput): void {
    const trace = this.requireTraceByExecution(executionId);
    const observedAt = new Date().toISOString();
    trace.intent = {
      status: input.ambiguous ? "AMBIGUOUS" : "DETECTED",
      primary_intent: input.primary_intent,
      confidence: input.confidence,
      signals: [...(input.signals ?? [])],
      observed_at: observedAt,
    };
    this.recordEvent(executionId, "INTENT", "intent.detected", {
      primary_intent: input.primary_intent,
      confidence: input.confidence,
      ambiguous: input.ambiguous ?? false,
      signal_count: input.signals?.length ?? 0,
    });
  }

  recordScopeResolution(executionId: string, input: RecordScopeResolutionInput): void {
    const trace = this.requireTraceByExecution(executionId);
    const observedAt = new Date().toISOString();
    trace.scope_resolution = {
      status: input.status,
      requested_scope_key: trace.scope_resolution.requested_scope_key,
      resolved_scope_key: input.resolved_scope_key,
      reason: input.reason,
      observed_at: observedAt,
    };
    this.recordEvent(executionId, "SCOPE", "scope.resolved", {
      status: input.status,
      requested_scope_key: trace.scope_resolution.requested_scope_key,
      resolved_scope_key: input.resolved_scope_key,
      reason: input.reason,
    });
  }

  recordAuthority(executionId: string, input: RecordAuthorityInput): void {
    const trace = this.requireTraceByExecution(executionId);
    const observation = {
      authority_id: crypto.randomUUID(),
      subject: input.subject,
      system: input.system,
      authority_role: input.authority_role,
      reason: input.reason,
      observed_at: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    trace.authority_resolutions.push(observation);
    this.recordEvent(executionId, "AUTHORITY", "authority.resolved", {
      authority_id: observation.authority_id,
      subject: input.subject,
      system: input.system,
      authority_role: input.authority_role,
      reason: input.reason,
    });
  }

  recordSourceRead(executionId: string, input: RecordSourceReadInput): void {
    const trace = this.requireTraceByExecution(executionId);
    const observation = {
      read_id: crypto.randomUUID(),
      system: input.system,
      resource: input.resource,
      purpose: input.purpose,
      authority_role: input.authority_role,
      operation: "READ" as const,
      result: input.result,
      latency_ms: input.latency_ms ?? null,
      observed_at: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    trace.source_reads.push(observation);
    this.recordEvent(executionId, "SOURCE", "source.read", {
      read_id: observation.read_id,
      system: input.system,
      resource: input.resource,
      purpose: input.purpose,
      authority_role: input.authority_role,
      result: input.result,
      latency_ms: observation.latency_ms,
    });
  }

  recordPacket(executionId: string, input: RecordPacketInput): string {
    const trace = this.requireTraceByExecution(executionId);
    const packetId = input.packet_id ?? crypto.randomUUID();
    trace.packets.push({
      packet_id: packetId,
      status: input.status,
      scope_key: input.scope_key,
      created_at: new Date().toISOString(),
      candidate_items: input.candidate_items ?? null,
      included_items: input.included_items ?? null,
      rejected_stale: input.rejected_stale ?? null,
      rejected_scope: input.rejected_scope ?? null,
      token_estimate: input.token_estimate ?? null,
      sources: [...(input.sources ?? [])],
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    this.recordEvent(executionId, "PACKET", `packet.${input.status.toLowerCase()}`, {
      packet_id: packetId,
      scope_key: input.scope_key,
      candidate_items: input.candidate_items ?? null,
      included_items: input.included_items ?? null,
      sources: input.sources ?? [],
    });
    return packetId;
  }

  recordPreference(executionId: string, input: RecordPreferenceInput): void {
    const trace = this.requireTraceByExecution(executionId);
    trace.preferences.push({
      preference_id: input.preference_id,
      status: input.status,
      source: input.source,
      reason: input.reason,
      observed_at: new Date().toISOString(),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
    this.recordEvent(executionId, "PREFERENCE", `preference.${input.status.toLowerCase()}`, {
      preference_id: input.preference_id,
      source: input.source,
      reason: input.reason,
    });
  }

  recordEvent(
    executionId: string,
    category: ObservabilityCategory,
    eventType: string,
    data?: ObservabilityJson,
  ): void {
    const trace = this.requireTraceByExecution(executionId);
    trace.events.push({
      event_id: crypto.randomUUID(),
      trace_id: trace.trace_id,
      execution_id: executionId,
      category,
      event_type: eventType,
      sequence: trace.events.length + 1,
      emitted_at: new Date().toISOString(),
      ...(data ? { data } : {}),
    });
    this.refreshMetrics(trace);
  }

  emitter(executionId: string): WorkflowObservationEmitter {
    return {
      intent: (observation) => this.recordIntent(executionId, observation),
      scope: (observation) => this.recordScopeResolution(executionId, observation),
      authority: (observation) => this.recordAuthority(executionId, observation),
      sourceRead: (observation) => this.recordSourceRead(executionId, observation),
      packet: (observation) => this.recordPacket(executionId, observation),
      preference: (observation) => this.recordPreference(executionId, observation),
      event: (category, eventType, data) => this.recordEvent(executionId, category, eventType, data),
    };
  }

  private refreshMetrics(trace: CognitionTrace): void {
    const bySystem: Partial<Record<SourceSystem, number>> = {};
    for (const read of trace.source_reads) bySystem[read.system] = (bySystem[read.system] ?? 0) + 1;
    trace.metrics = {
      event_count: trace.events.length,
      source_read_count: trace.source_reads.length,
      source_reads_by_system: bySystem,
      packet_count: trace.packets.length,
      preference_applied_count: trace.preferences.filter((item) => item.status === "APPLIED").length,
      preference_conflict_count: trace.preferences.filter((item) => item.status === "CONFLICT").length,
    };
  }

  private requireTraceByExecution(executionId: string): CognitionTrace {
    const traceId = this.traceByExecution.get(executionId);
    const trace = traceId ? this.traces.get(traceId) : undefined;
    if (!trace) throw new Error(`Cognition trace not found for execution '${executionId}'.`);
    return trace;
  }

  private snapshot(trace: CognitionTrace): CognitionTrace {
    return structuredClone(trace);
  }
}

type TraceStoreGlobal = typeof globalThis & { __aiKnowledgeCognitionTraceStore?: CognitionTraceStore };
const traceStoreGlobal = globalThis as TraceStoreGlobal;

export const cognitionTraceStore = traceStoreGlobal.__aiKnowledgeCognitionTraceStore ??= new CognitionTraceStore();
