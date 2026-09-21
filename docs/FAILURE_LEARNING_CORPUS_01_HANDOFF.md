# FAILURE_LEARNING_CORPUS_01 — Checkpoint + Handoff

Status: DRAFT PR / implementation candidate
PR: #95
Branch: `aios/failure-learning-corpus-01`
Observed branch head: `7237cab5232a1c36cca5008b01901d0c1c191f1b`
Base main: `286942c933b3d5447034ebdeba77c02e85dbe55f`

## Resume here first

This file is the smallest repo-side resume packet for the AIOS failure-learning project.

Read in this order:

1. this handoff;
2. `docs/FAILURE_LEARNING_RUNTIME.md`;
3. `config/failure-learning/corpus-v0.1.json`;
4. `server/failure-learning/replay.ts`;
5. `server/failure-learning/d1-store.ts`;
6. `server/failure-learning/model.ts`;
7. `server/failure-learning/runtime.ts`;
8. `tests/failure-learning.test.ts`;
9. PR #95 live CI/review state;
10. Google Drive repository inventory row for `python/cpython` and its context packet.

Do not reconstruct the project from chat history if these surfaces are available.

## Mission

Learn reusable failure-prevention knowledge from public open-source pull-request histories without leaking future evidence into the hypothesis step and without treating merge state as correctness.

The model must replay a PR chronologically, form a sealed hypothesis from evidence available at an explicit cutoff, reveal later review/CI/fix evidence, score the hypothesis, checkpoint the episode, then carry only eligible prior lessons into later episodes.

## Authority split

- GitHub target repository history: external source authority for PRs, commits, reviews, issues, checks, reverts, and follow-up fixes.
- Google Drive AIOS: registration/routing authority for external Research Sources and derived context packets.
- `neohack2023/-AI-Knowledge-System`: implementation authority for the failure-learning runtime.
- D1: durable runtime data only after schema deployment and successful readiness checks.
- Learned lessons: `CANDIDATE_ONLY`; no canon, merge, execution, specialist-selection, or upstream-write authority.

## External repository registration

First source: `python/cpython`
GitHub repository ID: `81598961`
AIOS binding: `Research Source`
Project Scope binding: NONE
Upstream write authority: NONE

Drive context packet:
`REPOSITORY CONTEXT PACKET — python/cpython — Research Source v0.1`
Drive file ID: `1k0nMqDJajc_RKDqIt0EIExTu_QkzxcuBTiVCQ2cbnpY`

Repository inventory:
`GITHUB_REPOSITORY_INVENTORY — v0.2-context-packets`
Drive spreadsheet ID: `1PU0TXaI_nbpIsnlfI-crGvuLT0KywaXoTJuZ-Wyt1ok`
Registered row observed: row 37.

## Pilot lineage

Primary training episode:
- python/cpython PR #121143
- later reverted by PR #123303
- revised implementation returned as PR #123413

This lineage is intentionally chosen because it proves that `MERGED` is an intermediate repository event, not a durable correctness label.

Expected terminal classification for the original episode:
`MERGED_THEN_REVERTED`

The learner must not receive that label, the revert, or the final Take 2 fix before its earlier hypothesis cutoff.

## Implemented in PR #95

- D1 schema and migration for:
  - research-source repositories;
  - episodes;
  - ordered evidence events;
  - sealed hypotheses;
  - candidate lessons;
  - paired evaluations;
  - shadow model state;
  - predictions;
  - checkpoints.
- Temporal replay with explicit `evidence_cutoff_sequence`.
- Future-evidence hiding.
- Lineage-aware terminal labels.
- Candidate lesson eligibility that blocks target-episode/future leakage.
- Shadow-only `ONLINE_LOGISTIC_V0_1` failure-risk model.
- Read-only MCP surfaces:
  - `failure_learning_status`;
  - `failure_learning_replay`;
  - `failure_learning_predict`.
- Tests covering cutoff hiding, terminal-label visibility, hypothesis verdicts, lesson eligibility, and model authority boundaries.

## Non-negotiable evaluation law

For episode N:

`MODEL_N + LESSONS_<N -> PREDICTION_N -> OBSERVE OUTCOME_N -> CHECKPOINT_N -> TRAIN -> MODEL_N+1`

Never train on episode N before recording its prospective prediction.

Never retrieve a lesson whose `eligible_after` is later than the target evidence cutoff.

Never use a lesson sourced from the same target episode.

## Prevention proof

The system is not allowed to claim improvement merely because retrieval works or the model score changes.

Use held-out matched replay:

`LESSONS_OFF` vs `LESSONS_ON`

Keep model, tools, evidence cutoff, grader, and target episode fixed.

Track at minimum:
- failure-mechanism accuracy;
- early failure detection;
- correct abstention;
- false intervention;
- repeated-failure avoidance;
- tool calls;
- latency.

## Current validation state

PR #95 was opened as a draft at branch head `7237cab5232a1c36cca5008b01901d0c1c191f1b`.

CI run #350 (run ID 35553415470) completed successfully on head `466d3b6b3493b79a9fab7a92e148a7297756b619`.

Implementation CI is GREEN at this checkpoint. Deployment is still UNVERIFIED because the D1 migration has not been applied to the live Cloudflare database. Merge/deploy remains a separate human gate.

## Next bounded slice

1. Read PR #95 live head and confirm CI has not regressed from run #350.
2. After human merge/deploy authorization, verify the D1 migration and `failure_learning_status` readiness.
3. Materialize CPython PR #121143 as a chronological D1 episode.
4. Use source pointers/digests + bounded normalized summaries; do not commit copied review threads.
5. Select an early cutoff before the portability outcome is known.
6. Run the LLM hypothesis step and persist the sealed hypothesis.
7. Reveal later review/platform evidence in order.
8. Resolve the hypothesis as SUPPORTED / REJECTED / INCONCLUSIVE.
9. Follow the merge -> revert -> Take 2 lineage before final episode label.
10. Write a checkpoint containing dataset version, episode count, hypothesis count, model digest/state, and prevention metrics.
11. Only then update the shadow model.
12. Select a second PR as held-out and run LESSONS_OFF / LESSONS_ON replay.

## Stop conditions

Stop and surface a blocker if:
- evidence timestamps/order cannot be established;
- a PR's later lineage is ambiguous;
- GitHub source evidence is missing or conflicting;
- D1 schema is unavailable;
- a lesson would leak future or target-episode evidence;
- model output is being used as execution or specialist-selection authority;
- prevention metrics cannot distinguish OFF from ON.

## Cross-chat resume phrase

Use:
`Resume FAILURE_LEARNING_CORPUS_01 from the Drive/GitHub handoff. Resolve PR #95 live state first, then continue from the smallest unverified step.`

That phrase should be enough to recover the work without relying on prior chat residue.
