export const provenanceOperations = ["RETRIEVAL", "TRANSFORMATION", "GOVERNED_WRITE"] as const;
export type ProvenanceOperation = (typeof provenanceOperations)[number];

export const epistemicTypes = [
  "CLAIM",
  "OBSERVATION",
  "ACTION_REQUEST",
  "ACTION_RESULT",
  "VERIFICATION",
  "DURABLE_FACT",
] as const;
export type EpistemicType = (typeof epistemicTypes)[number];

export const provenanceAuthorityStates = [
  "AUTHORITATIVE",
  "NON_AUTHORITATIVE",
  "SHADOW",
  "DERIVED",
  "UNKNOWN",
] as const;
export type ProvenanceAuthorityState = (typeof provenanceAuthorityStates)[number];

export type ProvenanceConflictState = "NONE" | "UNRESOLVED" | "RESOLVED";

export type ProvenanceTransformStep = {
  activity_id: string;
  activity_type: string;
  executor: string;
  input_evidence_ids: string[];
  started_at?: string | null;
  completed_at?: string | null;
};

export type ContextProvenanceEnvelope = {
  schema_name: "ContextProvenanceEnvelope";
  schema_version: "1.0";
  envelope_id: string;
  object_id: string;
  object_type: string;
  operation: ProvenanceOperation;
  epistemic_type: EpistemicType;
  scope_key: string;

  source_system: string;
  source_id: string;
  source_version: string | null;
  source_fingerprint: string;
  retrieved_at: string | null;
  object_fingerprint: string;

  parent_evidence_ids: string[];
  transform_chain: ProvenanceTransformStep[];

  authority_owner: string;
  authority_domain: string;
  authority_state: ProvenanceAuthorityState;
  authority_conflict_state: ProvenanceConflictState;
  confidence: number | null;

  access_policy_refs: string[];
  write_policy_refs: string[];

  used_by_execution_id: string;
  workflow_id: string;
  trace_id: string | null;
  span_id: string | null;

  mason_episode_id: string | null;
  write_plan_id: string | null;
  authorization_id: string | null;
  execution_receipt_id: string | null;
  destination: string | null;
  write_authorized: boolean;

  emitted_at: string;
  validated_at: string;
};

export type ContextProvenanceEnvelopeReadProjection = {
  schema_name: "ContextProvenanceEnvelopeReadProjection";
  schema_version: "0.1";
  envelope_id: string;
  object_id: string;
  object_type: string;
  operation: ProvenanceOperation;
  scope_key: string;
  authority_owner: string;
  authority_domain: string;
  authority_state: ProvenanceAuthorityState;
  authority_conflict_state: ProvenanceConflictState;
  access_policy_refs: string[];
  write_policy_refs: string[];
  source_fingerprint: string;
  object_fingerprint: string;
  retrieved_at: string | null;
  validated_at: string;
  used_by_execution_id: string;
  workflow_id: string;
  validity: "VALID";
};

export type ContextProvenanceEmission = {
  object_id: string;
  object_type: string;
  operation: ProvenanceOperation;
  epistemic_type: EpistemicType;

  source_system: string;
  source_id: string;
  source_version?: string | null;
  source_fingerprint: string;
  retrieved_at?: string | null;
  object_fingerprint: string;

  parent_evidence_ids?: string[];
  transform_chain?: ProvenanceTransformStep[];

  authority_owner: string;
  authority_domain: string;
  authority_state: ProvenanceAuthorityState;
  authority_conflict_state?: ProvenanceConflictState;
  confidence?: number | null;

  access_policy_refs: string[];
  write_policy_refs?: string[];

  trace_id?: string | null;
  span_id?: string | null;

  mason_episode_id?: string | null;
  write_plan_id?: string | null;
  authorization_id?: string | null;
  execution_receipt_id?: string | null;
  destination?: string | null;
  write_authorized?: boolean;
};

export type GovernedWriteAuthorization = {
  write_authorized: boolean;
  write_policy_refs: string[];
  mason_episode_id: string;
  write_plan_id: string;
  authorization_id: string;
  destination: string;
};

export type ProvenanceExecutionBinding = {
  execution_id: string;
  workflow_id: string;
  scope_key: string;
};
