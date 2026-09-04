# OpenAI Codex Adapter

Codex enters this repository through hierarchical `AGENTS.md` instructions and may consume repository-native Agent Skills when the task matches them.

## Entry

1. Read root `AGENTS.md`.
2. Read `docs/agent-system/context/README.md` and the smallest local context it routes.
3. For every touched path, obey the most specific applicable nested `AGENTS.md`.
4. Resolve the relevant role, PR rules, plan/feature dossier, and verifier obligations from `docs/agent-system/**`.
5. When the task matches one of the stable lifecycle procedures, load the single relevant `.github/skills/<skill-name>/SKILL.md` rather than restating the workflow ad hoc.

## Phase 3 skill routing

- planning → `.github/skills/plan-feature/SKILL.md`
- advisory review → `.github/skills/review-pr/SKILL.md`
- exact-candidate verification → `.github/skills/verify-head/SKILL.md`
- negative-knowledge capture → `.github/skills/harvest-lesson/SKILL.md`
- release/readiness handoff → `.github/skills/prepare-release/SKILL.md`

Skills are portable procedures. They do not widen the authority of the active agent or verifier.

## Context discipline

Keep `AGENTS.md` as a map rather than an encyclopedia. Deeper repository docs are the structured local knowledge base, and `SKILL.md` should contain the repeatable task procedure rather than duplicate that knowledge base.

Normal repository tasks should not fetch Notion/Drive. Escalate only when `context/governance-lock.yaml` says upstream synchronization is necessary or the owner explicitly requests it.

## Instruction priority

Explicit user/system/developer instructions can authorize a narrow exception to repository defaults, but the exception must be compatible with stronger safety/authority boundaries and recorded in the resulting handoff/receipt when it changes mutation policy.

If a skill's default procedural choice conflicts with an explicit authorized task instruction, follow the authorized task instruction while preserving the skill's stronger authority/safety stops.

## Authority discipline

A Codex review remains model advisory unless a declared verifier/human authority contract says otherwise. Codex may propose fixes and evidence; it does not create merge/release authority through confidence or repetition.