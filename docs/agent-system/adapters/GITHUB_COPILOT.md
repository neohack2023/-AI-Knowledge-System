# GitHub Copilot Adapter

GitHub Copilot is wired into the repository-local operating system through three native layers:

- `.github/copilot-instructions.md` — thin repository-wide routing and invariants;
- `.github/instructions/**/*.instructions.md` — path-specific rules using `applyTo`;
- `.github/agents/*.agent.md` — bounded specialist job profiles.

## Routing

Repository-wide instructions should point to root `AGENTS.md`, `docs/agent-system/context/README.md`, and `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md` rather than duplicating the whole knowledge base.

Path-specific instruction files should contain only rules that genuinely apply to their matched paths. Avoid contradictory copies of root or nested `AGENTS.md`.

Custom agents project the vendor-neutral role contracts into Copilot-native specialist profiles. Tool access is a capability surface, not authority. Profiles with sensitive adjudication/release/verification roles should be manually invoked where useful rather than freely expanding work.

## Review behavior

Copilot review should use the current diff plus relevant common/touched-area rules and current local context. Findings are advisory. Suggested lesson candidates remain candidates until separately adjudicated.

## External context

Normal Copilot work should remain repository-local. Upstream Notion/Drive retrieval is reserved for governance synchronization, unresolved authority conflicts, stale/incomplete governance locks, or explicit owner requests.
