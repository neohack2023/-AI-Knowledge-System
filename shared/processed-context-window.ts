export const processedContextLifecycleStates = [
  "CURRENT",
  "SUPERSEDED",
  "INVALID",
  "REBASED",
] as const;
export type ProcessedContextLifecycleState = (typeof processedContextLifecycleStates)[number];

export const processedContextValidityStates = ["VALID", "DEGRADED", "INVALID"] as const;
export type ProcessedContextValidityState = (typeof processedContextValidityStates)[number];

export const processedContextRebaseReasons = [
  "SOURCE_FINGERPRINT_MISMATCH",
  "SCOPE_MISMATCH",
  "LINEAGE_DISCONTINUITY",
  "CURSOR_DISCONTINUITY",
  "AUTHORITY_CHANGE",
  "SUPERSESSION",
  "STALE_DEPENDENCY",
  "UNRESOLVED_AUTHORITY_CONFLICT",
  "PROTECTED_FIELD_MUTATION",
  "COMPRESSION_COVERAGE_LOSS",
  "GENERATION_DEPTH_POLICY",
  "FORCED_REBASE",
] as const;
export type ProcessedContextRebaseReason = (typeof processedContextRebaseReasons)[number];

export type ProcessedContextPointer = {
  pointer_id: string;
  source_system: string;
  source_id: string;
  source_version: string | null;
  source_fingerprint: string;
  authority_owner: string;
  authority_domain: string;
  authority_state: "AUTHORITATIVE" | "NON_AUTHORITATIVE" | "SHADOW" | "DERIVED" | "UNKNOWN";
};

export type ProcessedContextDependencyState = {
  source_pointer_id: string;
  freshness_requirement: string | null;
  last_validated_version: string | null;
  current_state: "FRESH" | "STALE" | "UNKNOWN" | "CONFLICTED" | "SUPERSEDED";
  revalidation_reason: string | null;
};

export type ProcessedContextWorkingItem = {
  item_id: string;
  kind:
    | "ESTABLISHED_STATE"
    | "DECISION"
    | "CONSTRAINT"
    | "ARTIFACT"
    | "OPEN_QUESTION"
    | "UNRESOLVED_CONFLICT"
    | "NEXT_STEP"
    | "ENTITY";
  summary: string;
  source_pointer_ids: string[];
  provenance_envelope_ids: string[];
  authority_dependency_ids: string[];
  validation_state: "VALID" | "REVALIDATION_REQUIRED" | "UNRESOLVED" | "INVALID";
  carried_forward_from: string | null;
  requires_revalidation: boolean;
};

export type ProcessedContextWorkingState = {
  active_intent: string | null;
  current_goal: string | null;
  current_phase: string | null;
  established_working_state: ProcessedContextWorkingItem[];
  active_decisions: ProcessedContextWorkingItem[];
  active_constraints: ProcessedContextWorkingItem[];
  artifacts_in_play: ProcessedContextWorkingItem[];
  open_questions: ProcessedContextWorkingItem[];
  unresolved_conflicts: ProcessedContextWorkingItem[];
  pending_next_steps: ProcessedContextWorkingItem[];
  recently_relevant_entities: ProcessedContextWorkingItem[];
};

export type ProcessedContextWindow = {
  schema_name: "ProcessedContextWindow";
  schema_version: "0.1-candidate";
  identity: {
    object_id: string;
    window_version: number;
    continuity_id: string;
    scope_key: string;
    lifecycle_state: ProcessedContextLifecycleState;
  };
  lineage: {
    previous_window_id: string | null;
    rebase_root_window_id: string | null;
    source_session_ids: string[];
    source_cursor: {
      first_event_id: string | null;
      through_event_id: string | null;
    };
    source_event_fingerprints: string[];
    provenance_envelope_ids: string[];
    retrieval_execution_ids: string[];
  };
  working_state: ProcessedContextWorkingState;
  source_pointers: ProcessedContextPointer[];
  authority: {
    authority_state: "DERIVED";
    derived_context_only: true;
    creates_authority: false;
    promotes_memory: false;
    authorizes_write: false;
    write_authorization: "NONE";
  };
  freshness: {
    generated_at: string;
    source_watermark: string | null;
    dependency_states: ProcessedContextDependencyState[];
    revalidation_required: string[];
    supersession_check_result: "NOT_CHECKED" | "NO_CHANGE" | "SUPERSEDED" | "CONFLICT";
    validity: ProcessedContextValidityState;
  };
  compression: {
    source_units_processed: number;
    previous_window_folded: boolean;
    context_units_before: number;
    context_units_after: number;
    generation_depth: number;
    coverage_check: "PASS" | "FAIL" | "NOT_RUN";
    compression_loss_detected: boolean;
    rebase_required: boolean;
    rebase_reason_codes: ProcessedContextRebaseReason[];
  };
};

