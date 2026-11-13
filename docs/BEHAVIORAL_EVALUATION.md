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

The strict command remains `npm run check:agent-system`. CI calls `npm run check:agent-system:ci` with immutable base/head identities and full Git history. The audit report exposes `state`, `audit_mode`, `issues`, `warnings`, and which checks were completed. A malformed identity, missing Git history, unknown event, or any change to governance or workflow files requires strict freshness; no silent PASS.

The auditor and sync receipt validator now normalize Windows CRLF versus Git-canonical LF text. Hashes still validate the original committed receipt content. This fixes platform-induced false failures without relaxing schema, provenance, digest, source-set or stale-lock checks.

The public repository's existing governance lock remains expired (`valid_through: 2026-10-20`). Do not manually advance the date; the dedicated Knowledge Steward sync-governance procedure must resolve exact current Drive authority, classify deltas, and issue an independently verifiable receipt.

### Changelog

- 2026-11-12 — Split scoped code CI from strict governance freshness; preserve warnings, exact-head scope proofs, and fail-closed sensitive-path enforcement. Repaired CRLF parsing and governance receipt hashing for Host 02 Windows parity.
