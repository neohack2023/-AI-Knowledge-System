# GitHub Copilot Repository Instructions

Use `AGENTS.md` as the canonical repository-local instruction map. Normal repository work should resolve context from checked-in repository surfaces plus live GitHub state, not from external workspace memory.

Before proposing, editing, or reviewing:

- Read `AGENTS.md` and any more specific nested `AGENTS.md` that applies to touched files.
- Read `docs/agent-system/context/README.md`, then use `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md` to load only the smallest relevant local context.
- Honor applicable `.github/instructions/**/*.instructions.md` path-specific rules. Do not duplicate those rules into unrelated prompts.
- Use `.github/agents/*.agent.md` specialists for bounded jobs when they materially improve the task. `ROLE PROFILE ≠ AUTHORITY`; tool access never grants merge, verifier, release, or owner authority.
- For `server/coding-harness/**`, read the nested `AGENTS.md`, verifier contract, and coding-harness PR rules before reviewing/changing trust logic.
- Keep one coherent concern and explicit non-goals unless the owner has expressly authorized a direct-main staging operation.
- Treat identity, freshness, review class, risk, transition classification, and owner authorization as separate trust-bearing facts when required.
- Any candidate-head change stales head-bound evidence unless transferability is mechanically proven.
- `MODEL_ADVISORY` review is evidence, not terminal mechanical acceptance.
- Respect bounded repair breakers. A blocking finding after the configured ceiling requires adjudication, not an automatic extra repair round.
- Run applicable checks and state the exact candidate/artifact actually verified. Never call a merge-ref checkout immutable candidate-head evidence.
- Never copy private workspace links, personal memory, live provider bindings, secrets, or private receipts into this public repository.
- Never merge, deploy, release, or change authority boundaries solely because an automated review or test is green.

## External-memory boundary

Do not fetch Notion/Drive merely to reconstruct repository identity, semantic phase, operating rules, plans, decisions, or known lessons. Escalate externally only when `docs/agent-system/context/governance-lock.yaml` triggers synchronization/conflict handling or the owner explicitly requests it.

## Review behavior

Prioritize concrete correctness, trust-binding, security, data-loss, contract, and liveness defects. Load common plus touched-area PR rules. Retrieve detailed anti-pattern candidates only when relevant. Avoid re-raising already repaired prior-head findings unless the current candidate still reproduces the defect. You may suggest a lesson candidate; you may not self-promote it.