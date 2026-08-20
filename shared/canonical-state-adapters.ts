import {
  reconciliationAuthorityStates,
  reconciliationSourceSystems,
  type CanonicalStateProjection,
  type ReconciliationAuthorityState,
  type ReconciliationProjectionClass,
  type ReconciliationProjectionStatus,
  type ReconciliationSourceSystem,
} from "./canonical-state-reconciliation.ts";

export const canonicalProjectionAdapterIds = {
  scope: "a1-scope-registry-v0.1",
  handoff: "a2-handoff-current-state-v0.1",
  runtime: "a3-runtime-control-plane-v0.1",
  ledger: "a4-ledger-execution-index-v0.1",
  interface: "a5-interface-registry-v0.1",
  registry: "a6-capability-workflow-registry-v0.1",
} as const;

export const adapterReasonCodes = {
  common: ["SOURCE_UNAVAILABLE", "PROVENANCE_MISSING", "FRESHNESS_UNPROVEN", "ADAPTER_AUTHORITY_ROLE_MISMATCH"],
  scope: ["SCOPE_ROW_MISSING", "ALIAS_TARGET_DRIFT", "SOURCE_BINDING_DRIFT", "SIBLING_SCOPE_LEAK", "SCOPE_AMBIGUOUS"],
  handoff: ["HANDOFF_STALE", "HANDOFF_PROPERTY_DRIFT", "SUPERSESSION_MISSING", "HISTORICAL_STATE_PROMOTED"],
  runtime: ["RUNTIME_ARTIFACT_MISSING", "RUNTIME_SCHEMA_DRIFT", "RUNTIME_STALE", "SHADOW_AUTHORITY_OVERREACH"],
  ledger: ["LEDGER_GAP", "LEDGER_DUPLICATE_ID", "LEDGER_KEY_AMBIGUITY", "LEDGER_COVERAGE_OVERCLAIM", "RECEIPT_LINK_DRIFT"],
  interface: ["INTERFACE_MODE_DRIFT", "INTERFACE_VERSION_STALE", "INTERFACE_IMPLEMENTATION_OVERCLAIM", "INTERFACE_AUTHORITY_DRIFT"],
  registry: ["REGISTRY_STATUS_DRIFT", "REGISTRY_VERSION_DRIFT", "CAPABILITY_REFERENCE_MISSING", "REGISTRY_AUTHORITY_MISMATCH", "REGISTRY_EXECUTION_DRIFT"],
} as const;

export type ProjectionObservationBase = {
  source_system: ReconciliationSourceSystem;
  source_id: string;
  source_version: string | null;
  source_fingerprint: string | null;
  provenance_envelope_id: string | null;
  missing_provenance_reason: string | null;
  authority_owner: string;
  authority_domain: string;
  authority_state: ReconciliationAuthorityState;
  freshness_anchor: string;
  supersedes: string | null;
  source_available: boolean;
  freshness_proven: boolean;
  observed_claims?: Record<string, unknown>;
};

