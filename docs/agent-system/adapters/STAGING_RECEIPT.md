# Phase 1 + Phase 2 Direct-Main Staging Receipt

State: `STAGING_ACTIVE`
Date: `2026-09-04`

The owner explicitly authorized repository self-sufficiency Phase 1 and Phase 2 to be staged directly on `main` without PR/branch mediation.

## Phase 1

Direct-main historical anchor: `62c0dca33cce40250317c25854fb1c2f6376ba99`.

Materialized:

- corrected anti-pattern evidence/promotion semantics;
- immutable lesson provenance for the seeded PR #67–#70 set;
- local project charter, semantic handoff, authority map, vendored governance bundle and governance lock;
- repository knowledge index;
- repository decisions/ADR lane;
- execution-plan lane.

## Phase 2

Materialized directly after Phase 1:

- root Codex `AGENTS.md` routing to local context;
- GitHub Copilot repository-wide instructions;
- path-specific `.github/instructions/**` adapters;
- eight `.github/agents/*.agent.md` bounded custom-agent profiles;
- Codex/Copilot adapter documentation;
- Phase 2 semantic-handoff and governance-lock activation.

Resolve the current `main` SHA live from GitHub. Do not treat this receipt as current-head evidence.

## Authority

This staging exception does not permanently authorize future direct-main writes. It does not merge global AIOS authority into GitHub. It does not resolve independent PR #69. Normal repository work is locally self-sufficient; global/cross-repository governance synchronization remains an explicit Knowledge Steward / owner path.
