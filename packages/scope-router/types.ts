export const scopeResolutionMethods = [
  "EXACT_SCOPE_KEY",
  "EXACT_PROJECT_NAME",
  "REGISTERED_ALIAS",
  "EXPLICIT_PARENT_SUBPROJECT",
  "BOUNDED_CONTINUITY",
] as const;

export type ScopeResolutionMethod = (typeof scopeResolutionMethods)[number];
export type ScopeResolutionState = "RESOLVED" | "AMBIGUOUS" | "NO_MATCH";

export type RegistryScopeHealth = {
  status: string;
  checked_at: string;
  expires_at: string | null;
};

export type RegistryScopeDefinition = {
  schema_name: "ScopeDefinition";
  schema_version: "1.0";
  scope_key: string;
  project_name: string;
  parent_scope_key: string | null;
  status: "ACTIVE" | "REVIEW" | "DEPRECATED" | "SUPERSEDED";
  health: RegistryScopeHealth;
};

export type RegistryAliasDefinition = {
  schema_name: "AliasDefinition";
  schema_version: "1.0";
  alias_id: string;
  alias: string;
  scope_key: string;
  status: "ACTIVE" | "DEPRECATED" | "SUPERSEDED";
};

export type RegistryRoutingTables = {
  exact_scope_keys: Record<string, string>;
  exact_project_names: Record<string, string>;
  exact_aliases: Record<string, string>;
  children_by_parent: Record<string, string[]>;
};

export type CompiledScopeRegistry = {
  schema_name: "CompiledAiosRegistry";
  schema_version: "1.0";
  registry_version: string;
  registry_fingerprint: string;
  inventory_projection_fingerprint: string;
  routing_precedence: string[];
  routing_tables: RegistryRoutingTables;
  scopes: RegistryScopeDefinition[];
  aliases: RegistryAliasDefinition[];
};

export type ScopeResolutionRequest = {
  requested_scope?: string | null;
  parent_scope_key?: string | null;
  continuity_scope_key?: string | null;
  continuity_authorized?: boolean;
  now?: string;
};

export type ScopeResolutionCandidate = {
  scope_key: string;
  project_name: string;
  parent_scope_key: string | null;
  match_basis: ScopeResolutionMethod;
  eligible: boolean;
  reason_codes: string[];
};

export type ScopeResolutionResult = {
  schema_name: "ScopeResolutionResult";
  schema_version: "1.0";
  registry_version: string;
  registry_fingerprint: string;
  requested_scope: string | null;
  normalized_request: string;
  resolution_state: ScopeResolutionState;
  resolution_method: ScopeResolutionMethod | null;
  resolved_scope_key: string | null;
  candidates: ScopeResolutionCandidate[];
  durable_scope_selected: boolean;
  semantic_selection_used: false;
  scope_packet_loaded: false;
  workflow_execution_authorized: false;
  destination_write_authorized: false;
};