export type ScopeRegistryObservation = ProjectionObservationBase & {
  requested_scope_key: string;
  canonical_scope_key: string | null;
  alias_target_scope_key: string | null;
  expected_alias_target_scope_key: string | null;
  source_binding_digest: string | null;
  expected_source_binding_digest: string | null;
  forbidden_roots_observed: string[];
  competing_canonical_scope_keys: string[];
};
export type HandoffObservation = ProjectionObservationBase & {
  stored_repository_head_sha: string | null;
  live_repository_head_sha: string | null;
  handoff_property_state_id: string | null;
  current_state_block_state_id: string | null;
  supersession_required: boolean;
  supersession_anchor: string | null;
  historical_state_presented_as_current: boolean;
};
export type RuntimeObservation = ProjectionObservationBase & {
  runtime_artifact_present: boolean;
  runtime_schema_version: string | null;
  expected_runtime_schema_version: string;
  runtime_revision: string | null;
  current_runtime_anchor: string | null;
  shadow_claims_project_memory_authority: boolean;
};
export type LedgerObservation = ProjectionObservationBase & {
  missing_execution_ids: string[];
  duplicate_machine_ids: string[];
  ambiguous_human_labels: string[];
  declared_complete_history: boolean;
  coverage_is_partial: boolean;
  receipt_link_mismatches: string[];
};
export type InterfaceObservation = ProjectionObservationBase & {
  declared_mode: "LIVE" | "SIMULATION" | "UNPROVEN";
  implementation_mode: "LIVE" | "SIMULATION" | "UNPROVEN";
  deployment_version: string | null;
  current_deployment_version: string | null;
  declared_surface_state: "implemented" | "design_only" | "unproven";
  evidence_surface_state: "implemented" | "design_only" | "unproven";
  declared_mutation_capability: "NONE" | "READ_ONLY" | "WRITE";
  evidence_mutation_capability: "NONE" | "READ_ONLY" | "WRITE";
  declared_authority_claim: string;
  evidence_authority_claim: string;
};
export type RegistryObservation = ProjectionObservationBase & {
  capability_status: string;
  workflow_capability_status: string;
  capability_version: string | null;
  workflow_capability_version: string | null;
  capability_reference_present: boolean;
  capability_reference_eligible: boolean;
  declared_write_authorization: string;
  workflow_write_authorization: string;
  declared_approval_required: boolean;
  workflow_approval_required: boolean;
  registered_execution_state: string | null;
  verified_execution_state: string | null;
};

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === "string";
const stringArray = (v: unknown) => Array.isArray(v) && v.every(nonEmpty);

export class CanonicalProjectionAdapterInputError extends Error {
  constructor(readonly code: string, readonly issues: string[]) { super(issues.join(" ")); }
}

const baseIssues = (input: unknown) => {
  if (!isRecord(input)) return ["adapter input must be an object."];
  const issues: string[] = [];
  for (const f of ["source_id", "authority_owner", "authority_domain", "freshness_anchor"] as const) if (!nonEmpty(input[f])) issues.push(`${f} is required.`);
  if (!reconciliationSourceSystems.includes(input.source_system as ReconciliationSourceSystem)) issues.push(`source_system must be one of: ${reconciliationSourceSystems.join(", ")}.`);
  if (!reconciliationAuthorityStates.includes(input.authority_state as ReconciliationAuthorityState)) issues.push(`authority_state must be one of: ${reconciliationAuthorityStates.join(", ")}.`);
  for (const f of ["source_version", "source_fingerprint", "provenance_envelope_id", "missing_provenance_reason", "supersedes"] as const) if (!nullableString(input[f])) issues.push(`${f} must be a string or null.`);
  if (typeof input.source_available !== "boolean") issues.push("source_available must be boolean.");
  if (typeof input.freshness_proven !== "boolean") issues.push("freshness_proven must be boolean.");
  if (input.observed_claims !== undefined && !isRecord(input.observed_claims)) issues.push("observed_claims must be an object when provided.");
  return issues;
};
const assertInput = (input: unknown, extra: string[] = []) => {
  const issues = [...baseIssues(input), ...extra];
  if (issues.length) throw new CanonicalProjectionAdapterInputError("CANONICAL_PROJECTION_ADAPTER_INPUT_INVALID", issues);
};
const gate = (input: ProjectionObservationBase, status: ReconciliationProjectionStatus, reasons: string[], allowed: readonly ReconciliationAuthorityState[]) => {
  if (!input.source_available) return { status: "UNAVAILABLE" as const, reasons: ["SOURCE_UNAVAILABLE"] };
  if (!nonEmpty(input.provenance_envelope_id)) return { status: "UNKNOWN" as const, reasons: ["PROVENANCE_MISSING"] };
  if (!input.freshness_proven) return { status: "UNKNOWN" as const, reasons: ["FRESHNESS_UNPROVEN"] };
  if (!allowed.includes(input.authority_state)) return { status: "DRIFTED" as const, reasons: ["ADAPTER_AUTHORITY_ROLE_MISMATCH"] };
  return { status, reasons };
};
const emit = (
  cls: ReconciliationProjectionClass,
  input: ProjectionObservationBase,
  status: ReconciliationProjectionStatus,
  reasons: string[],
  claims: Record<string, unknown>,
  allowed: readonly ReconciliationAuthorityState[],
): CanonicalStateProjection => {
  const gated = gate(input, status, reasons, allowed);
  return {
    projection_class: cls,
    adapter_id: canonicalProjectionAdapterIds[cls],
    source_system: input.source_system,
    source_id: input.source_id,
    source_version: input.source_version,
    source_fingerprint: input.source_fingerprint,
    provenance_envelope_id: input.provenance_envelope_id,
    missing_provenance_reason: input.provenance_envelope_id ? null : input.missing_provenance_reason ?? `${cls} projection provenance unavailable`,
    authority_owner: input.authority_owner,
    authority_domain: input.authority_domain,
    authority_state: input.authority_state,
    freshness_anchor: input.freshness_anchor,
    supersedes: input.supersedes,
    status: gated.status,
    reason_codes: gated.reasons,
    observed_claims: { ...(input.observed_claims ?? {}), ...claims },
  };
};

