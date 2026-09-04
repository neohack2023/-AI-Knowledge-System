# Repository Lifecycle Commands

These are vendor-neutral command contracts. Tool-specific adapters and repository-native Agent Skills may invoke/project them, but neither adapters nor skills change their authority.

## Native skill projection

The canonical installed skill surface is `.github/skills/<skill-name>/SKILL.md`:

| Command contract | Installed skill | Primary role |
| --- | --- | --- |
| `plan-feature` | `.github/skills/plan-feature/SKILL.md` | Planner |
| `review-pr` | `.github/skills/review-pr/SKILL.md` | Reviewer |
| `verify-head` | `.github/skills/verify-head/SKILL.md` | Verifier |
| `harvest-lesson` | `.github/skills/harvest-lesson/SKILL.md` | Knowledge Steward |
| `sync-governance` | `.github/skills/sync-governance/SKILL.md` | Knowledge Steward |
| `prepare-release` | `.github/skills/prepare-release/SKILL.md` | Release Steward |

This file remains the vendor-neutral lifecycle contract. `SKILL.md` packages the repeatable procedure for tools supporting the Agent Skills format. Semantic changes should keep the two surfaces aligned.

## `plan-feature`

**Primary role:** Planner  
**Mutation:** read-only by default; planning-doc write only when explicitly authorized.

1. Resolve exact concern, base, scope, non-goals, and risk hypothesis.
2. Load smallest relevant instructions/rules.
3. Decide ordinary vs stacked PR shape, or record an explicitly owner-authorized direct-main staging mode.
4. Create or update a feature-dossier skeleton when material enough to justify one.
5. Declare verification and review obligations.

Output: bounded implementation plan and handoff to Implementer.

## `review-pr`

**Primary role:** Reviewer  
**Mutation:** `READ_ONLY`.

1. Resolve current PR head/base comparison or exact authorized direct-main candidate/range.
2. Load root + touched-area instructions.
3. Load `pr-rules/common.md` plus touched-area rules.
4. Load the relevant feature dossier/deeper docs only when applicable.
5. Review exact candidate.
6. Return `Summary / Blocking / Should fix / Nice to have / Verified`.
7. Suggest lesson candidates separately; do not write/promote them.

Output: advisory review bound to the reviewed identity.

## `verify-head`

**Primary role:** Verifier  
**Mutation:** verifier-owned evidence only.

1. Resolve current candidate identity live.
2. Reject stale head-bound evidence unless transferability is mechanically proven.
3. Run declared targeted/full checks.
4. Record verifier authority class, obligations, run ID, exact head/artifact, and result.

Output: acceptance evidence for declared obligations only.

## `harvest-lesson`

**Primary role:** Knowledge Steward  
**Mutation:** repository documentation write only when authorized.

1. Require a confirmed source event.
2. Create an anti-pattern candidate using the canonical schema.
3. Preserve failure mechanism, why it looked reasonable, repair, immutable source evidence, and regression guard.
4. Search for duplicates/recurrence.
5. Keep evidence maturity and promotion scope independent.
6. Propose a compact promoted rule when justified.
7. Stop for required adjudication before promotion.

Output: candidate record plus optional promotion proposal.

## `sync-governance`

**Primary role:** Knowledge Steward  
**Mutation:** bounded repository governance/context/evidence write only when synchronization is triggered and authorized.

1. Read the governance lock and confirm an external-fetch trigger or explicit owner synchronization request.
2. Resolve the exact repository base identity live.
3. Fetch only the pinned stable upstream governance source set.
4. Record opaque source IDs plus observed last-edited/version identities; do not copy private workspace URLs into Git.
5. Compare semantic delta only; do not vendor the upstream corpus.
6. Classify `NO_MATERIAL_DELTA`, `MATERIAL_DELTA_RECONCILED`, or `MATERIAL_DELTA_PENDING`.
7. If material drift is pending, stop and do not renew freshness.
8. If no material drift remains, write the immutable sync receipt and bind its SHA-256, sync ID, date, and derived freshness window in the governance lock.
9. Run governance-sync validation plus the organization audit against the resulting exact repository identity.

Output: bounded upstream reconciliation receipt and refreshed local governance lock, or a fail-closed pending-delta handoff.

## `prepare-release`

**Primary role:** Release Steward  
**Mutation:** read-only unless an evidence-summary/handoff write is explicitly authorized.

1. Resolve current exact candidate identity.
2. Verify required CI/verifier evidence and review class.
3. Verify breaker state and unresolved blocking findings.
4. Verify exact-candidate owner authorization when required.
5. For direct-main staging, verify the resulting exact commit/range and scoped exception instead of inventing an inapplicable merge gate.
6. Return `ELIGIBLE`, `BLOCKED`, or `ADJUDICATION_REQUIRED` with evidence.

Output never performs the merge/release itself unless a separate explicit terminal-action authorization exists.
