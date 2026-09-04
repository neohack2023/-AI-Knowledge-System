# Repository Semantic Handoff

State: `REPO_AUTONOMY_PHASE_4 / PHASE_1_2_LIVE / NATIVE_SKILLS_ACTIVE / ORGANIZATION_AUDIT_ACTIVE / DIRECT_MAIN_STAGING`

## Stable baseline

The repository organizational skeleton introduced by PR #70 is live. Owner-authorized direct-main staging materialized Phase 1 self-sufficient context, Phase 2 native adapters/custom agents, Phase 3 repository-native skills, and now Phase 4 deterministic organization auditing.

Historical staging anchors:

- Phase 1 direct-main anchor: `62c0dca33cce40250317c25854fb1c2f6376ba99`.
- Phase 1/2 handoff anchor before Phase 3: `e8104449968d2db6daac61015155e769e00e5bd5`.
- Phase 3 terminal anchor before Phase 4: `29da4bd0031a29cb3389a0a9f67d76e39c6ef047`.

Do not treat historical SHAs in this file as current `main`. Resolve current branch/commit/PR/CI facts live from GitHub.

## Current semantic phase

Normal repository work now has a local bootstrap, reusable procedure layer, and deterministic organization audit:

```text
AGENTS.md
→ local context + governance lock
→ knowledge index
→ touched-path instructions
→ bounded role / native custom agent when useful
→ one relevant repository-native skill
→ PR rules + plan/feature dossier
→ implementation/review/verification
→ deterministic organization audit
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

Skills package the repeatable **how** for compatible agent runtimes. They do not widen role or verifier authority and contain no pre-approved shell/bash `allowed-tools` grant.

## Phase 4 organization audit active

The repository now mechanically audits its own agent operating structure through `npm run check:agent-system` and `.github/workflows/agent-system-audit.yml`.

The audit checks:

- `SKILL.md` discovery/frontmatter and skill-registry agreement;
- canonical role → skill bindings;
- repository-relative Markdown links in agent/instruction surfaces;
- governance-lock phase and explicit expiry freshness;
- immutable anti-pattern provenance and promoted-rule targets;
- feature dossier, ADR, and execution-plan discoverability/required structure;
- semantic handoff phase drift.

The dedicated workflow runs on relevant pull requests, pushes to `main`, and manual dispatch. It checks out the immutable PR head when reviewing a PR and the pushed commit for `main` events. Generated audit receipts remain under `outputs/**` and are uploaded as workflow artifacts.

A green organization audit is obligation-local. It does not imply application correctness, clean advisory review, merge eligibility, merge authorization, deployment authorization, or release authority.

## Governance freshness

The checked-in governance snapshot now declares an explicit `valid_through` date. When it expires, organization audit fails closed until the Knowledge Steward deliberately reviews and refreshes the snapshot. An expired local bundle is an external-synchronization trigger, not permission to silently guess current global policy.

## Direct-main staging authorization

The owner explicitly authorized Phase 1 and Phase 2 direct-main staging on 2026-09-04, then separately authorized Phase 3 and Phase 4 direct-main installation in the active conversation.

Each authorization is narrow and non-reusable without new owner direction. None changes the repository's default branch/PR discipline for later phases.

## Active concerns

- PR #69 remains a separate SENSITIVE exact-head CI correction with an unresolved direct-child YAML-binding P2. Repository-autonomy work does not silently resolve it.
- PR #71 and PR #72 are closed without merge as superseded staging carriers.
- Global/cross-repository AIOS authority has not cut over into GitHub. The checked-in governance bundle is the repository-safe execution snapshot for normal work.

## Next repository actions

1. Phase 5: define a bounded Knowledge Steward upstream-sync workflow for deliberate Notion/global-governance reconciliation and governance-lock refresh.
2. Independently adjudicate/repair PR #69; do not fold it into repository autonomy work silently.
3. Add new organization-audit checks only after a real failure mode demonstrates value; do not turn the auditor into an ever-growing style checker.
4. Evaluate whether additional repository-native skills are justified by repeated real workflows rather than manufacturing decorative skills.

## Resume rule

A new repository agent resumes from this file plus live GitHub state. It should not fetch Notion merely to reconstruct repository identity, semantic phase, operating law, role system, procedure catalog, or current autonomy plan. External synchronization is triggered only by the governance lock or explicit owner direction.