export const adaptScopeRegistryProjection = (input: ScopeRegistryObservation) => {
  const extra: string[] = [];
  if (!nonEmpty(input.requested_scope_key)) extra.push("requested_scope_key is required.");
  for (const f of ["canonical_scope_key", "alias_target_scope_key", "expected_alias_target_scope_key", "source_binding_digest", "expected_source_binding_digest"] as const) if (!nullableString(input[f])) extra.push(`${f} must be a string or null.`);
  if (!stringArray(input.forbidden_roots_observed)) extra.push("forbidden_roots_observed must contain only non-empty strings.");
  if (!stringArray(input.competing_canonical_scope_keys)) extra.push("competing_canonical_scope_keys must contain only non-empty strings.");
  assertInput(input, extra);
  const r: string[] = [];
  if (input.canonical_scope_key === null) r.push("SCOPE_ROW_MISSING");
  if (input.expected_alias_target_scope_key !== null && input.alias_target_scope_key !== input.expected_alias_target_scope_key) r.push("ALIAS_TARGET_DRIFT");
  if (input.expected_source_binding_digest !== null && input.source_binding_digest !== input.expected_source_binding_digest) r.push("SOURCE_BINDING_DRIFT");
  if (input.forbidden_roots_observed.length) r.push("SIBLING_SCOPE_LEAK");
  if ((input.canonical_scope_key !== null && input.canonical_scope_key !== input.requested_scope_key) || new Set(input.competing_canonical_scope_keys).size > 1) r.push("SCOPE_AMBIGUOUS");
  return emit("scope", input, r.length ? "DRIFTED" : "FRESH", r, {
    requested_scope_key: input.requested_scope_key,
    canonical_scope_key: input.canonical_scope_key,
    alias_target_scope_key: input.alias_target_scope_key,
    source_binding_digest: input.source_binding_digest,
    forbidden_roots_observed: [...input.forbidden_roots_observed],
    competing_canonical_scope_keys: [...input.competing_canonical_scope_keys],
  }, ["authoritative"]);
};

export const adaptHandoffProjection = (input: HandoffObservation) => {
  const extra: string[] = [];
  for (const f of ["stored_repository_head_sha", "live_repository_head_sha", "handoff_property_state_id", "current_state_block_state_id", "supersession_anchor"] as const) if (!nullableString(input[f])) extra.push(`${f} must be a string or null.`);
  if (typeof input.supersession_required !== "boolean") extra.push("supersession_required must be boolean.");
  if (typeof input.historical_state_presented_as_current !== "boolean") extra.push("historical_state_presented_as_current must be boolean.");
  assertInput(input, extra);
  const r: string[] = [];
  const stale = nonEmpty(input.stored_repository_head_sha) && nonEmpty(input.live_repository_head_sha) && input.stored_repository_head_sha !== input.live_repository_head_sha;
  const propertyDrift = nonEmpty(input.handoff_property_state_id) && nonEmpty(input.current_state_block_state_id) && input.handoff_property_state_id !== input.current_state_block_state_id;
  if (stale) r.push("HANDOFF_STALE");
  if (propertyDrift) r.push("HANDOFF_PROPERTY_DRIFT");
  if (input.supersession_required && !nonEmpty(input.supersession_anchor)) r.push("SUPERSESSION_MISSING");
  if (input.historical_state_presented_as_current) r.push("HISTORICAL_STATE_PROMOTED");
  const hard = r.some((x) => x !== "HANDOFF_STALE");
  return emit("handoff", input, hard ? "DRIFTED" : stale ? "STALE" : "FRESH", r, {
    stored_repository_head_sha: input.stored_repository_head_sha,
    live_repository_head_sha: input.live_repository_head_sha,
    repository_projection_stale: stale,
    handoff_property_state_id: input.handoff_property_state_id,
    current_state_block_state_id: input.current_state_block_state_id,
    supersession_required: input.supersession_required,
    supersession_anchor: input.supersession_anchor,
    historical_state_presented_as_current: input.historical_state_presented_as_current,
  }, ["authoritative"]);
};

