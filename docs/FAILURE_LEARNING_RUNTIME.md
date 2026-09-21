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
