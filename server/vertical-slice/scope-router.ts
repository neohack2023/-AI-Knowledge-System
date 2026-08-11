import type { ScopeResolution } from "./types.ts";

type ScopeDefinition = {
  scope_key: string;
  aliases: string[];
};

const scopes: ScopeDefinition[] = [
  {
    scope_key: "global-working-memory",
    aliases: ["AI_MEMORY_OS", "AI Memory OS", "AI Knowledge System", "AI_KNOWLEDGE_SYSTEM"],
  },
  {
    scope_key: "udio-algorithms",
    aliases: ["music-system", "Ne0 Hack", "Lexi Con", "Suno Lab"],
  },
  {
    scope_key: "girls-of-gaming",
    aliases: ["Girls of Gaming", "Girl of Gaming", "GoG"],
  },
  {
    scope_key: "github:neohack2023/Looper",
    aliases: ["Looper", "neohack2023/Looper"],
  },
];

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

export class ScopeResolutionError extends Error {
  constructor(readonly code: "SCOPE_REQUIRED" | "SCOPE_NOT_REGISTERED", message: string) {
    super(message);
  }
}

export const resolveRegisteredScope = (requestedScope: string): ScopeResolution => {
  const normalizedRequest = normalize(requestedScope);
  if (!normalizedRequest) throw new ScopeResolutionError("SCOPE_REQUIRED", "A registered scope or alias is required.");

  const exact = scopes.find((scope) => normalize(scope.scope_key) === normalizedRequest);
  if (exact) {
    return {
      requested_scope: requestedScope,
      normalized_request: normalizedRequest,
      resolved_scope_key: exact.scope_key,
      resolution_method: "EXACT_SCOPE_KEY",
    };
  }

  const alias = scopes.find((scope) => scope.aliases.some((candidate) => normalize(candidate) === normalizedRequest));
  if (alias) {
    return {
      requested_scope: requestedScope,
      normalized_request: normalizedRequest,
      resolved_scope_key: alias.scope_key,
      resolution_method: "REGISTERED_ALIAS",
    };
  }

  throw new ScopeResolutionError(
    "SCOPE_NOT_REGISTERED",
    `Scope '${requestedScope}' did not match an exact registered key or alias. Semantic guessing is disabled.`,
  );
};
