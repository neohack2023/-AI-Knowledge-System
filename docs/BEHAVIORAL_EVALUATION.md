# Behavioral Evaluation (canonical entry point)

The single CLI entry point is `npm run evaluate -- --profile=learning` (or `node scripts/evaluate.mjs --profile=both`). It is intended for agent CLI, shell, CI, and future AIOS UI calls. No new acceptance authority is created.

## Profiles and admission

- `learning` (default): runs existing temporal failure-learning, episode, and promotion tests against the current source using Node. This is a **local unit/invariant** evaluation, not an operational ML effectiveness benchmark.
- `runtime`: runs the existing workflow-kernel and bridge execution suites against the built worker. Requires `dist/server/index.js`. Absent builds are reported `BLOCKED: ENVIRONMENT_NOT_READY`, not attributed to product failure.
- `both`: executes both profiles and reports `PARTIAL` when one passes and the other is blocked.

The runner does not install dependencies, build automatically, invoke a network provider, merge a branch, release, deploy, promote memory, or modify a production database. The existing CodingHarness and repository governance still determine any formal acceptance or owner approval. A runner PASS proves only that its named tests ran successfully.

## Receipts and storage

The runner atomically replaces `outputs/evaluations/latest.json` and appends one JSON line to `outputs/evaluations/runs.jsonl`. Both live under the existing ignored `outputs/` area. No per-run directory trees or numbered tool versions are generated. Future integration should ingest the same schema into the existing Execution receipt store rather than clone it into project memory.

The receipt records head SHA, Node/platform, profile, bounded command exit code, elapsed time, missing prerequisites, coverage, and status. It intentionally does not persist raw stdout/stderr, source bodies, secrets, or user prompts. Partial coverage and environmental blocks cannot be called an acceptance PASS.

This initial implementation is evaluated locally on Windows; Linux/CI and real hosted-runtime validations remain separate obligations.

## Evaluation quality and next experiments

A meaningful AIOS evaluation must specify a real task, starting state, expected observable behavior, negative control, independent verifier, measured cost and latency, environment, and potential contamination. Next stages should include a deployed/runtime API probe, real UI browser flow, temporal holdout `LESSONS_OFF` vs `LESSONS_ON` comparisons, multi-seed repeats, and adversarial failure transfer. Keep public benchmarks and private held-out task sets separate, with exact hardware/model/version metadata.

## Changelog

- 2026-11-12 — Initial canonical execution runner with two bounded profiles, environment-vs-functional failure classification, compact receipt history, and positive/negative/timeout regression controls.
- 2026-11-12 — GitHub CI now invokes the same profiles as an independent post-build step and uploads its own receipts even when the legacy build-and-test bundle fails. Existing governance gates remain unchanged.
