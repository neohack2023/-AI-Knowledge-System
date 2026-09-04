# Tool Adapter Map

The repository's canonical operating knowledge lives in normal repository files. Tool adapters should route supported agent products into that same local system rather than duplicating policy in vendor-specific prompts.

## Canonical layers

1. `AGENTS.md` and nested `AGENTS.md` files — hierarchical repository instructions.
2. `context/` + `knowledge/` — semantic orientation and local knowledge routing.
3. `agents/` — vendor-neutral job contracts.
4. `commands/` — lifecycle entry contracts.
5. `pr-rules/` + `anti-patterns/` — compact promoted review law plus deeper negative knowledge.
6. `features/`, `decisions/`, `exec-plans/` — durable feature provenance, decisions, and task plans.

## Native adapters

- **OpenAI Codex:** root/nested `AGENTS.md`; see `CODEX.md`.
- **GitHub Copilot:** `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, and `.github/agents/*.agent.md`; see `GITHUB_COPILOT.md`.

## Adapter law

- The adapter points inward to canonical repository context; it is not a second policy authority.
- Keep vendor-specific instructions thin.
- Put area-specific rules in the supported path-scoped mechanism.
- Put professional role behavior in native custom-agent profiles when the product supports them.
- Normal repository work must not require Notion/Drive retrieval merely because an adapter exists.
- A product capability never widens repository or AIOS authority by itself.
