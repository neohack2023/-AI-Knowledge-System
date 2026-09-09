import type { ContextProvenanceEmission, ProvenanceExecutionBinding } from "../provenance/types.ts";
import {
  assertSameContinuityBoundary,
  assertValidProcessedContextWindow,
  processedContextRebaseReasons,
  type ProcessedContextRebaseReason,
  type ProcessedContextWindow,
  type ProcessedContextWorkingItem,
  type ProcessedContextWorkingState,
} from "../../shared/processed-context-window.ts";

export type ProcessedContextEvent = {
  event_id: string;
  session_id: string;
  scope_key: string;
  continuity_id: string;
  event_fingerprint: string;
  provenance_envelope_ids: string[];
  retrieval_execution_ids: string[];
  source_units: number;
  context_units: number;
  working_state_delta?: Partial<ProcessedContextWorkingState>;
};

export type RebaseSignal = {
  reason: ProcessedContextRebaseReason;
  source_pointer_id?: string | null;
  detail?: string | null;
};

export type FoldProcessedContextInput = {
  previous: ProcessedContextWindow;
  events: ProcessedContextEvent[];
  generated_at?: string;
  context_units_after: number;
  rebase_signals?: RebaseSignal[];
};

export type FreshProcessedContextInput = {
  scope_key: string;
  continuity_id: string;
  session_ids: string[];
  first_event_id: string | null;
  through_event_id: string | null;
  event_fingerprints: string[];
  provenance_envelope_ids: string[];
  retrieval_execution_ids: string[];
  source_units_processed: number;
  context_units_before: number;
  context_units_after: number;
  working_state: ProcessedContextWorkingState;
  generated_at?: string;
};

const dedupe = <T>(values: T[]): T[] => [...new Set(values)];

const mergeItems = (
  previous: ProcessedContextWorkingItem[],
  next: ProcessedContextWorkingItem[] | undefined,
): ProcessedContextWorkingItem[] => {
  if (!next) return structuredClone(previous);
  const byId = new Map(previous.map((item) => [item.item_id, structuredClone(item)]));
  for (const item of next) byId.set(item.item_id, structuredClone(item));
  return [...byId.values()];
};

const mergeWorkingState = (
  previous: ProcessedContextWorkingState,
  delta?: Partial<ProcessedContextWorkingState>,
): ProcessedContextWorkingState => ({
  active_intent: delta?.active_intent === undefined ? previous.active_intent : delta.active_intent,
  current_goal: delta?.current_goal === undefined ? previous.current_goal : delta.current_goal,
  current_phase: delta?.current_phase === undefined ? previous.current_phase : delta.current_phase,
  established_working_state: mergeItems(previous.established_working_state, delta?.established_working_state),
  active_decisions: mergeItems(previous.active_decisions, delta?.active_decisions),
  active_constraints: mergeItems(previous.active_constraints, delta?.active_constraints),
  artifacts_in_play: mergeItems(previous.artifacts_in_play, delta?.artifacts_in_play),
  open_questions: mergeItems(previous.open_questions, delta?.open_questions),
  unresolved_conflicts: mergeItems(previous.unresolved_conflicts, delta?.unresolved_conflicts),
  pending_next_steps: mergeItems(previous.pending_next_steps, delta?.pending_next_steps),
  recently_relevant_entities: mergeItems(previous.recently_relevant_entities, delta?.recently_relevant_entities),
});

export const emptyWorkingState = (): ProcessedContextWorkingState => ({
  active_intent: null,
  current_goal: null,
  current_phase: null,
  established_working_state: [],
  active_decisions: [],
  active_constraints: [],
  artifacts_in_play: [],
  open_questions: [],
  unresolved_conflicts: [],
  pending_next_steps: [],
  recently_relevant_entities: [],
});

export const shouldCreateProcessedContext = (input: {
  context_budget_pressure: boolean;
  material_state_transition: boolean;
  continuity_boundary: boolean;
  validity_event: boolean;
}): boolean => (
  input.context_budget_pressure
  || input.material_state_transition
  || input.continuity_boundary
  || input.validity_event
);