export type ProtectedProcessedContextState = Pick<ProcessedContextWindow, "schema_name" | "schema_version"> & {
  object_id: string;
  window_version: number;
  continuity_id: string;
  scope_key: string;
  previous_window_id: string | null;
  rebase_root_window_id: string | null;
  source_session_ids: string[];
  source_event_fingerprints: string[];
  provenance_envelope_ids: string[];
  retrieval_execution_ids: string[];
  authority: ProcessedContextWindow["authority"];
  lifecycle_state: ProcessedContextLifecycleState;
  supersession_check_result: ProcessedContextWindow["freshness"]["supersession_check_result"];
};

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const protectedStateOf = (window: ProcessedContextWindow): ProtectedProcessedContextState => ({
  schema_name: window.schema_name,
  schema_version: window.schema_version,
  object_id: window.identity.object_id,
  window_version: window.identity.window_version,
  continuity_id: window.identity.continuity_id,
  scope_key: window.identity.scope_key,
  previous_window_id: window.lineage.previous_window_id,
  rebase_root_window_id: window.lineage.rebase_root_window_id,
  source_session_ids: [...window.lineage.source_session_ids],
  source_event_fingerprints: [...window.lineage.source_event_fingerprints],
  provenance_envelope_ids: [...window.lineage.provenance_envelope_ids],
  retrieval_execution_ids: [...window.lineage.retrieval_execution_ids],
  authority: structuredClone(window.authority),
  lifecycle_state: window.identity.lifecycle_state,
  supersession_check_result: window.freshness.supersession_check_result,
});

export const validateProcessedContextWindow = (window: ProcessedContextWindow): string[] => {
  const issues: string[] = [];
  if (window.schema_name !== "ProcessedContextWindow") issues.push('schema_name must be "ProcessedContextWindow".');
  if (window.schema_version !== "0.1-candidate") issues.push('schema_version must be "0.1-candidate".');
  if (!nonEmpty(window.identity.object_id)) issues.push("identity.object_id is required.");
  if (!Number.isInteger(window.identity.window_version) || window.identity.window_version < 1) {
    issues.push("identity.window_version must be a positive integer.");
  }
  if (!nonEmpty(window.identity.continuity_id)) issues.push("identity.continuity_id is required.");
  if (!nonEmpty(window.identity.scope_key)) issues.push("identity.scope_key is required.");
  if (!processedContextLifecycleStates.includes(window.identity.lifecycle_state)) {
    issues.push("identity.lifecycle_state is invalid.");
  }
  if (window.authority.authority_state !== "DERIVED") issues.push("authority.authority_state must remain DERIVED.");
  if (!window.authority.derived_context_only) issues.push("authority.derived_context_only must remain true.");
  if (window.authority.creates_authority) issues.push("authority.creates_authority must remain false.");
  if (window.authority.promotes_memory) issues.push("authority.promotes_memory must remain false.");
  if (window.authority.authorizes_write) issues.push("authority.authorizes_write must remain false.");
  if (window.authority.write_authorization !== "NONE") issues.push("authority.write_authorization must remain NONE.");
  if (!processedContextValidityStates.includes(window.freshness.validity)) issues.push("freshness.validity is invalid.");
  if (window.compression.context_units_before < 0 || window.compression.context_units_after < 0) {
    issues.push("compression context units must be non-negative.");
  }
  if (window.compression.context_units_after > window.compression.context_units_before && window.compression.source_units_processed > 0) {
    issues.push("compression context_units_after must not exceed context_units_before for a compression event.");
  }
  if (window.compression.generation_depth < 0 || !Number.isInteger(window.compression.generation_depth)) {
    issues.push("compression.generation_depth must be a non-negative integer.");
  }
  if (window.compression.rebase_required && window.compression.rebase_reason_codes.length === 0) {
    issues.push("rebase_required requires at least one rebase reason.");
  }
  if (window.compression.compression_loss_detected && !window.compression.rebase_required) {
    issues.push("compression loss must require rebase.");
  }

  const pointerIds = new Set(window.source_pointers.map((pointer) => pointer.pointer_id));
  for (const dependency of window.freshness.dependency_states) {
    if (!pointerIds.has(dependency.source_pointer_id)) {
      issues.push(`dependency references unknown source pointer: ${dependency.source_pointer_id}.`);
    }
  }

  const unresolved = window.working_state.unresolved_conflicts;
  if (unresolved.some((item) => item.validation_state === "VALID")) {
    issues.push("unresolved_conflicts cannot contain VALID items.");
  }

  return issues;
};

export class ProcessedContextValidationError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

export const assertValidProcessedContextWindow = (window: ProcessedContextWindow): void => {
  const issues = validateProcessedContextWindow(window);
  if (issues.length) throw new ProcessedContextValidationError("PROCESSED_CONTEXT_INVALID", issues);
};

export const assertSameContinuityBoundary = (
  previous: ProcessedContextWindow,
  candidate: ProcessedContextWindow,
): void => {
  const issues: string[] = [];
  if (previous.identity.scope_key !== candidate.identity.scope_key) issues.push("scope_key changed across a rolling update.");
  if (previous.identity.continuity_id !== candidate.identity.continuity_id) issues.push("continuity_id changed across a rolling update.");
  if (candidate.lineage.previous_window_id !== previous.identity.object_id) issues.push("previous_window_id does not match predecessor.");
  if (candidate.identity.window_version !== previous.identity.window_version + 1) issues.push("window_version must increment by exactly one.");
  if (issues.length) throw new ProcessedContextValidationError("PROCESSED_CONTEXT_BOUNDARY_MISMATCH", issues);
};
