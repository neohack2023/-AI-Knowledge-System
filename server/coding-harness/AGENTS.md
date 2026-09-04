# Coding Harness Agent Instructions

These instructions apply to `server/coding-harness/**` and supplement the root `AGENTS.md`.

## Read before editing

- `../../docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md`
- relevant schemas and tests for the contract being changed
- current exact-head CI behavior in `../../.github/workflows/ci.yml` when receipt or gate semantics are involved

## Core acceptance law

The search/repair agent proposes candidates. The declared verifier owns terminal acceptance for its bound obligation.

- `MODEL_ADVISORY` has no terminal mechanical authority.
- A PASS is local to the verifier's declared obligation.
- Stale or mismatched evidence fails closed.
- Incomplete coverage cannot become terminal ACCEPT.
- Merge, deployment, release, promotion, and owner authorization remain separate gates.

## Identity-bearing evidence

Trust-bearing state must identify what it applies to. Do not introduce a loose boolean where a stale value could survive a candidate transition.

For any new or changed decision field, ask:

1. What exact object, candidate head, artifact, or base-to-head transition does this claim describe?
2. What evidence produced the claim?
3. Can the claim be carried onto a later head without re-evaluation?
4. If it becomes stale, does the evaluator fail closed?

At minimum preserve these distinctions when applicable:

- candidate head identity;
- hard-gate evidence head identity;
- FULL-review evidence head identity;
- scoped-review evidence head identity and review class;
- delta-classification base and head identity;
- risk-classification candidate identity or monotonic effective-risk history;
- owner-authorization head identity.

If a code-changing head changes, prior head-bound evidence is stale unless the contract mechanically proves otherwise.

## Review-class and transition rules

- Review freshness does not prove review depth.
- A current FULL review is durable evidence for that immutable head; a later narrower review on the same head must not erase it.
- Scoped repair review is valid only when the repair-only/scope classification is bound to the exact transition being reviewed.
- Stale or unbound delta classification must fail closed to the stronger review path.
- Risk must not silently decrease because a caller reused an earlier classification. Bind risk to the current candidate or derive a monotonic effective tier across transitions.
- Confirmed authority, security, data-loss, or contract findings must not be downgraded merely because the repair resolves the original comment.

## Decision ordering

When a convergence evaluator combines these concerns, prefer an order that prevents stale state from driving new work:

1. validate input identities and binding shapes;
2. verify exact-head hard-gate evidence;
3. derive current effective risk;
4. establish required current review currency and review class;
5. evaluate unresolved blocking findings;
6. evaluate the configured repair breaker;
7. require owner authorization bound to the exact candidate;
8. only then derive merge eligibility.

Do not let a stale finding trigger another repair before the repaired head has received the review required for that head.

## Regression requirements

For trust-binding changes, tests should include stale-state adversarial cases, not only happy paths.

Useful patterns include:

- PASS at H1 applied to H2;
- owner authorization at H1 applied to H2;
- FULL review at H1 versus scoped review at H2;
- repair-only classification for H1→H2 reused at H3;
- LOW/STANDARD risk from H1 reused after H2 introduces a sensitive boundary;
- FULL review followed by a narrower review on the same immutable head;
- repair-breaker behavior before and after current-head review.

When a review finds a new trust failure, add the smallest regression that reproduces the stale carry-over or incorrect terminal transition.

## Breaker behavior

Respect the task-specific repair budget. At the configured ceiling with a confirmed blocking finding, return or record adjudication. Do not create an implicit extra repair round and do not treat the breaker as permission to merge.

## Handoff

Report exact candidate SHA, evidence SHA(s), review class/head, breaker state, tests run, CI receipt state, unresolved findings, and owner authorization state. Never summarize these into a generic `green` or `approved` flag when the underlying identities differ.