export const createFreshProcessedContextWindow = (
  input: FreshProcessedContextInput,
): ProcessedContextWindow => {
  const window: ProcessedContextWindow = {
    schema_name: "ProcessedContextWindow",
    schema_version: "0.1-candidate",
    identity: {
      object_id: crypto.randomUUID(),
      window_version: 1,
      continuity_id: input.continuity_id,
      scope_key: input.scope_key,
      lifecycle_state: "CURRENT",
    },
    lineage: {
      previous_window_id: null,
      rebase_root_window_id: null,
      source_session_ids: dedupe(input.session_ids),
      source_cursor: {
        first_event_id: input.first_event_id,
        through_event_id: input.through_event_id,
      },
      source_event_fingerprints: dedupe(input.event_fingerprints),
      provenance_envelope_ids: dedupe(input.provenance_envelope_ids),
      retrieval_execution_ids: dedupe(input.retrieval_execution_ids),
    },
    working_state: structuredClone(input.working_state),
    source_pointers: [],
    authority: {
      authority_state: "DERIVED",
      derived_context_only: true,
      creates_authority: false,
      promotes_memory: false,
      authorizes_write: false,
      write_authorization: "NONE",
    },
    freshness: {
      generated_at: input.generated_at ?? new Date().toISOString(),
      source_watermark: input.through_event_id,
      dependency_states: [],
      revalidation_required: [],
      supersession_check_result: "NOT_CHECKED",
      validity: "VALID",
    },
    compression: {
      source_units_processed: input.source_units_processed,
      previous_window_folded: false,
      context_units_before: input.context_units_before,
      context_units_after: input.context_units_after,
      generation_depth: 0,
      coverage_check: "PASS",
      compression_loss_detected: false,
      rebase_required: false,
      rebase_reason_codes: [],
    },
  };
  assertValidProcessedContextWindow(window);
  return window;
};

export const foldProcessedContextWindow = (input: FoldProcessedContextInput): ProcessedContextWindow => {
  const { previous, events } = input;
  if (events.length === 0) throw new Error("PROCESSED_CONTEXT_EMPTY_DELTA");

  for (const event of events) {
    if (event.scope_key !== previous.identity.scope_key) throw new Error("PROCESSED_CONTEXT_SCOPE_MISMATCH");
    if (event.continuity_id !== previous.identity.continuity_id) throw new Error("PROCESSED_CONTEXT_CONTINUITY_MISMATCH");
  }

  let workingState = structuredClone(previous.working_state);
  for (const event of events) workingState = mergeWorkingState(workingState, event.working_state_delta);

  const rebaseReasons = dedupe((input.rebase_signals ?? []).map((signal) => signal.reason));
  const compressionLoss = rebaseReasons.includes("COMPRESSION_COVERAGE_LOSS");
  const validity = rebaseReasons.some((reason) => [
    "SCOPE_MISMATCH",
    "LINEAGE_DISCONTINUITY",
    "CURSOR_DISCONTINUITY",
    "PROTECTED_FIELD_MUTATION",
  ].includes(reason)) ? "INVALID" : rebaseReasons.length ? "DEGRADED" : "VALID";

  const candidate: ProcessedContextWindow = {
    ...structuredClone(previous),
    identity: {
      ...structuredClone(previous.identity),
      object_id: crypto.randomUUID(),
      window_version: previous.identity.window_version + 1,
      lifecycle_state: "CURRENT",
    },
    lineage: {
      previous_window_id: previous.identity.object_id,
      rebase_root_window_id: previous.lineage.rebase_root_window_id,
      source_session_ids: dedupe([
        ...previous.lineage.source_session_ids,
        ...events.map((event) => event.session_id),
      ]),
      source_cursor: {
        first_event_id: previous.lineage.source_cursor.first_event_id ?? events[0]?.event_id ?? null,
        through_event_id: events.at(-1)?.event_id ?? previous.lineage.source_cursor.through_event_id,
      },
      source_event_fingerprints: dedupe([
        ...previous.lineage.source_event_fingerprints,
        ...events.map((event) => event.event_fingerprint),
      ]),
      provenance_envelope_ids: dedupe([
        ...previous.lineage.provenance_envelope_ids,
        ...events.flatMap((event) => event.provenance_envelope_ids),
      ]),
      retrieval_execution_ids: dedupe([
        ...previous.lineage.retrieval_execution_ids,
        ...events.flatMap((event) => event.retrieval_execution_ids),
      ]),
    },
    working_state: workingState,
    freshness: {
      ...structuredClone(previous.freshness),
      generated_at: input.generated_at ?? new Date().toISOString(),
      source_watermark: events.at(-1)?.event_id ?? previous.freshness.source_watermark,
      validity,
    },
    compression: {
      source_units_processed: events.reduce((sum, event) => sum + event.source_units, 0),
      previous_window_folded: true,
      context_units_before: events.reduce((sum, event) => sum + event.context_units, 0),
      context_units_after: input.context_units_after,
      generation_depth: previous.compression.generation_depth + 1,
      coverage_check: compressionLoss ? "FAIL" : "PASS",
      compression_loss_detected: compressionLoss,
      rebase_required: rebaseReasons.length > 0,
      rebase_reason_codes: rebaseReasons,
    },
  };

  assertSameContinuityBoundary(previous, candidate);
  assertValidProcessedContextWindow(candidate);
  return candidate;
};

