import type { RuntimeMode } from "../../shared/runtime-mode.ts";

export const capabilityAutonomyBands = ["A0", "ADV", "A3", "A4", "A5"] as const;
export type CapabilityAutonomyBand = (typeof capabilityAutonomyBands)[number];

export const capabilityHealthStatuses = [
  "VERIFIED",
  "DEGRADED",
  "STALE",
  "UNREACHABLE",
  "AUTH_REQUIRED",
  "SCHEMA_MISMATCH",
  "BLOCKED",
] as const;
export type CapabilityHealthStatus = (typeof capabilityHealthStatuses)[number];

export const capabilityDecisionReasonCodes = [
  "INTENT_MISMATCH",
  "NEGATIVE_BOUNDARY_MATCH",
  "REQUESTED_CAPABILITY_MISMATCH",
  "STATUS_NOT_ACTIVE",
  "SCOPE_MISMATCH",
  "SCOPE_DENIED",
  "AUTHORITY_MISMATCH",
  "MODE_UNSUPPORTED",
  "HEALTH_NOT_VERIFIED",
  "HANDLER_UNAVAILABLE",
  "OVERLAP_PRECEDENCE_LOST",
  "SCHEMA_FINGERPRINT_MISMATCH",
] as const;
export type CapabilityDecisionReasonCode = (typeof capabilityDecisionReasonCodes)[number];

export type JsonSchema = Record<string, unknown>;
export type CapabilityExecutionMode = Extract<RuntimeMode, "LIVE" | "SIMULATION">;

export type RuntimeCapabilityDefinition = {
  schema_name: "RuntimeCapabilityDefinition";
  schema_version: "1.0";
  capability_id: string;
  name: string;
  description: string;
  workflow_id: string;
  version: string;
  status: "ACTIVE" | "REVIEW" | "DEPRECATED" | "SUPERSEDED";
  discoverable: boolean;

  intent_classes: string[];
  positive_examples: string[];
  negative_examples: string[];
  overlap_group: string | null;
  precedence_priority: number;
  preferred_over: string[];

  scope_allowlist: string[];
  scope_denylist: string[];
  authority_domains: string[];

  input_schema_ref: string;
  output_schema_ref: string;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  expected_schema_fingerprint: string;
  handler_ref: string;

  trust_level: "INTERNAL_NATIVE" | "VETTED_EXTERNAL" | "UNTRUSTED";
  data_access: "EXECUTION_LOCAL" | "READ_ONLY_EXTERNAL" | "WRITE_EXTERNAL";
  reversibility: "FULLY_REVERSIBLE" | "PARTIALLY_REVERSIBLE" | "IRREVERSIBLE";
  blast_radius: "PROCESS_LOCAL" | "SCOPE_LOCAL" | "EXTERNAL";
  autonomy_band: CapabilityAutonomyBand;
  approval_required: boolean;
  materialization_requires_approval: boolean;
  execution_modes: CapabilityExecutionMode[];

  health: {
    status: CapabilityHealthStatus;
    checked_at: string;
    expires_at: string | null;
    verification_source: string;
  };
  source_authority: "GITHUB_EXECUTION_TRUTH" | "NOTION_AUTHORITY_SNAPSHOT" | "DRIVE_RUNTIME_SNAPSHOT";
};

export type CapabilityCandidate = {
  capability_id: string;
  capability_version: string;
  name: string;
  workflow_id: string;
  match_score: number;
  match_reasons: string[];
  overlap_group: string | null;
  precedence_priority: number;
  authority_compatible: boolean;
  scope_compatible: boolean;
  mode_compatible: boolean;
  health_compatible: boolean;
  autonomy_band: CapabilityAutonomyBand;
  approval_required: boolean;
  materialization_requires_approval: boolean;
  reversibility: RuntimeCapabilityDefinition["reversibility"];
  blast_radius: RuntimeCapabilityDefinition["blast_radius"];
  input_schema_ref: string;
  output_schema_ref: string;
  expected_schema_fingerprint: string;
};

export type RejectedCapabilityCandidate = CapabilityCandidate & {
  decision: "REJECTED";
  reason_codes: CapabilityDecisionReasonCode[];
  reason_details: string[];
};

export type CapabilityDiscoveryEnvelope = {
  schema_name: "CapabilityDiscoveryEnvelope";
  schema_version: "1.0";
  discovery_id: string;
  execution_id: string | null;
  workflow_id: string | null;
  scope_key: string;
  mode: CapabilityExecutionMode;
  intent_class: string;
  intent_text: string | null;
  requested_capability_id: string | null;
  authority_domains: string[];
  registry_version: string;
  registry_fingerprint: string;
  candidates_considered: number;
  eligible_candidates: CapabilityCandidate[];
  rejected_candidates: RejectedCapabilityCandidate[];
  recommended_capability_id: string | null;
  selection_confidence: number | null;
  confidence_margin: number | null;
  resolution_state: "MATCHED" | "AMBIGUOUS" | "NO_MATCH";
  generated_at: string;
};

export type MaterializedCapability = {
  schema_name: "MaterializedCapability";
  schema_version: "1.0";
  discovery_id: string;
  execution_id: string | null;
  capability_id: string;
  capability_version: string;
  workflow_id: string;
  scope_key: string;
  input_schema_ref: string;
  output_schema_ref: string;
  input_schema: JsonSchema;
  output_schema: JsonSchema;
  schema_fingerprint: string;
  expected_schema_fingerprint: string;
  fingerprint_verified: true;
  authorization_scope: "MATERIALIZATION_ONLY";
  execution_authorized: false;
  destination_write_authorized: false;
  materialized_at: string;
};

export type CapabilityDiscoveryInput = {
  execution_id?: string | null;
  workflow_id?: string | null;
  scope_key: string;
  mode: CapabilityExecutionMode;
  intent_class: string;
  intent_text?: string | null;
  requested_capability_id?: string | null;
  authority_domains?: string[];
  now?: () => string;
};

export type CapabilityPolicyEvaluation = {
  candidate: CapabilityCandidate;
  eligible: boolean;
  reason_codes: CapabilityDecisionReasonCode[];
  reason_details: string[];
};

export type CapabilitySelectionDecision = "SELECTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type CapabilitySelection = {
  discovery_id: string;
  capability_id: string;
  capability_version: string;
  selected_at: string;
  decision: CapabilitySelectionDecision;
  decided_at: string | null;
  authorization_scope: "MATERIALIZATION_ONLY";
  execution_authorized: false;
  destination_write_authorized: false;
};

export type CapabilityDiscoveryEvent = {
  event_id: string;
  discovery_id: string;
  event_type: string;
  sequence: number;
  emitted_at: string;
  data?: Record<string, unknown>;
};

export type CapabilityDiscoverySnapshot = {
  envelope: CapabilityDiscoveryEnvelope;
  selection: CapabilitySelection | null;
  materialized_capability: MaterializedCapability | null;
  events: CapabilityDiscoveryEvent[];
  persistence: "PROCESS_LOCAL";
  execution_authority: "NONE";
};