export const adaptRuntimeProjection = (input: RuntimeObservation) => {
  const extra: string[] = [];
  for (const f of ["runtime_schema_version", "runtime_revision", "current_runtime_anchor"] as const) if (!nullableString(input[f])) extra.push(`${f} must be a string or null.`);
  if (!nonEmpty(input.expected_runtime_schema_version)) extra.push("expected_runtime_schema_version is required.");
  if (typeof input.runtime_artifact_present !== "boolean") extra.push("runtime_artifact_present must be boolean.");
  if (typeof input.shadow_claims_project_memory_authority !== "boolean") extra.push("shadow_claims_project_memory_authority must be boolean.");
  assertInput(input, extra);
  if (!input.runtime_artifact_present) return emit("runtime", input, "UNAVAILABLE", ["RUNTIME_ARTIFACT_MISSING"], { runtime_artifact_present: false }, ["authoritative", "shadow"]);
  const r: string[] = [];
  if (input.runtime_schema_version !== input.expected_runtime_schema_version) r.push("RUNTIME_SCHEMA_DRIFT");
  const stale = nonEmpty(input.runtime_revision) && nonEmpty(input.current_runtime_anchor) && input.runtime_revision !== input.current_runtime_anchor;
  if (stale) r.push("RUNTIME_STALE");
  if (input.shadow_claims_project_memory_authority) r.push("SHADOW_AUTHORITY_OVERREACH");
  const hard = r.some((x) => x !== "RUNTIME_STALE");
  return emit("runtime", input, hard ? "DRIFTED" : stale ? "STALE" : "FRESH", r, {
    runtime_artifact_present: true,
    runtime_schema_version: input.runtime_schema_version,
    expected_runtime_schema_version: input.expected_runtime_schema_version,
    runtime_revision: input.runtime_revision,
    current_runtime_anchor: input.current_runtime_anchor,
    shadow_claims_project_memory_authority: input.shadow_claims_project_memory_authority,
  }, ["authoritative", "shadow"]);
};

export const adaptLedgerProjection = (input: LedgerObservation) => {
  const extra: string[] = [];
  for (const f of ["missing_execution_ids", "duplicate_machine_ids", "ambiguous_human_labels", "receipt_link_mismatches"] as const) if (!stringArray(input[f])) extra.push(`${f} must contain only non-empty strings.`);
  if (typeof input.declared_complete_history !== "boolean") extra.push("declared_complete_history must be boolean.");
  if (typeof input.coverage_is_partial !== "boolean") extra.push("coverage_is_partial must be boolean.");
  assertInput(input, extra);
  const r: string[] = [];
  if (input.missing_execution_ids.length) r.push("LEDGER_GAP");
  if (input.duplicate_machine_ids.length) r.push("LEDGER_DUPLICATE_ID");
  if (input.ambiguous_human_labels.length) r.push("LEDGER_KEY_AMBIGUITY");
  if (input.declared_complete_history && input.coverage_is_partial) r.push("LEDGER_COVERAGE_OVERCLAIM");
  if (input.receipt_link_mismatches.length) r.push("RECEIPT_LINK_DRIFT");
  return emit("ledger", input, r.length ? "DRIFTED" : "FRESH", r, {
    missing_execution_ids: [...input.missing_execution_ids],
    duplicate_machine_ids: [...input.duplicate_machine_ids],
    ambiguous_human_labels: [...input.ambiguous_human_labels],
    declared_complete_history: input.declared_complete_history,
    coverage_is_partial: input.coverage_is_partial,
    receipt_link_mismatches: [...input.receipt_link_mismatches],
  }, ["authoritative", "shadow"]);
};

