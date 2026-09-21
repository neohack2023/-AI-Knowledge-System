# PR_REVIEW_CONVERGENCE_01

Status: candidate implementation / no default-branch authority until merged
Scope: AIOS repository verification engineering

## Problem

AIOS verification deliberately binds executable evidence to an exact repository head. That remains correct for mechanical checks. The failure mode appears when MODEL_ADVISORY review is treated as if every code-changing repair invalidates all prior review evidence and requires another unrestricted whole-PR review.

Observed PR #66 demonstrated the loop:

`broad review -> finding -> repair -> changed head -> new broad review -> new finding -> repeat`

The loop improved the code, but it also turned an advisory reviewer into an effectively unbounded blocking search process. This conflicts with VERIFIER_OWNED_ACCEPTANCE_01, where model review has no terminal mechanical authority, and with the previously researched bounded-repair breaker.

PR #67's review passes exposed a related trust-model defect: identity-bearing evidence and transition-bearing claims must not be represented as loose state that can silently survive a candidate change.

## Retained invariants

This policy does NOT weaken:

- exact-head CI and CodingHarness receipts;
- deterministic/task-native verifier ownership;
- public release, security, authority, migration, schema, or persistence gates;
- fail-closed behavior for hard verifier failure;
- explicit owner merge authorization;
- scope isolation;
- provenance and evidence retention.

## Trust-binding law

The evaluator preserves candidate identity across every trust-bearing input and transition claim.

Required bindings:

- `candidateHeadSha` — exact candidate being evaluated;
- `hardGateEvidenceHeadSha` — exact head mechanically verified by the hard gate;
- `fullReviewHeadSha` — exact head that has received a FULL review, or null if none;
- `reviewedHeadSha` — exact head covered by the latest model review, or null;
- `deltaClassificationBaseSha` — retained FULL-review baseline used to classify the candidate delta;
- `deltaClassificationHeadSha` — exact candidate head covered by that delta classification;
- `ownerAuthorizedHeadSha` — exact head explicitly authorized by the owner, or null.

Freshness is derived by exact SHA equality. Callers do not supply `currentHeadReviewed`, `headChangedSinceFullReview`, `ownerMergeAuthorized`, or equivalent freshness shortcuts.

A hard-gate PASS whose evidence head differs from `candidateHeadSha` is `BLOCKED_HARD_GATE`. An owner authorization for a different head is stale and cannot produce merge eligibility.

A STANDARD candidate may reduce review scope based on `repairOnlyDelta` / `scopeExpanded` only when those classifications are bound to the retained FULL-review baseline and the exact candidate head. An unbound or stale classification fails closed to `REQUIRE_FULL_REVIEW`.

## Risk tiers

### LOW

Examples: documentation, comments, tests that do not alter product/runtime behavior, non-authoritative metadata.

- Mechanical gates remain required when applicable.
- Model review is advisory/optional by default.
- Owner merge authorization remains exact-head and separate.

### STANDARD

Normal bounded implementation changes.

1. One broad review of the review-ready candidate.
2. Confirm and batch in-scope blocking findings where practical.
3. Run task-native gates on the repaired head.
4. If the cumulative delta from the retained FULL-review baseline to the candidate is verified repair-only and does not widen scope, review only that repair delta.
5. Preserve the earlier broad review as lineage evidence for untouched portions of the diff.
6. New out-of-scope P2/P3 findings become follow-up work, not silent scope expansion.
7. Default repair breaker: two repair rounds, configurable by task.

### SENSITIVE

Authority/security boundaries, destructive data behavior, persistence/migrations, release controls, identity/permission systems, or equivalent blast radius.

- Full review remains required on the exact current head after a code-changing update.
- A confirmed AUTHORITY, SECURITY, DATA_LOSS, or CONTRACT finding elevates the effective tier to SENSITIVE even after that finding is repaired.
- Hard gates remain independently required.
- Default repair breaker: three repair rounds, configurable by task.
- Residual findings after the breaker go to explicit owner adjudication rather than automatic continued repair.

## Blocking law

A confirmed unresolved finding blocks the active PR when any of the following is true:

- it is AUTHORITY, SECURITY, DATA_LOSS, or CONTRACT class;
- it is P0/P1/P2 and IN_SCOPE.

A confirmed finding is deferred when it is non-critical and OUT_OF_SCOPE, or P3, unless the owner explicitly widens the task.

Reviewer severity alone does not authorize scope growth.

## Review-currency law

Review currency is evaluated before unresolved findings and the repair breaker after a head change.

This prevents a stale finding from automatically triggering another repair, or exhausting the breaker, before the repaired candidate has been reviewed.

- STANDARD repair-only candidate -> current-head `SCOPED_REPAIR` review may satisfy review currency only with a current base/head-bound delta classification;
- non-repair or scope-widening STANDARD candidate -> current-head `FULL` review;
- SENSITIVE candidate -> current-head `FULL` review;
- a FULL review recorded by `fullReviewHeadSha == candidateHeadSha` remains valid evidence for that immutable head even if a later narrower review is also performed on the same head;
- an unchanged reviewed head does not require duplicate review merely to produce another disposition.

Review identity and review class are separate obligations. Current-head identity cannot substitute for required review depth. Likewise, `latestReviewKind` does not erase a retained FULL review already recorded for the same immutable candidate.

## Delta-classification law

`repairOnlyDelta` and `scopeExpanded` classify a transition, not a timeless property.

For STANDARD scoped-review eligibility, the classification must be bound to:

`deltaClassificationBaseSha == fullReviewHeadSha`

and

