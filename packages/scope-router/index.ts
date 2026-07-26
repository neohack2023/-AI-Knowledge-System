import type {
  CompiledScopeRegistry,
  RegistryScopeDefinition,
  ScopeResolutionCandidate,
  ScopeResolutionMethod,
  ScopeResolutionRequest,
  ScopeResolutionResult,
} from "./types.ts";

export * from "./types.ts";

const normalize = (value: unknown) => String(value ?? "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

const unique = <T>(values: readonly T[]) => [...new Set(values)];

const evaluateScope = (
  scope: RegistryScopeDefinition,
  method: ScopeResolutionMethod,
  now: Date,
): ScopeResolutionCandidate => {
  const reasonCodes: string[] = [];
  if (scope.status !== "ACTIVE") reasonCodes.push("SCOPE_STATUS_NOT_ACTIVE");
  if (scope.health.status !== "VERIFIED") reasonCodes.push("SCOPE_HEALTH_NOT_VERIFIED");
  if (scope.health.expires_at && new Date(scope.health.expires_at) <= now) {
    reasonCodes.push("SCOPE_HEALTH_EXPIRED");
  }
  return {
    scope_key: scope.scope_key,
    project_name: scope.project_name,
    parent_scope_key: scope.parent_scope_key,
    match_basis: method,
    eligible: reasonCodes.length === 0,
    reason_codes: reasonCodes,
  };
};

const resultBase = (
  registry: CompiledScopeRegistry,
  request: ScopeResolutionRequest,
) => ({
  schema_name: "ScopeResolutionResult" as const,
  schema_version: "1.0" as const,
  registry_version: registry.registry_version,
  registry_fingerprint: registry.registry_fingerprint,
  requested_scope: request.requested_scope ?? null,
  normalized_request: normalize(request.requested_scope),
  semantic_selection_used: false as const,
  scope_packet_loaded: false as const,
  workflow_execution_authorized: false as const,
  destination_write_authorized: false as const,
});

export const resolveScope = (
  registry: CompiledScopeRegistry,
  request: ScopeResolutionRequest,
): ScopeResolutionResult => {
  if (registry.schema_name !== "CompiledAiosRegistry" || registry.schema_version !== "1.0") {
    throw new Error("Scope resolution requires CompiledAiosRegistry/1.0.");
  }

  const now = new Date(request.now ?? Date.now());
  const scopeByKey = new Map(registry.scopes.map((scope) => [scope.scope_key, scope]));
  const aliasByScope = new Map<string, string[]>();
  for (const alias of registry.aliases) {
    if (alias.status !== "ACTIVE") continue;
    const aliases = aliasByScope.get(alias.scope_key) ?? [];
    aliases.push(normalize(alias.alias));
    aliasByScope.set(alias.scope_key, aliases);
  }

  const finish = (
    method: ScopeResolutionMethod,
    scopeKeys: readonly string[],
  ): ScopeResolutionResult => {
    const candidates = unique(scopeKeys)
      .map((scopeKey) => scopeByKey.get(scopeKey))
      .filter((scope): scope is RegistryScopeDefinition => Boolean(scope))
      .map((scope) => evaluateScope(scope, method, now))
      .sort((left, right) => left.scope_key.localeCompare(right.scope_key));
    const eligible = candidates.filter((candidate) => candidate.eligible);
    const resolved = eligible.length === 1 ? eligible[0] : null;
    return {
      ...resultBase(registry, request),
      resolution_state: resolved ? "RESOLVED" : eligible.length > 1 ? "AMBIGUOUS" : "NO_MATCH",
      resolution_method: method,
      resolved_scope_key: resolved?.scope_key ?? null,
      candidates,
      durable_scope_selected: Boolean(resolved),
    };
  };

  const normalizedRequest = normalize(request.requested_scope);
  if (normalizedRequest) {
    const exactScope = registry.routing_tables.exact_scope_keys[normalizedRequest];
    if (exactScope) return finish("EXACT_SCOPE_KEY", [exactScope]);

    const exactProject = registry.routing_tables.exact_project_names[normalizedRequest];
    if (exactProject) return finish("EXACT_PROJECT_NAME", [exactProject]);

    const exactAlias = registry.routing_tables.exact_aliases[normalizedRequest];
    if (exactAlias) return finish("REGISTERED_ALIAS", [exactAlias]);
  }

  const explicitParent = normalize(request.parent_scope_key);
  if (explicitParent && normalizedRequest) {
    const parentScopeKey = registry.routing_tables.exact_scope_keys[explicitParent]
      ?? (scopeByKey.has(request.parent_scope_key ?? "") ? request.parent_scope_key : null);
    if (parentScopeKey) {
      const childKeys = registry.routing_tables.children_by_parent[parentScopeKey] ?? [];
      const matchingChildren = childKeys.filter((scopeKey) => {
        const child = scopeByKey.get(scopeKey);
        if (!child) return false;
        return normalize(child.scope_key) === normalizedRequest
          || normalize(child.project_name) === normalizedRequest
          || (aliasByScope.get(child.scope_key) ?? []).includes(normalizedRequest);
      });
      if (matchingChildren.length) return finish("EXPLICIT_PARENT_SUBPROJECT", matchingChildren);
    }
  }

  if (request.continuity_authorized === true && request.continuity_scope_key) {
    const continuityKey = registry.routing_tables.exact_scope_keys[normalize(request.continuity_scope_key)];
    if (continuityKey) return finish("BOUNDED_CONTINUITY", [continuityKey]);
  }

  return {
    ...resultBase(registry, request),
    resolution_state: "NO_MATCH",
    resolution_method: null,
    resolved_scope_key: null,
    candidates: [],
    durable_scope_selected: false,
  };
};
