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
