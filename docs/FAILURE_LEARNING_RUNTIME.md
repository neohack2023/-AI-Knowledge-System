# Failure Learning Runtime v0.1

Status: implementation candidate / shadow-only learning substrate

## Goal

Turn public pull-request failure histories into temporally valid learning episodes without letting the learner read future evidence, treat merge state as correctness, or acquire repository authority.

## Episode loop

`REGISTER RESEARCH SOURCE -> CONTEXT PACKET -> OPEN EPISODE -> REPLAY TO CUTOFF -> SEAL HYPOTHESIS -> REVEAL NEXT EVIDENCE -> SCORE -> COMPLETE LINEAGE -> CHECKPOINT -> NEXT EPISODE`

A hypothesis is valid for evaluation only when it records an exact `evidence_cutoff_sequence`. Review comments, CI results, commits, reverts, follow-up PRs, and final patches after that sequence are future evidence and must not be visible to the model until the hypothesis is sealed.

## Ground-truth boundary

Merge state is not a correctness label. Episodes use lineage-aware terminal labels:

- `MERGED_STABLE`
- `MERGED_THEN_REVERTED`
- `MERGED_THEN_FIXED`
- `SUPERSEDED`
- `CLOSED_UNMERGED`
- `ABANDONED_OR_WORKFLOW`
- `INCONCLUSIVE`

A later revert or corrective PR supersedes the earlier outcome rather than rewriting history.

## Database roles

- repositories: registered external Research Sources only;
- episodes: one PR-centered replay lineage;
- events: ordered normalized public evidence with source pointers/digests;
- hypotheses: model/LLM claims bound to an evidence cutoff;
- lessons: CANDIDATE_ONLY semantic/procedural/negative knowledge;
- evaluations: paired LESSONS_OFF / LESSONS_ON measurements;
- predictions: prospective shadow failure-risk predictions;
- models: versioned online coarse risk models;
- checkpoints: immutable episode/model/evaluation summaries.

Raw third-party review text is not required in source control. GitHub remains authority for public PR/review content.

## ML boundary

The first model is `ONLINE_LOGISTIC_V0_1`, an interpretable online logistic classifier over hashed categorical failure features. It predicts only coarse failure risk. It is SHADOW_ONLY and has `authority_effect: NONE`.

A risk score may increase retrieval or verification pressure. It cannot select a specialist, choose a fix, authorize a retry, mutate GitHub, merge, deploy, or promote a lesson.

Model update order is causal:

`predict with model N -> record prediction -> observe terminal episode outcome -> checkpoint -> update to model N+1 -> next episode`

The episode being predicted must never train the model before its outcome is observed.

## Prevention proof

Learning is credited only on held-out future episodes using matched comparisons:

`LESSONS_OFF` versus `LESSONS_ON`

Keep task, model, tools, evidence cutoff, and grader fixed. Measure mechanism accuracy, early failure detection, correct abstention, false intervention, repeated-failure avoidance, tool calls, and latency. Retrieval alone is not improvement.

## Pilot

The first registered source is `python/cpython`. Pilot episode `PR #121143` later merged, was reverted by `#123303`, and returned as `#123413` ("Take 2"). This is intentionally used to verify that the learner does not equate a merge with durable correctness.

## Authority

This runtime stores evidence and candidate learning. It grants no upstream write authority and no AIOS canon-promotion authority.

## Historical holdout integrity

A historical PR is clean for prevention evaluation only when the model-facing cutoff is bound to immutable evidence. Current PR title/body are mutable and MUST NOT be treated as the opening state unless an authoritative edit history reconstructs that exact state.

Preferred cutoff:

`blind structural selection -> opaque candidate ID -> resolve first PR commit internally -> freeze immutable commit SHA + diff digest -> seal LESSONS_OFF and LESSONS_ON predictions -> reveal later PR history -> grade`

If mutable PR metadata is exposed before prediction, mark the run `TAINTED_MUTABLE_PR_METADATA`. Preserve it as calibration evidence, but exclude it from prevention-gain metrics.

Holdout 0001 discovered this leak. Holdout 0002 used an immutable initial-commit cutoff and produced the first clean paired result. Its single-case result favored LESSONS_ON, but it does not authorize global promotion.

## Cross-repository applicability gate

A lesson that was useful in one repository MUST NOT activate in another repository solely because the local code pattern looks similar.

Before cross-repository activation, classify the target representation or behavior:

- `TARGET_PUBLIC_CONTRACT`
- `TARGET_INTERNAL_IMPLEMENTATION`
- `TARGET_UNRESOLVED`

A lesson such as `INCIDENTAL_TRACE_OVERFIT` may challenge a representation only when evidence supports `TARGET_INTERNAL_IMPLEMENTATION` or when the target contract remains unresolved and the lesson is used as a question rather than a conclusion.

If the target project intentionally documents, reviews, or promotes the representation as a public contract, treating it as incidental is negative transfer.

Holdout 0004 in `nodejs/node` is the first cross-repository harm fixture. The CPython-derived `INCIDENTAL_TRACE_OVERFIT` lesson overreached because Node maintainers intentionally made `BlockList.rules` the `toJSON/fromJSON` persistence interface.

## Negative-transfer accounting

Every clean paired evaluation records improvement and harm separately.

Required states:

- `MEMORY_HELPED`
- `MEMORY_HELPED_SMALL`
- `MEMORY_NEUTRAL`
- `MEMORY_HARMED_MINOR`
- `MEMORY_HARMED_MAJOR`

A negative-transfer event is never averaged away. Record the lesson, mechanism, target-repository applicability error, and harm class.

Current clean holdout aggregate after Holdout 0004:

- clean holdouts: 3
- positive transfer: 2
- neutral transfer: 0
- negative transfer: 1
- minor harm: 1
- major harm: 0
- negative-transfer rate: 33.3%

This sample is too small for promotion. The harm result strengthens the requirement for repository-specific applicability evidence before lesson activation.

## Database isolation and promotion lifecycle

Failure learning uses a dedicated D1 binding and migration lane.

- `DB`: primary AIOS/runtime database.
- `FAILURE_DB`: mutable failure-learning training database.
- primary migrations: `drizzle/**`.
- failure-learning migrations: `db/failure-learning/migrations/**`.

Training evidence, contradictory hypotheses, neutral/harmful transfer results, model state, and candidate lessons remain in `FAILURE_DB`. They do not become AIOS knowledge merely because they exist or because a newer episode was observed.

Operational persistence follows four surfaces:

1. AIOS Drive stores checkpoints, result copies, and human-readable documentation.
2. The portable tool's own database stores active learned/training state.
3. Repacked tool artifacts carry that learned state while preserving the engine release identity separately.
4. GitHub AIOS receives only distilled knowledge that has earned promotion.

Promotion is copy-with-provenance, never move or write-through:

`TRAINING (FAILURE_DB) -> PROMOTABLE -> MASON adjudication -> promotion envelope -> governed materialization into DB`

The learner itself has no cross-database write authority. A promotion envelope has `write_authority: NONE` and binds the source pattern IDs, failure-database head digest, evidence digest, scope, and MASON decision. Original training records remain in `FAILURE_DB` after promotion.

The default promotion gate is deliberately conservative: replay verified, at least three clean evaluations, at least two positive transfers, no major harm, no unresolved applicability boundary, and an explicit MASON decision. Meeting these prerequisites makes knowledge `PROMOTABLE`; it does not make it universal or self-authorizing.
