export const SPATIAL_WEB_SCOPE_KEY = "global-working-memory" as const;
export const SPATIAL_WEB_MEMORY_DESTINATION = "memory:spatial-web-systems" as const;

export const authorityStates = [
  "AUTHORITATIVE",
  "NON_AUTHORITATIVE",
  "DISPUTED",
  "SUPERSEDED",
] as const;
export type SpatialAuthorityState = (typeof authorityStates)[number];

export const epistemicTypes = [
  "CLAIM",
  "OBSERVATION",
  "ACTION_REQUEST",
  "ACTION_RESULT",
  "VERIFICATION",
  "DURABLE_FACT",
] as const;
export type SpatialEpistemicType = (typeof epistemicTypes)[number];

export const lifecycleStates = [
  "RESEARCH_PENDING",
  "CANDIDATE",
  "REVIEW",
  "ACCEPTED",
  "REJECTED",
  "SUPERSEDED",
  "ARCHIVED",
] as const;
export type SpatialLifecycleState = (typeof lifecycleStates)[number];

export const reviewTriggerTypes = [
  "ENGINE_MAJOR_VERSION_CHANGE",
  "BROWSER_SUPPORT_CHANGE",
  "WEB_STANDARD_CHANGE",
  "GPU_BACKEND_CHANGE",
  "DEVICE_CLASS_CHANGE",
  "PERFORMANCE_BUDGET_CHANGE",
  "SECURITY_ADVISORY",
  "SOURCE_SUPERSEDED",
  "PROJECT_CONSTRAINT_CHANGE",
  "MANUAL_REVIEW_DATE",
] as const;
export type ReviewTriggerType = (typeof reviewTriggerTypes)[number];

export type SourceReference = {
  source_system: string;
  source_id: string;
  source_version?: string | null;
  source_fingerprint?: string | null;
  source_url?: string | null;
  retrieved_at?: string | null;
};

export type ReviewTrigger = {
  trigger_type: ReviewTriggerType;
  condition: string;
  review_after?: string | null;
};

export type VersionContext = {
  engine?: string | null;
  engine_version?: string | null;
  browser?: string | null;
  browser_version?: string | null;
  web_api?: string | null;
  web_api_version?: string | null;
  operating_system?: string | null;
  gpu?: string | null;
  backend?: string | null;
};

export type ResearchIndexRecord = {
  research_id: string;
  title: string;
  summary?: string;
  research_track: string;
  scope_key: string;
  applicable_project_scopes?: string[];
  lifecycle_state: SpatialLifecycleState;
  authority_state: SpatialAuthorityState;
  epistemic_type: SpatialEpistemicType;
  disclosure: {
    l0: string;
    l1_ref: string | null;
    l2_refs: string[];
  };
  source_refs: SourceReference[];
  version_context?: VersionContext;
  review_triggers: ReviewTrigger[];
  related_asset_refs?: string[];
  promotion_state: "NOT_EVALUATED" | "STONE_CANDIDATE" | "STONE_REJECTED" | "MASON_PENDING" | "PROMOTED";
  promoted_memory_id?: string | null;
};

export type SpatialMemoryCardRecord = {
  memory_id: string;
  title: string;
  memory_class: string;
  scope_key: string;
  authority_state: SpatialAuthorityState;
  epistemic_type: SpatialEpistemicType;
  applicability: {
    engines: string[];
    backends: string[];
    project_classes: string[];
    trigger_conditions: string[];
    exclusions?: string[];
  };
  rule: {
    statement: string;
    conditions: string[];
    exceptions: string[];
    failure_symptoms?: string[];
    recommended_action?: string;
  };
  evidence_refs: string[];
  confidence: number;
  promotion_receipt_id: string;
  promotion_receipt_binding: {
    mason_episode_id: string;
    write_plan_id: string;
    authorization_id: string;
    scope_key: string;
    destination: string;
    promotion_target_id: string;
    receipt_fingerprint: string;
  };
  supersedes?: string | null;
  review_triggers: ReviewTrigger[];
  l0_summary?: string;
  l1_operational_ref?: string | null;
  l2_evidence_refs?: string[];
};

export type EngineProfileRecord = {
  profile_id: string;
  engine_name: string;
  engine_version_range?: string | null;
  profile_version: string;
  lifecycle_state: SpatialLifecycleState;
  authority_state: SpatialAuthorityState;
  epistemic_type: SpatialEpistemicType;
  stack_type?: string;
  capability_claims: Array<{
    claim: string;
    evidence_state: "UNVERIFIED" | "SOURCE_BACKED" | "EXPERIMENT_BACKED" | "REPEATED_VALIDATION";
    evidence_refs?: string[];
  }>;
  compatibility?: {
    rendering_backends?: string[];
    browser_targets?: string[];
    device_classes?: string[];
    fallbacks?: string[];
    known_constraints?: string[];
  };
  selection_signals?: {
    favorable_when?: string[];
    unfavorable_when?: string[];
    requires_project_decision: true;
  };
  evidence_refs: string[];
  review_triggers: ReviewTrigger[];
  global_preferred?: boolean;
};

