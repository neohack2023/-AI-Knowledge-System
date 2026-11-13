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

## CI governance freshness and Windows parity

The organization auditor has two explicitly reported modes: `STRICT` for manual runs, main-branch pushes, changed governance/workflow surfaces, and unknown identities; and `STRUCTURAL_WITH_STALE_WARNING` for an exact-head GitHub PR that changes only non-governance files. Scoped mode validates the same repository structure and anti-pattern rules while placing *only* an expired existing governance snapshot in the warnings array. It does not certify governance freshness or grant permission to merge, release, or promote.

The strict command remains available on demand as `npm run check:agent-system`. CI no longer runs the governance audit or synchronization gate. Its former CI-scoped mode is retained only as historical implementation behavior. The audit report exposes `state`, `audit_mode`, `issues`, `warnings`, and which checks were completed. A malformed identity, missing Git history, unknown event, or any change to governance or workflow files requires strict freshness; no silent PASS.

The auditor and sync receipt validator now normalize Windows CRLF versus Git-canonical LF text. Hashes still validate the original committed receipt content. This fixes platform-induced false failures without relaxing schema, provenance, digest, source-set or stale-lock checks.

The public repository's existing governance lock remains expired (`valid_through: 2026-10-20`). Do not manually advance the date; the dedicated Knowledge Steward sync-governance procedure must resolve exact current Drive authority, classify deltas, and issue an independently verifiable receipt.

### Changelog

- 2026-11-12 — Split scoped code CI from strict governance freshness; preserve warnings, exact-head scope proofs, and fail-closed sensitive-path enforcement. Repaired CRLF parsing and governance receipt hashing for Host 02 Windows parity.

- 2026-11-12 — Removed the governance freshness audit from the `npm test` chain and put it in its own always-run GitHub Actions step. This preserves execution of the spatial compiler, release check and the complete build-and-test verdict even when governance is blocked. The governance step itself still fails under strict scope, so no merge authorization is implied.

## Decision: retire governance-only CI (2026-11-13)

Owner direction supersedes the earlier CI governance gate arrangements described above. `.github/workflows/agent-system-audit.yml` was removed; the standalone governance audit step and automatic governance-sync checks were removed from `.github/workflows/ci.yml` and the default `npm test` chain. Only build, executable tests, spatial compiler checks, behavioral evaluation profiles, public-release boundary, and exact-head execution receipts remain as CI obligations. The existing governance CLI tools and source history are retained for optional/manual diagnosis, but the expired `valid_through` no longer blocks CI. No freshness renewal was claimed, and this does not disable the public-release boundary or grant deployment authority.

Changelog: 2026-11-13 — Retired redundant governance-only GitHub Actions and associated automatic gate; reduced duplicated test invocation and preserved manual tooling.

## Real D1 integration profile (2026-11-13)

`npm run evaluate -- --profile=d1` runs `tests/d1-runtime.integration.ts` against **Miniflare's actual local D1/SQLite backend**, using the already pinned Cloudflare toolchain. `--profile=all` runs the existing learning and bundled Worker profiles plus this D1 integration once. `--profile=both` is retained for compatibility. The integration is intentionally outside the generic `tests/*.test.*` glob to avoid duplicate execution.

The independent executable tests cover real SQL schema readiness and missing-schema classification; a new LIVE diagnostic execution and database rows/events/provenance; fresh kernel readback across separate runtime instances; and an injected SQLite trigger failure with rollback and successful recovery. The D1 binding is ephemeral and has no production credentials, remote connection, file-based database state, knowledge promotion, or write to Drive.

A profile PASS is evidence for local Cloudflare D1 semantics only. HTTP routing, deployed Cloudflare data, an independent UI flow, ML benefit, repeated statistics and public benchmark scores remain untested until separate probes are executed. A missing Miniflare installation reports `ENVIRONMENT_NOT_READY` without claiming code failure. Any new evaluation evidence goes through the existing `outputs/evaluations/latest.json` + `runs.jsonl` receipt path. No numbered tool forks.

Changelog: 2026-11-13 — Added real D1 integration and negative-control profile to the existing canonical evaluator, without changing the owner-retired governance CI.

### Runtime compatibility note
The D1 test uses compatibility date `2026-05-22`, the maximum supported by the pinned `workerd@1.20260515.1` runtime on Host 02. The production Wrangler configuration remains `2026-09-19`; that newer date is NOT asserted compatible by this local profile. A failure before D1 startup was independently observed at the newer date, and the fixture was constrained to the installed binary rather than changing production settings.

The fixture executes the checked-in `drizzle/0000_execution_history.sql` migration statements directly in Miniflare D1 rather than reconstructing a mock schema. `miniflare@4.20260515.0` is an explicit pinned development dependency. The canonical evaluator captures only a bounded failure-output tail for terminal diagnosis; this text is redacted and never included in JSON/JSONL receipts. Exit codes, profiles, timing and coverage remain in receipts.

## Network-level HTTP runtime integration (2026-11-13)

`npm run evaluate -- --profile=http` is the canonical network-level profile. It exercises the **actual compiled Vinext Worker entry** using a Miniflare workerd HTTP listener bound to an ephemeral port on `127.0.0.1`; this is a real HTTP/socket request from Node's `fetch`, not a direct route-function call or fake HTTP response. The existing `--profile=all` now covers learning, bundled Worker, local D1, and HTTP+D1 (four profiles). The test is named `tests/http-runtime.integration.ts` so it is not duplicated by the ordinary `tests/*.test.ts` unit glob.

