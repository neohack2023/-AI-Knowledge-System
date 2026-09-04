# Repository Semantic Handoff

State: `REPO_AUTONOMY_PHASE_5 / SELF_SUFFICIENT_REPO_ACTIVE / NATIVE_SKILLS_ACTIVE / ORGANIZATION_AUDIT_ACTIVE / UPSTREAM_SYNC_ACTIVE`

## Stable baseline

The repository organizational skeleton introduced by PR #70 is live. Owner-authorized direct-main staging materialized Phase 1 self-sufficient context, Phase 2 native adapters/custom agents, Phase 3 repository-native skills, Phase 4 deterministic organization auditing, and Phase 5 bounded upstream governance synchronization.

Historical staging anchors:

- Phase 1 direct-main anchor: `62c0dca33cce40250317c25854fb1c2f6376ba99`.
- Phase 1/2 handoff anchor before Phase 3: `e8104449968d2db6daac61015155e769e00e5bd5`.
- Phase 3 terminal anchor before Phase 4: `29da4bd0031a29cb3389a0a9f67d76e39c6ef047`.
- Phase 4 terminal anchor before Phase 5: `bd0e1d19243fa03088d80d555e944fa2fdef4601`.

Do not treat historical SHAs in this file as current `main`. Resolve current branch/commit/PR/CI facts live from GitHub.

## Current operating model

Normal repository work is self-contained:

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

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE` is now the active repository policy.

External governance contact is a separate maintenance path:

```text
governance-lock trigger / explicit owner sync
→ Knowledge Steward
→ sync-governance skill
→ pinned upstream governance snapshot
→ semantic delta classification
→ reconciliation or fail-closed stop
→ immutable sync receipt + digest binding
→ bounded freshness refresh
→ governance-sync validation
→ organization audit
```

## Installed repository-native skills

Canonical project skills under `.github/skills/`:

- `plan-feature` → Planner
- `review-pr` → Reviewer
- `verify-head` → Verifier
- `harvest-lesson` → Knowledge Steward
- `sync-governance` → Knowledge Steward
- `prepare-release` → Release Steward

Skills package repeatable **how**. They do not widen role, verifier, merge, release, deployment, or owner authority.

## Organization audit

The repository mechanically audits its own agent operating structure through `npm run check:agent-system` and `.github/workflows/agent-system-audit.yml`.

A green organization audit is obligation-local. It does not imply application correctness, clean advisory review, merge eligibility, merge authorization, deployment authorization, or release authority.

## Upstream synchronization

Phase 5 adds `npm run check:governance-sync` plus `.github/skills/sync-governance/SKILL.md` and `docs/agent-system/governance-sync/`.

The recurring upstream supply set is deliberately limited to stable global/cross-repository repository-governance sources:

- `AIOS_GITHUB_GOVERNED_EXECUTION_CONTRACT_v0.1`
- `VERIFIER_OWNED_ACCEPTANCE_01`
- `CODING-HARNESS-01`

Repository organizational/self-sufficiency MASON plans remain historical implementation evidence rather than recurring upstream dependencies. This avoids making the synchronization plan invalidate its own snapshot whenever it records a sync episode.

The first Phase 5 receipt is `GSYNC-20260904-001`. It records `MATERIAL_DELTA_RECONCILED` for two bounded differences:

1. explicit owner-authorized direct-main staging was reconciled as a phase-specific, non-reusable exception while branch/PR delivery remains the default;
2. the recurring upstream source set was normalized to stable governance contracts rather than mutable repository implementation plans.

`valid_through` remains `2026-10-04`, mechanically derived from the 30-day freshness policy and the 2026-09-04 sync date. A same-day synchronization does not invent a longer freshness horizon.

## Freshness law

A successful upstream read does not renew governance by itself. Freshness can advance only when the immutable receipt is `NO_MATERIAL_DELTA` or `MATERIAL_DELTA_RECONCILED` and the validator proves the receipt digest, source set, delta disposition, authority boundary, and derived `valid_through` value.

`MATERIAL_DELTA_PENDING` fails closed and cannot renew freshness.

## Direct-main staging authorization

The owner explicitly authorized Phases 1–5 as separate direct-main staging operations on 2026-09-04.

Each authorization is narrow and non-reusable without new owner direction. Phase 5 completes the repository-autonomy staging bridge; default future repository delivery returns to the normal branch/PR discipline unless the owner explicitly grants another bounded exception.

## Active concerns

- PR #69 remains a separate SENSITIVE exact-head CI correction with an unresolved direct-child YAML-binding P2. Repository-autonomy work does not silently resolve it.
- PR #71 and PR #72 are closed without merge as superseded staging carriers.
- Global/cross-repository AIOS authority has not cut over into GitHub. The checked-in governance bundle is the repository-safe execution snapshot for normal work.

## Next repository actions

1. Operate under the Phase 5 local-first model and run upstream synchronization only when the lock or owner triggers it.
2. Independently adjudicate/repair PR #69; do not fold it into repository autonomy work silently.
3. Add new organization/sync audit checks only after a real failure mode demonstrates value.
4. Evaluate future skills and governance sources from repeated evidence rather than manufacturing decorative layers.

## Resume rule

A new repository agent resumes from this file plus live GitHub state. It should not fetch Notion or Drive merely to reconstruct repository identity, semantic phase, operating law, role system, procedure catalog, or autonomy state. External synchronization is a controlled Knowledge Steward maintenance operation triggered only by the governance lock or explicit owner direction.
