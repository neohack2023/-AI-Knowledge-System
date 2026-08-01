# SAF-N3D-0A — Neural Reconstruction Contracts and Fixtures

Status: Candidate implementation slice  
Scope: `global-working-memory`  
Repository role: contract and synthetic-fixture evidence only

## Objective

Freeze the provider-neutral contracts required before any image-to-3D provider, Drive staging path, callback endpoint, Notion destination write, or Asset Registry integration is permitted.

## Included

- `SAF-N3D-Dispatch/0.1`
- `ExecutionReceiptEnvelope/0.1` spatial compute profile
- `SpatialValidationProfile/0.1`
- `SpatialValidationReport/0.1`
- positive and reason-coded negative fixtures
- deterministic minimal glTF 2.0 source fixture
- deterministic GLB construction and structural re-import
- process-local mock runner
- read-only `workflow_dispatch` GitHub Actions workflow
- short-lived Actions artifact package

## Explicit non-goals

- no Google Drive reads or writes
- no signed fetch URLs
- no external callbacks or webhooks
- no Notion reads or writes from repository code
- no STONE or MASON execution
- no neural-provider invocation
- no model weights
- no Asset Registry mutation
- no default-branch merge
- no runtime workflow registration
- no Active or canon promotion

## State separation

Workflow execution uses the existing runtime vocabulary:

`QUEUED | RUNNING | WAITING | APPROVAL_REQUIRED | PAUSED | COMPLETED | BLOCKED | FAILED | CANCELLED`

Domain stages such as source staging, technical validation, human review, STONE intake, and MASON validation remain event or `current_stage` values. They are not new WorkflowExecution statuses.

Candidate asset acceptance is separate:

`PENDING | ACCEPTED_AS_CANDIDATE | REJECTED | SUPERSEDED | ARCHIVED`

A completed mock run does not imply asset acceptance.

## Fixture design

The successful fixture is a synthetic one-triangle glTF 2.0 asset. Source JSON and binary bytes are stored as text fixtures. The runner constructs a GLB deterministically, validates its header and chunk layout, re-imports its positions and indices, records measured geometry, and emits a process-local receipt and validation report.

No binary is committed to the repository. Generated outputs remain under `outputs/`, which is excluded from public source release.

## Verification

```sh
node scripts/saf-n3d-0a/validate-fixtures.mjs
node --test tests/saf-n3d-0a.test.mjs
node scripts/saf-n3d-0a/build-mock-run.mjs \
  examples/saf-n3d-0a/positive/dispatch.mock.json \
  outputs/saf-n3d-0a
```

The GitHub workflow may be manually triggered after review. It has `contents: read`, no external credentials, no callback step, and one-day artifact retention.

## Next lawful slice

A later slice may allow the AIOS control plane to fetch and verify the GitHub Actions artifact. Drive staging, callback authentication, STONE intake, MASON writes, provider execution, and registration remain separately authorized work.
