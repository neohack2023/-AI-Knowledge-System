import { capabilityDiscoveryRuntime } from "../capabilities/index.ts";
import { retrieveRepositoryContext } from "./repository-source.ts";
import { resolveRegisteredScope, ScopeResolutionError } from "./scope-router.ts";
import type {
  ContextPacket,
  ExecuteVerticalSliceRequest,
  RuntimeStageTiming,
  VerticalSliceTrace,
} from "./types.ts";

const encoder = new TextEncoder();
const elapsed = (started: number, now: () => number) => Number((now() - started).toFixed(3));

export class VerticalSliceError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400) {
    super(message);
  }
}

export class VerticalSliceRuntime {
  private readonly traces = new Map<string, VerticalSliceTrace>();

  constructor(
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly timer: () => number = () => performance.now(),
  ) {}

  list(limit = 25) {
    return [...this.traces.values()]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((trace) => structuredClone(trace));
  }

  get(traceId: string) {
    const trace = this.traces.get(traceId);
    if (!trace) throw new VerticalSliceError("TRACE_NOT_FOUND", "Runtime trace was not found.", 404);
    return structuredClone(trace);
  }

  async execute(request: ExecuteVerticalSliceRequest): Promise<VerticalSliceTrace> {
    if (!request.request_text?.trim()) throw new VerticalSliceError("REQUEST_TEXT_REQUIRED", "request_text is required.");
    if (!request.requested_scope?.trim()) throw new VerticalSliceError("REQUEST_SCOPE_REQUIRED", "requested_scope is required.");

    const totalStarted = this.timer();
    const trace: VerticalSliceTrace = {
      trace_id: crypto.randomUUID(),
      request_text: request.request_text.trim(),
      requested_scope: request.requested_scope.trim(),
      resolved_scope_key: null,
      capability_id: null,
      status: "RUNNING",
      created_at: this.clock(),
      completed_at: null,
      events: [],
      packet: null,
      result: null,
      receipt: null,
      error: null,
    };
    this.traces.set(trace.trace_id, trace);
    const timings: RuntimeStageTiming[] = [];
    const emit = (eventType: string, data: Record<string, unknown> = {}) => trace.events.push({
      event_id: crypto.randomUUID(),
      sequence: trace.events.length + 1,
      event_type: eventType,
      emitted_at: this.clock(),
      data,
    });

    try {
      emit("runtime.request.accepted", { requested_scope: trace.requested_scope });

      let started = this.timer();
      const scope = resolveRegisteredScope(trace.requested_scope);
      timings.push({ stage: "scope_resolution", latency_ms: elapsed(started, this.timer) });
      trace.resolved_scope_key = scope.resolved_scope_key;
      emit("scope.resolved", scope);

      if (scope.resolved_scope_key !== "global-working-memory") {
        throw new VerticalSliceError(
          "SOURCE_ADAPTER_UNAVAILABLE",
          `The first vertical slice is registered only for 'global-working-memory'; '${scope.resolved_scope_key}' resolved correctly but has no live source adapter.`,
          409,
        );
      }

      started = this.timer();
      const discovery = await capabilityDiscoveryRuntime.discover({
        execution_id: trace.trace_id,
        workflow_id: "repository-context-query",
        scope_key: scope.resolved_scope_key,
        mode: "LIVE",
        intent_class: "repository-context-retrieval",
        intent_text: trace.request_text,
        requested_capability_id: "cap:repository-context-retrieval",
        authority_domains: ["github-repository-execution-truth"],
      });
      timings.push({ stage: "capability_discovery", latency_ms: elapsed(started, this.timer) });
      if (discovery.envelope.resolution_state !== "MATCHED" || !discovery.envelope.recommended_capability_id) {
        throw new VerticalSliceError("CAPABILITY_NOT_AVAILABLE", "No eligible repository retrieval capability was discovered.", 409);
      }
      trace.capability_id = discovery.envelope.recommended_capability_id;
      emit("capability.discovered", {
        capability_id: trace.capability_id,
        considered: discovery.envelope.candidates_considered,
        rejected: discovery.envelope.rejected_candidates.length,
      });

      started = this.timer();
      const retrieval = retrieveRepositoryContext(scope.resolved_scope_key, trace.request_text, this.timer);
      timings.push({ stage: "source_retrieval", latency_ms: elapsed(started, this.timer) });
      emit("source.retrieved", {
        source_system: "GITHUB",
        candidates: retrieval.candidates,
        included: retrieval.included.length,
        rejected_objects: retrieval.rejected_objects,
        conflicts: retrieval.conflicts,
      });

      started = this.timer();
      const packetBase = {
        packet_id: crypto.randomUUID(),
        scope_key: scope.resolved_scope_key,
        query: trace.request_text,
        source_records: retrieval.included,
        source_count: retrieval.included.length,
        rejected_objects: retrieval.rejected_objects,
        conflicts: retrieval.conflicts,
        assembled_at: this.clock(),
      };
      const packetBytes = encoder.encode(JSON.stringify(packetBase)).byteLength;
      const packet: ContextPacket = {
        ...packetBase,
        packet_bytes: packetBytes,
        token_estimate: Math.ceil(packetBytes / 4),
      };
      trace.packet = packet;
      timings.push({ stage: "packet_assembly", latency_ms: elapsed(started, this.timer) });
      emit("context.packet.assembled", {
        packet_id: packet.packet_id,
        packet_bytes: packet.packet_bytes,
        token_estimate: packet.token_estimate,
      });

      started = this.timer();
      trace.result = {
        outcome: "COMPLETED",
        answer: packet.source_records.map((record) => ({
          title: record.title,
          finding: record.content,
          source_ref: record.source_ref,
        })),
        authority: "GITHUB_EXECUTION_TRUTH",
      };
      timings.push({ stage: "workflow_result", latency_ms: elapsed(started, this.timer) });
      emit("workflow.result.created", { findings: packet.source_count });

      trace.status = "COMPLETED";
      trace.completed_at = this.clock();
      trace.receipt = {
        receipt_id: crypto.randomUUID(),
        trace_id: trace.trace_id,
        outcome: "COMPLETED",
        total_latency_ms: elapsed(totalStarted, this.timer),
        stage_timings: timings,
        retrieved_sources: packet.source_count,
        source_reads: packet.source_records.map((record) => ({
          source_system: "GITHUB",
          resource_id: record.resource_id,
          source_ref: record.source_ref,
          latency_ms: retrieval.source_latency_ms,
          latency_basis: "BATCH_OBSERVED",
        })),
        packet_bytes: packet.packet_bytes,
        packet_tokens_estimate: packet.token_estimate,
        rejected_objects: packet.rejected_objects,
        conflicts: packet.conflicts,
        completed_at: trace.completed_at,
      };
      emit("performance.receipt.created", { receipt_id: trace.receipt.receipt_id });
      return structuredClone(trace);
    } catch (error) {
      const normalized = error instanceof VerticalSliceError
        ? error
        : error instanceof ScopeResolutionError
          ? new VerticalSliceError(error.code, error.message, 409)
          : new VerticalSliceError("VERTICAL_SLICE_FAILED", "The vertical slice failed.", 500);
      trace.status = "FAILED";
      trace.completed_at = this.clock();
      trace.error = { code: normalized.code, message: normalized.message };
      trace.receipt = {
        receipt_id: crypto.randomUUID(),
        trace_id: trace.trace_id,
        outcome: normalized.code === "SCOPE_NOT_REGISTERED" ? "NO_MATCH" : "FAILED",
        total_latency_ms: elapsed(totalStarted, this.timer),
        stage_timings: timings,
        retrieved_sources: trace.packet?.source_count ?? 0,
        source_reads: [],
        packet_bytes: trace.packet?.packet_bytes ?? 0,
        packet_tokens_estimate: trace.packet?.token_estimate ?? 0,
        rejected_objects: trace.packet?.rejected_objects ?? 0,
        conflicts: trace.packet?.conflicts ?? 0,
        completed_at: trace.completed_at,
      };
      emit("runtime.failed", { code: normalized.code });
      return structuredClone(trace);
    }
  }
}

const runtimeGlobal = globalThis as typeof globalThis & { __aiosVerticalSliceRuntime?: VerticalSliceRuntime };
export const verticalSliceRuntime = runtimeGlobal.__aiosVerticalSliceRuntime ??= new VerticalSliceRuntime();