export const adaptInterfaceProjection = (input: InterfaceObservation) => {
  const extra: string[] = [];
  for (const f of ["deployment_version", "current_deployment_version"] as const) if (!nullableString(input[f])) extra.push(`${f} must be a string or null.`);
  for (const f of ["declared_authority_claim", "evidence_authority_claim"] as const) if (!nonEmpty(input[f])) extra.push(`${f} is required.`);
  assertInput(input, extra);
  const r: string[] = [];
  if (input.declared_mode !== input.implementation_mode) r.push("INTERFACE_MODE_DRIFT");
  const stale = nonEmpty(input.deployment_version) && nonEmpty(input.current_deployment_version) && input.deployment_version !== input.current_deployment_version;
  if (stale) r.push("INTERFACE_VERSION_STALE");
  if (input.declared_surface_state === "implemented" && input.evidence_surface_state !== "implemented") r.push("INTERFACE_IMPLEMENTATION_OVERCLAIM");
  if (input.declared_mutation_capability !== input.evidence_mutation_capability || input.declared_authority_claim !== input.evidence_authority_claim) r.push("INTERFACE_AUTHORITY_DRIFT");
  const hard = r.some((x) => x !== "INTERFACE_VERSION_STALE");
  return emit("interface", input, hard ? "DRIFTED" : stale ? "STALE" : "FRESH", r, {
    declared_mode: input.declared_mode,
    implementation_mode: input.implementation_mode,
    deployment_version: input.deployment_version,
    current_deployment_version: input.current_deployment_version,
    declared_surface_state: input.declared_surface_state,
    evidence_surface_state: input.evidence_surface_state,
    declared_mutation_capability: input.declared_mutation_capability,
    evidence_mutation_capability: input.evidence_mutation_capability,
    declared_authority_claim: input.declared_authority_claim,
    evidence_authority_claim: input.evidence_authority_claim,
  }, ["authoritative", "observational"]);
};

export const adaptRegistryProjection = (input: RegistryObservation) => {
  const extra: string[] = [];
  for (const f of ["capability_status", "workflow_capability_status", "declared_write_authorization", "workflow_write_authorization"] as const) if (!nonEmpty(input[f])) extra.push(`${f} is required.`);
  for (const f of ["capability_version", "workflow_capability_version", "registered_execution_state", "verified_execution_state"] as const) if (!nullableString(input[f])) extra.push(`${f} must be a string or null.`);
  for (const f of ["capability_reference_present", "capability_reference_eligible", "declared_approval_required", "workflow_approval_required"] as const) if (typeof input[f] !== "boolean") extra.push(`${f} must be boolean.`);
  assertInput(input, extra);
  const r: string[] = [];
  if (input.capability_status !== input.workflow_capability_status) r.push("REGISTRY_STATUS_DRIFT");
  if (input.capability_version !== input.workflow_capability_version) r.push("REGISTRY_VERSION_DRIFT");
  if (!input.capability_reference_present || !input.capability_reference_eligible) r.push("CAPABILITY_REFERENCE_MISSING");
  if (input.declared_write_authorization !== input.workflow_write_authorization || input.declared_approval_required !== input.workflow_approval_required) r.push("REGISTRY_AUTHORITY_MISMATCH");
  if (input.registered_execution_state !== null && input.verified_execution_state !== null && input.registered_execution_state !== input.verified_execution_state) r.push("REGISTRY_EXECUTION_DRIFT");
  return emit("registry", input, r.length ? "DRIFTED" : "FRESH", r, {
    capability_status: input.capability_status,
    workflow_capability_status: input.workflow_capability_status,
    capability_version: input.capability_version,
    workflow_capability_version: input.workflow_capability_version,
    capability_reference_present: input.capability_reference_present,
    capability_reference_eligible: input.capability_reference_eligible,
    declared_write_authorization: input.declared_write_authorization,
    workflow_write_authorization: input.workflow_write_authorization,
    declared_approval_required: input.declared_approval_required,
    workflow_approval_required: input.workflow_approval_required,
    registered_execution_state: input.registered_execution_state,
    verified_execution_state: input.verified_execution_state,
  }, ["authoritative"]);
};
