# Repository Semantic Handoff

State: `REPO_AUTONOMY_PHASE_3 / PHASE_1_2_LIVE / NATIVE_SKILLS_ACTIVE / DIRECT_MAIN_STAGING`

## Stable baseline

The repository organizational skeleton introduced by PR #70 is live. Owner-authorized direct-main staging materialized the Phase 1 integrity/self-sufficiency bundle and Phase 2 adapter/custom-agent layer, and the owner has now separately authorized Phase 3 repository-native skills directly on `main`.

Historical staging anchors:

- Phase 1 direct-main anchor: `62c0dca33cce40250317c25854fb1c2f6376ba99`.
- Phase 1/2 handoff anchor before Phase 3: `e8104449968d2db6daac61015155e769e00e5bd5`.

Do not treat historical SHAs in this file as current `main`. Resolve current branch/commit/PR/CI facts live from GitHub.

## Current semantic phase

Normal repository work now has a local bootstrap plus reusable procedure layer:

```text
AGENTS.md
→ local context + governance lock
→ knowledge index
→ touched-path instructions
→ bounded role / native custom agent when useful
→ one relevant repository-native skill
→ PR rules + plan/feature dossier
→ implementation/review/verification
→ lesson/release handoff
```

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE` remains the operating target and current staging policy.

## Phase 2 adapters active

- OpenAI Codex: hierarchical root/nested `AGENTS.md` routing into local repository context.
- GitHub Copilot: repository-wide `.github/copilot-instructions.md` plus path-specific `.github/instructions/**`.
- GitHub Copilot custom agents: Coordinator, Planner, Implementer, Reviewer, Verifier, Knowledge Steward, Release Steward, and Critic under `.github/agents/`.
- Vendor adapter documentation: `docs/agent-system/adapters/`.

## Phase 3 repository-native skills active

Canonical installed project skills under `.github/skills/`:

- `plan-feature` → Planner
- `review-pr` → Reviewer
- `verify-head` → Verifier
- `harvest-lesson` → Knowledge Steward
- `prepare-release` → Release Steward

The vendor-neutral command contracts remain under `docs/agent-system/commands/`. Skills package the repeatable **how** for compatible agent runtimes; they do not widen role or verifier authority.

The Phase 3 skills intentionally contain no pre-approved shell/bash `allowed-tools` grant.

## Direct-main staging authorization

The owner explicitly authorized Phase 1 and Phase 2 direct-main staging on 2026-09-04, and then separately authorized Phase 3 direct-main installation in the active conversation.

Each authorization is narrow and non-reusable without new owner direction. Neither changes the repository's default branch/PR discipline for later phases.

## Active concerns

- PR #69 remains a separate SENSITIVE exact-head CI correction with an unresolved direct-child YAML-binding P2. Repository-autonomy work does not silently resolve it.
- PR #71 and PR #72 are closed without merge as superseded staging carriers.
- Global/cross-repository AIOS authority has not cut over into GitHub. The checked-in governance bundle is the repository-safe execution snapshot for normal work.
- The temporary Phase 3 setup branch carries no unique Phase 3 work because the owner redirected delivery to `main` before installation.

## Next repository actions

1. Phase 4: mechanically validate the organizational system itself: skill/frontmatter discovery, role→skill references, instruction links, governance-lock state, knowledge links, source-evidence edges, feature dossiers, handoff freshness, and decision/plan drift.
2. Define an optional Knowledge Steward upstream-sync workflow for deliberate Notion/global-governance reconciliation.
3. Independently adjudicate/repair PR #69; do not fold it into repository autonomy work silently.
4. Evaluate whether additional repository-native skills are justified by repeated real workflows rather than manufacturing decorative skills.

## Resume rule

A new repository agent resumes from this file plus live GitHub state. It should not fetch Notion merely to reconstruct repository identity, semantic phase, operating law, role system, procedure catalog, or current autonomy plan.