`deltaClassificationHeadSha == candidateHeadSha`.

If either binding is absent or stale, the evaluator fails closed to a FULL review. This prevents a repair-only classification from H1 -> H2 being inherited by a later H3 that contains non-repair or scope-widening changes.

## Repair breaker

When current-head review is complete and unresolved blocking findings remain at the configured repair-round limit:

`ADJUDICATE_STOP`

The system must stop dispatching automatic repair/re-review work and surface:

- remaining findings;
- affected obligations;
- whether they are in scope;
- hard-gate state and exact evidence head;
- cost/round count;
- options: fix deliberately, defer/split, restack, or abandon.

The breaker is not a merge bypass. It is a loop terminator.

## PR size and stacking

Prefer one self-contained concern per PR. When a change has multiple dependent concerns, use stacked PRs where practical so each layer has a focused diff and its own evidence. Do not split a change so aggressively that a layer becomes untestable or meaningless.

## State machine

```text
candidate exact head
  -> validate SHA bindings
  -> hard gate exact-head evidence
     -> fail/block/stale => BLOCKED_HARD_GATE
  -> derive effective risk tier
     -> any confirmed critical-class finding => SENSITIVE
  -> retain FULL-review evidence by fullReviewHeadSha == candidateHeadSha
  -> STANDARD without current FULL review
     -> validate delta classification base/head binding
        -> unbound/stale => REQUIRE_FULL_REVIEW
  -> scope-expanded/SENSITIVE current head without FULL review => REQUIRE_FULL_REVIEW
  -> STANDARD non-repair current head without FULL review => REQUIRE_FULL_REVIEW
  -> STANDARD repair-only current head without scoped/full review => REQUIRE_SCOPED_REREVIEW
  -> current-head review complete
     -> confirmed blocking finding => REPAIR_REQUIRED
        -> breaker reached => ADJUDICATE_STOP
  -> no blocking findings
  -> ownerAuthorizedHeadSha == candidateHeadSha ?
     -> no => OWNER_AUTHORIZATION_REQUIRED
     -> yes => MERGE_ELIGIBLE
```

## Implementation

`server/coding-harness/review-convergence.ts` exposes a pure `evaluateReviewConvergence()` policy function. It does not merge, modify a PR, resolve threads, or authorize repository writes.

The function returns explicit decision, effective risk tier, and reason codes so future orchestration can remain fail-visible instead of embedding the policy in prompts.

## Verification controls

The focused policy suite now covers:

- hard verifier failure;
- stale hard-gate PASS evidence;
- initial broad review;
- in-scope repair requirement;
- repaired-head review before inherited findings;
- breaker only after current-head review;
- clean scoped repair convergence;
- STANDARD non-repair current head rejecting scoped review and requiring FULL review;
- stale delta classification from an earlier head failing closed to FULL review;
- retained current-head FULL review surviving a later scoped review on the same immutable head;
- out-of-scope advisory deferral;
- critical findings remaining blocking;
- repaired critical finding elevating STANDARD to SENSITIVE;
- current full review discharging scope expansion;
- scope expansion requiring full review when stale;
- stale owner authorization;
- sensitive head-change review;
- malformed SHA rejection.

## Evidence

- AIOS PR #66: repeated exact-head review/repair cycle with many successive findings and repair commits.
- AIOS VERIFIER_OWNED_ACCEPTANCE_01: MODEL_ADVISORY has no terminal mechanical acceptance effect.
- Existing CodingHarness receipt runtime: verifier acceptance `artifact_version_or_head` must equal harness `head_sha`.
- AIOS Superpowers teardown: previously identified a parameterized bounded repair breaker and scoped re-review as high-value harvest candidates.
- AIOS EXECUTION_TRUST_BINDING_01: mutable labels are lookup aids; digest/version/producer lineage is identity evidence and stale trust bindings must be re-evaluated.
- GitHub documentation: review approval records the state of the diff; changed commits or merge-base changes can stale approvals, while approval of the most recent reviewable push is available as a bounded compromise.
- SLSA provenance: external parameters are untrusted inputs that must be recorded and verified downstream; resolved dependencies can record the exact Git commit resolved from a repository/ref.
- in-toto: link metadata records supply-chain step materials/products so verification can preserve the chain between inputs, actions, and outputs.
- Google engineering practices: small self-contained changes are easier to review thoroughly and merge safely.
- OpenAI Codex issue #42130 (2026-09-01): independently reports an unbounded managed review -> repair -> new-commit review loop.
- PR #67 Codex review passes on `3a4640d...`: five confirmed defects, three trust-binding and two convergence/liveness.
- PR #67 current-head FULL review on `887d132b...` (review `5115462974`): confirmed a sixth policy defect where a non-repair STANDARD candidate could incorrectly proceed from a current-head `SCOPED_REPAIR` review.
- PR #67 current-head FULL review on `ccc41d3e...` (review `5115592853`): confirmed two more defects: unbound delta classification (P1) and loss of retained current-head FULL-review evidence after a later scoped review (P2).

## Repair-round boundary

The repair for review `5115592853` consumes SENSITIVE repair round 3 of 3. After exact-head mechanical verification and the required current-head FULL review, any remaining confirmed blocking finding routes to `ADJUDICATE_STOP`; it does not authorize an automatic fourth repair round.

## Non-goals

- no automatic merge;
- no bypass of failing tests or release/security gates;
- no downgrade of task-native verifiers to model judgment;
- no automatic branch-protection mutation;
- no claim that all repositories should use identical round limits;
- no autonomous issue creation for deferred findings in v0.1.
