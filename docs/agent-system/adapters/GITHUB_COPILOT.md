# GitHub Copilot Adapter

GitHub Copilot is wired into the repository-local operating system through four native layers:

- `.github/copilot-instructions.md` — thin repository-wide routing and invariants;
- `.github/instructions/**/*.instructions.md` — path-specific rules using `applyTo`;
- `.github/agents/*.agent.md` — bounded specialist job profiles;
- `.github/skills/<skill-name>/SKILL.md` — task-specific reusable procedures loaded when relevant.

## Routing

Repository-wide instructions should point to root `AGENTS.md`, `docs/agent-system/context/README.md`, and `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md` rather than duplicating the whole knowledge base.

Path-specific instruction files should contain only rules that genuinely apply to their matched paths. Avoid contradictory copies of root or nested `AGENTS.md`.

Custom agents project the vendor-neutral role contracts into Copilot-native specialist profiles. Tool access is a capability surface, not authority. Profiles with sensitive adjudication/release/verification roles should be manually invoked where useful rather than freely expanding work.

Skills package stable repeatable procedures. GitHub may select a relevant project skill from its description. Load only the needed procedure and keep always-on policy in instructions rather than copying it into every skill.

## Phase 3 mappings

- AIOS Planner → `plan-feature`
- AIOS Reviewer → `review-pr`
- AIOS Verifier → `verify-head`
- AIOS Knowledge Steward → `harvest-lesson`
- AIOS Release Steward → `prepare-release`

A skill does not widen the selected custom agent's role or create terminal authority.

## Review behavior

Copilot review should use the current diff plus relevant common/touched-area rules, current local context, and the `review-pr` procedure when applicable. Findings are advisory. Suggested lesson candidates remain candidates until separately adjudicated.

## Skill security

The Phase 3 skills do not pre-approve shell/bash execution through `allowed-tools`. Future executable skills should receive separate review before any such pre-approval because skill-loaded scripts can expand execution risk.

## External context

Normal Copilot work should remain repository-local. Upstream Notion/Drive retrieval is reserved for governance synchronization, unresolved authority conflicts, stale/incomplete governance locks, or explicit owner requests.