export const decideRebase = (signals: RebaseSignal[]): {
  rebase_required: boolean;
  reason_codes: ProcessedContextRebaseReason[];
} => {
  const reasonCodes = dedupe(signals.map((signal) => signal.reason));
  for (const reason of reasonCodes) {
    if (!processedContextRebaseReasons.includes(reason)) throw new Error(`UNKNOWN_REBASE_REASON:${reason}`);
  }
  return { rebase_required: reasonCodes.length > 0, reason_codes: reasonCodes };
};

export const rebaseProcessedContextWindow = (input: FreshProcessedContextInput & {
  previous: ProcessedContextWindow;
  reason_codes: ProcessedContextRebaseReason[];
}): ProcessedContextWindow => {
  if (input.scope_key !== input.previous.identity.scope_key) throw new Error("PROCESSED_CONTEXT_SCOPE_MISMATCH");
  if (input.continuity_id !== input.previous.identity.continuity_id) throw new Error("PROCESSED_CONTEXT_CONTINUITY_MISMATCH");
  if (input.reason_codes.length === 0) throw new Error("PROCESSED_CONTEXT_REBASE_REASON_REQUIRED");

  const rebased = createFreshProcessedContextWindow(input);
  rebased.identity.window_version = input.previous.identity.window_version + 1;
  rebased.identity.lifecycle_state = "REBASED";
  rebased.lineage.previous_window_id = input.previous.identity.object_id;
  rebased.lineage.rebase_root_window_id = rebased.identity.object_id;
  rebased.compression.rebase_required = false;
  rebased.compression.rebase_reason_codes = [...input.reason_codes];
  rebased.compression.generation_depth = 0;
  assertSameContinuityBoundary(input.previous, rebased);
  assertValidProcessedContextWindow(rebased);
  return rebased;
};

export const buildProcessedContextProvenanceEmission = (
  binding: ProvenanceExecutionBinding,
  window: ProcessedContextWindow,
  parentEvidenceIds: string[],
): { binding: ProvenanceExecutionBinding; emission: ContextProvenanceEmission } => {
  if (binding.scope_key !== window.identity.scope_key) throw new Error("PROCESSED_CONTEXT_PROVENANCE_SCOPE_MISMATCH");
  if (parentEvidenceIds.length === 0) throw new Error("PROCESSED_CONTEXT_PROVENANCE_PARENT_REQUIRED");

  const sourceFingerprint = window.lineage.source_event_fingerprints.join(":") || "pcw:no-source-fingerprint";
  const objectFingerprint = JSON.stringify({
    object_id: window.identity.object_id,
    version: window.identity.window_version,
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    watermark: window.freshness.source_watermark,
  });

  return {
    binding,
    emission: {
      object_id: window.identity.object_id,
      object_type: "ProcessedContextWindow",
      operation: "TRANSFORMATION",
      epistemic_type: "OBSERVATION",
      source_system: "AIOS_RUNTIME",
      source_id: window.identity.continuity_id,
      source_version: String(window.identity.window_version),
      source_fingerprint: sourceFingerprint,
      object_fingerprint: objectFingerprint,
      parent_evidence_ids: [...parentEvidenceIds],
      transform_chain: [{
        activity_id: crypto.randomUUID(),
        activity_type: window.identity.lifecycle_state === "REBASED" ? "PROCESSED_CONTEXT_REBASE" : "PROCESSED_CONTEXT_FOLD",
        executor: "ProcessedContextService",
        input_evidence_ids: [...parentEvidenceIds],
        completed_at: window.freshness.generated_at,
      }],
      authority_owner: "AIOS_RUNTIME",
      authority_domain: "derived-continuity",
      authority_state: "DERIVED",
      authority_conflict_state: window.working_state.unresolved_conflicts.length ? "UNRESOLVED" : "NONE",
      confidence: null,
      access_policy_refs: ["SCOPE_ROUTER_RESOLUTION_POLICY", "CONTEXT_ENVELOPE_CONTRACT"],
      write_policy_refs: ["STONE_MASON_ONLY"],
      write_authorized: false,
    },
  };
};
