# Bounded bridge context read

State: ACTIVE / candidate only

## Objective and base

Reduce repeated search-to-fetch calls for existing public repository knowledge.
Base: main at 99e7c38bd43b69c1b0e3de6fe6f071bf3f4d84b4.

## Scope

- Add optional `include_text: true` to the existing search action and MCP search tool.
- Return the same full record text as fetch, with its source identity, authority metadata, scope, coverage and no-write boundary. Existing search limits still apply.
- Keep the default search response compact and backward compatible.
- Await durable execution storage only for actions that actually need it. Module-level store initialization is unchanged.
- Derive the execution summary's eligible LIVE workflow list from current policy and registered handlers.

This is a single repository-local PR with no dependency on processed-context candidates.
No external memory reads, new tools, cache, PCW activation, persistence change, authorization change, merge or deployment is included.

## Risk, implementation and roles

STANDARD: additive read response and optional tool parameter. Existing authorization and scope checks run before record access. Touched areas are the bridge route, repository knowledge projection, Python MCP adapter, their existing tests and this public-safe plan. Root instructions and common PR rules apply.

Planner defines this bounded concern; implementer makes the change; mechanical tests verify response equivalence and boundaries. FULL current-candidate review remains separate from implementation self-check. Model review cannot grant mechanical acceptance or merge authority.

## Verification and completion

1. Unit regression rejects the obsolete simulation-only summary.
2. Built-worker tests compare context search with exact fetch, retain the compact default, and reject wrong scope and malformed opt-in.
3. Real MCP SDK smoke test verifies tool schema compatibility and one backend request per context search.
4. Required repository CI and public-release checks bind to the exact PR head.

For K useful returned records, search plus K fetches uses 1 + K calls; context search uses one when its evidence is sufficient. This is a call-count reduction, not a measured latency or task-success claim. It adds text tokens only when explicitly requested. Re-fetch when current evidence is required; no cached freshness is asserted.

Completion: tested candidate PR and observed CI state. Repair budget: two in-scope rounds; stop on authority conflict, public-data leak or exhausted blocking repair. Rollback: revert this single PR. No private workspace material belongs in this plan.