export type ExperimentRecord = {
  experiment_id: string;
  hypothesis: string;
  scope_key: string;
  project_scope: string;
  execution_mode: "SIMULATION" | "REPLAY" | "BOUNDED_LIVE";
  authority_state: SpatialAuthorityState;
  epistemic_type: SpatialEpistemicType;
  environment: {
    timestamp: string;
    browser: string;
    browser_version?: string | null;
    operating_system: string;
    device_class: string;
    gpu: string;
    driver?: string | null;
    backend: string;
    engine?: string | null;
    engine_version?: string | null;
    application_commit?: string | null;
  };
  controlled_inputs?: Record<string, unknown>;
  procedure: string[];
  observations: Array<{
    metric_or_event: string;
    value: unknown;
    unit?: string | null;
    epistemic_type: "ACTION_RESULT" | "OBSERVATION" | "VERIFICATION";
  }>;
  outcome: "SUPPORTED" | "NOT_SUPPORTED" | "INCONCLUSIVE" | "BLOCKED" | "FAILED";
  limitations?: string[];
  artifact_refs: string[];
  execution_receipt_id: string;
  follow_up?: string[];
  promotion_state: "NOT_EVALUATED";
};

export type MasonPromotionReceipt = {
  receipt_id: string;
  verified: boolean;
  write_authorized: boolean;
  scope_key: string;
  destination: string;
  promotion_target_id: string;
  mason_episode_id: string;
  write_plan_id: string;
  authorization_id: string;
  receipt_fingerprint: string;
  source_research_ids: string[];
};

export type PromotionReceiptResolver = (receiptId: string) => MasonPromotionReceipt | null;

export const validationErrorCodes = [
  "REQUIRED_FIELD",
  "INVALID_ID",
  "INVALID_SCOPE",
  "AUTHORITY_STATE_VIOLATION",
  "EPISTEMIC_TYPE_VIOLATION",
  "INVALID_PROMOTION_STATE",
  "VERSIONED_CLAIM_REQUIRES_REVIEW_TRIGGER",
  "EMBEDDED_ASSET_FORBIDDEN",
  "INVALID_REFERENCE",
  "MISSING_MASON_PROMOTION_RECEIPT",
  "UNVERIFIED_MASON_PROMOTION_RECEIPT",
  "UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION",
  "PROJECT_SCOPE_REQUIRED",
  "GLOBAL_ENGINE_PREFERENCE_FORBIDDEN",
  "INVALID_DISCLOSURE",
  "UNKNOWN_RECORD_TYPE",
] as const;
export type ValidationErrorCode = (typeof validationErrorCodes)[number];

export type ValidationIssue = {
  code: ValidationErrorCode;
  path: string;
  message: string;
};

export type ValidationResult<T> = {
  valid: boolean;
  errors: ValidationIssue[];
  value: T | null;
};

export type SpatialRecordType = "research_index" | "spatial_memory_card" | "engine_profile" | "experiment_record";

export type SpatialPacketSignal = "WEBGPU" | "ASSET_PIPELINE" | "PERFORMANCE" | "SPATIAL_GRAPH" | "AI_GENERATED";
export type L2ExpansionReason =
  | "IMPLEMENTATION_DETAIL_REQUIRED"
  | "CLAIM_DISPUTED"
  | "VERSION_OR_BACKEND_CHANGED"
  | "EXPERIMENT_REPRODUCTION"
  | "BENCHMARK_COMPARISON";

export type SpatialPacketAssemblyRequest = {
  scope_key: string;
  project_scope: string;
  application_class: string;
  named_technologies?: string[];
  signals?: SpatialPacketSignal[];
  l2_reasons?: L2ExpansionReason[];
  requested_evidence_refs?: string[];
  sibling_scope_candidates?: string[];
  engine_profiles?: EngineProfileRecord[];
};

export type SpatialPacketAssemblyResult = {
  packet_id: "packet:spatial-web-core";
  packet_version: "0.2.0";
  status: "Candidate";
  resolved_scope_key: string;
  project_scope: string;
  application_class: string;
  disclosure_level: "L0" | "L1" | "L2";
  selected_l0_records: string[];
  selected_l1_records: string[];
  opened_l2_evidence: string[];
  rejected_sibling_scopes: string[];
  authority_decisions: string[];
  unresolved_conflicts: string[];
  packet_fingerprint: string;
};