Test oracles are independently observable: status codes, execution lifecycle, D1 SQL rows, event sequence and provenance links, a separate HTTP read, and queryable execution history. Negative controls cover scope denial, invalid SIMULATION request, forced SQLite UPDATE failure with rollback/recovery, and missing migrations reported as unavailable. The fixture loads the generated Worker JS module graph explicitly because Vinext contains computed imports not discoverable by Miniflare's automatic crawler. On missing `dist/server/index.js`, the normal evaluator reports `BLOCKED` / `ENVIRONMENT_NOT_READY` rather than manufacturing a functional FAIL.

Boundaries: loopback-only, ephemeral workerd/SQLite fixture; production D1, remote deployments, real user authentication, OS-level kernel isolation, agent-task benchmarks, and ML benefit are **not** covered. The profile inherits the pinned local compatibility date limitation from the preceding D1 test, while production Wrangler settings remain unchanged. No versioned runner clone, new knowledge authority, or canon promotion. Raw test output is omitted from durable receipts; current JSON + JSONL run history is reused.

Changelog: 2026-11-13 — Promoted a successful Host 02 HTTP-to-SQL execution probe into the canonical evaluator with independent observable and injected-failure oracles.

## Failure-learning training and evidence evaluation — 2026-11-13

An **optional**, headless `npm run evaluate -- --profile=ml` runs two existing AIOS learning tasks on Host 02. Use a separately installed, explicit Python environment: `AIOS_ML_PYTHON=C:\AIOS\02_RUNTIMES\failure-learning-ml\Scripts\python.exe` (PowerShell: `$env:AIOS_ML_PYTHON='C:\AIOS\02_RUNTIMES\failure-learning-ml\Scripts\python.exe'`). The isolated runtime uses Python 3.11.15 and scikit-learn 1.7.2. The Linux GitHub CI's `--profile=all` intentionally does **not** install Python/scikit-learn or perform unvalidated ML promotion. If `AIOS_ML_PYTHON` is absent, the `ml` profile returns `BLOCKED / ENVIRONMENT_NOT_READY`.

The reusable `scripts/failure-learning/train-risk.mjs` updates the **existing** 128-dimensional online model, once, against the one registered completed `TRAIN` episode (`github:python/cpython:pr:121143`) using the checkpoint's labeled failure features. It saves the model parameters and input digest to `outputs/evaluations/failure-learning-risk.json`. This is an in-sample training smoke test, not evidence of prediction accuracy or a clean risk-model holdout.

The scikit-learn `scripts/failure-learning/train_evaluate.py` reads the three clean paired lesson-transfer evaluations. It refuses contaminated/mutable-source or inconsistent-score fixtures and uses only predictors known before grading: source/target repository match, code-bearing lane, and number of activated lessons. The **prediction target is positive lessons-on/off delta, not failure occurrence**. It performs leave-one-target-out and leave-one-repository-out cross-validation, compares `DummyClassifier(strategy='prior')` against `StandardScaler + LogisticRegression(C=1.0, random_state=0)`, and uses an explicit prior fallback for single-class training folds. No held-out target enters its own fit. Reports include Brier loss, accuracy, false-positive negative transfers, repository identities, digest of each source evaluation, model coefficients, environment, and exact Git head; the training-run output is `outputs/evaluations/failure-learning-ml.json`.

**Observed Host 02 result (three pre-revealed paired outcomes):** leave-one-target-out candidate and prior both 2/3 accurate (66.7%) and Brier 0.50; both missed the negative-transfer case. Leave-one-repository-out candidate and prior both 0/3 accurate, Brier 1.0; in these folds, each training repository supplied only one label class, so a logistic classifier cannot be fit and a prior fallback is recorded. The training cases are *already revealed historical evaluations* and cannot be called untouched holdouts, independent future accuracy, community benchmarks or proof of self-improvement. Fitting the final shadow logistic candidate on all three revealed cases creates an inspectable model snapshot only, with `promotion_authorized=false`, `coder_activation_authorized=false`, and `authority_effect=NONE`.

Tests: `tests/failure-learning-training.test.mjs` verifies native TRAIN-only use and rejects HOLDOUT/partial records; `tests/failure_learning_ml_test.py` rejects tainted/mutable/inconsistent paired evaluations and verifies split isolation. The optional `tests/failure-learning-ml.integration.mjs` invokes both trainers and checks no model is promoted. These reuse the canonical receipt runner, the same outputs/evaluations directory, and the existing model. No new numbered tool fork or knowledge authority is introduced.

**Next empirical gate:** expand the independently labeled train/dev/test corpus with *immutable pre-outcome feature cutoffs*, multiple repositories and both classes inside each training fold. Keep final untouched tests unavailable to training or parameter selection, measure Brier/calibration and negative transfer, and evaluate paired coder tasks with/without activated lessons before any deployment decision.

Changelog: 2026-11-13 — Installed isolated scikit runtime on Host 02, trained existing shadow online failure model, added scikit transfer diagnostic with two split strategies, negative-control tests and optional CLI evaluation. No model promotion or deployment.
