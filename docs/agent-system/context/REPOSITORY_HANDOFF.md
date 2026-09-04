# Repository Semantic Handoff

State: `REPO_AUTONOMY_PHASE_2 / PHASE_1_LIVE / NATIVE_ADAPTERS_ACTIVE / DIRECT_MAIN_STAGING`

## Stable baseline

The repository organizational skeleton introduced by PR #70 is live, and owner-authorized direct-main staging has now materialized the Phase 1 integrity/self-sufficiency bundle plus Phase 2 adapter layer.

Historical staging anchor: Phase 1 direct-main commit `62c0dca33cce40250317c25854fb1c2f6376ba99`.

Do not treat that SHA as current `main`. Resolve current branch/commit/PR/CI facts live from GitHub.

## Current semantic phase

Normal repository work now has a local bootstrap:

```text
AGENTS.md
→ local context + governance lock
→ knowledge index
→ touched-path instructions
→ bounded role / native custom agent when useful
→ command + PR rules + plan/feature dossier
→ implementation/review/verification
```

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE` remains the target and current staging policy.

## Phase 2 adapters now active

- OpenAI Codex: hierarchical root/nested `AGENTS.md` routing into the local repository context.
- GitHub Copilot: repository-wide `.github/copilot-instructions.md` plus path-specific `.github/instructions/**`.
- GitHub Copilot custom agents: Coordinator, Planner, Implementer, Reviewer, Verifier, Knowledge Steward, Release Steward, and Critic under `.github/agents/`.
- Vendor adapter documentation: `docs/agent-system/adapters/`.

Tool-native profiles project repository roles; they do not widen authority.

## Direct-main staging authorization

The owner explicitly authorized Phase 1 and Phase 2 staging directly on `main` without PR/branch mediation on 2026-09-04. This is a bounded staging exception, not a permanent replacement for the repository's default branch/PR discipline.

## Active concerns

- PR #69 remains a separate SENSITIVE exact-head CI correction with an unresolved direct-child YAML-binding P2. Do not infer that Phase 2 routing solves its workflow/test defect.
- Open PRs #71 and #72 were staging carriers for content now materialized directly on `main`; they should not be treated as the authoritative delivery path for Phase 1/2.
- Global/cross-repository AIOS authority has not cut over into GitHub. The checked-in governance bundle is the repository-safe execution snapshot for normal work.

## Next repository actions

1. Close/supersede staging PRs #71 and #72 so their stale branch state is not mistaken for active delivery state.
2. Phase 3: convert stable lifecycle commands into repository-native task skills where the current tool supports them.
3. Phase 4: add mechanical organization checks for governance-lock state, instruction/agent references, knowledge links, source-evidence edges, feature dossiers, semantic handoff freshness, and decision/plan drift.
4. Define an optional Knowledge Steward upstream-sync workflow for deliberate Notion/global-governance reconciliation.
5. Independently adjudicate/repair PR #69; do not fold it into repository autonomy work silently.

## Resume rule

A new repository agent resumes from this file plus live GitHub state. It should not fetch Notion merely to reconstruct the repository's identity, semantic phase, operating law, role system, or current autonomy plan.