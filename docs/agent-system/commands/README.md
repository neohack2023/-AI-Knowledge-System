# Repository Lifecycle Commands

These are tool-agnostic command contracts. Tool-specific adapters may invoke them, but adapters do not change their authority.

## `plan-feature`

**Primary role:** Planner  
**Mutation:** read-only by default; planning-doc write only when explicitly authorized.

1. Resolve exact concern, base, scope, non-goals, and risk hypothesis.
2. Load smallest relevant instructions/rules.
3. Decide ordinary vs stacked PR shape.
4. Create or update a feature-dossier skeleton when material enough to justify one.
5. Declare verification and review obligations.

Output: bounded implementation plan and handoff to Implementer.

## `review-pr`

**Primary role:** Reviewer  
**Mutation:** `READ_ONLY`.

1. Resolve current PR head and three-dot/base comparison.
2. Load root + touched-area instructions.
3. Load `pr-rules/common.md` plus touched-area rules.
4. Load the relevant feature dossier/deeper docs only when applicable.
5. Review exact candidate.
6. Return `Summary / Blocking / Should fix / Nice to have / Verified`.
7. Suggest lesson candidates separately; do not write/promote them.

Output: advisory review bound to the reviewed head.

## `verify-head`

**Primary role:** Verifier  
**Mutation:** verifier-owned evidence only.

1. Resolve current candidate head live.
2. Reject stale head-bound evidence unless transferability is mechanically proven.
3. Run declared targeted/full checks.
4. Record verifier authority class, obligations, run ID, exact head/artifact, and result.

Output: acceptance evidence for declared obligations only.

## `harvest-lesson`

**Primary role:** Knowledge Steward  
**Mutation:** branch documentation write after authorization.

1. Require a confirmed source event.
2. Create an anti-pattern candidate using the canonical schema.
3. Preserve failure mechanism, why it looked reasonable, repair, and regression guard.
4. Search for duplicates/recurrence.
5. Propose a compact promoted rule when justified.
6. Stop for human adjudication before promotion.

Output: candidate record plus optional promotion proposal.

## `prepare-release`

**Primary role:** Release Steward  
**Mutation:** read-only unless an evidence-summary write is explicitly authorized.

1. Resolve current exact head.
2. Verify required CI/verifier evidence and review class.
3. Verify breaker state and unresolved blocking findings.
4. Verify exact-head owner authorization when required.
5. Return `ELIGIBLE`, `BLOCKED`, or `ADJUDICATION_REQUIRED` with evidence.

Output never performs the merge itself.
