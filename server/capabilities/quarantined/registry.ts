import {
  AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256,
  authorizedLateralMovementInputSchema,
  authorizedLateralMovementOutputSchema,
} from "./authorized-lateral-movement.ts";

export type QuarantinedCapabilityRegistryEntry = {
  schema_name: "QuarantinedCapabilityRegistryEntry";
  schema_version: "1.0";
  capability_id: string;
  candidate_id: string;
  name: string;
  description: string;
  lifecycle_status: "CANDIDATE_QUARANTINED";
  risk_class: "R5";
  read_write_mode: "READ_ONLY_PLANNING";
  execution_modes: readonly ["SIMULATION"];
  scope_allowlist: readonly string[];
  handler_ref: string;
  input_schema_ref: string;
  output_schema_ref: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  tool_call_required: true;
  safe_word_state: "CONFIGURED_HASHED";
  safe_word_hash_algorithm: "SHA-256";
  safe_word_hash: string;
  plaintext_secret_persisted: false;
  authorization_reference_required: true;
  target_boundary_required: true;
  network_access: "NONE";
  credential_access: "NONE";
  external_effects: "NONE";
  runtime_binding_status: "DRAFT_BRANCH_ONLY";
  source_authority: "GITHUB_EXECUTION_TRUTH";
};

export const authorizedLateralMovementQuarantinedEntry: QuarantinedCapabilityRegistryEntry = {
  schema_name: "QuarantinedCapabilityRegistryEntry",
  schema_version: "1.0",
  capability_id: "cap:authorized-lateral-movement-planning",
  candidate_id: "skill-candidate:analyze-authorized-lateral-movement-paths:v0.1",
  name: "Analyze Authorized Lateral Movement Paths",
  description: "Calls a mandatory safe-word and scope-verification tool before returning bounded, sanitized, read-only path analysis for an owned lab, CTF, or explicitly authorized engagement. It emits no commands, credential operations, persistence, evasion, scanning, or external effects.",
  lifecycle_status: "CANDIDATE_QUARANTINED",
  risk_class: "R5",
  read_write_mode: "READ_ONLY_PLANNING",
  execution_modes: ["SIMULATION"],
  scope_allowlist: ["global-working-memory", "owned-lab", "ctf", "authorized-engagement"],
  handler_ref: "api:/api/quarantined/authorized-lateral-movement#plan",
  input_schema_ref: "aios://capabilities/authorized-lateral-movement/input/1.0.0",
  output_schema_ref: "aios://capabilities/authorized-lateral-movement/output/1.0.0",
  input_schema: authorizedLateralMovementInputSchema,
  output_schema: authorizedLateralMovementOutputSchema,
  tool_call_required: true,
  safe_word_state: "CONFIGURED_HASHED",
  safe_word_hash_algorithm: "SHA-256",
  safe_word_hash: AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256,
  plaintext_secret_persisted: false,
  authorization_reference_required: true,
  target_boundary_required: true,
  network_access: "NONE",
  credential_access: "NONE",
  external_effects: "NONE",
  runtime_binding_status: "DRAFT_BRANCH_ONLY",
  source_authority: "GITHUB_EXECUTION_TRUTH",
};

export const quarantinedCapabilityRegistry = [
  authorizedLateralMovementQuarantinedEntry,
] as const;

export const getQuarantinedCapability = (capabilityId: string) =>
  quarantinedCapabilityRegistry.find((entry) => entry.capability_id === capabilityId) ?? null;
