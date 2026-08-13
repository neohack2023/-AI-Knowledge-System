# SAF-TRIPO-ADAPTER-CONTRACT-01

Status: Review / contract-only
Scope: `global-working-memory` → `SPATIAL_ASSET_FOUNDRY`
External effects: NONE
Provider activation: NOT AUTHORIZED

## Objective

Define a provider-neutral, fail-closed contract boundary for a future Tripo adapter without making paid API calls, importing assets into Blender, weakening TLS, or promoting Tripo to an Active backend.

## Source-derived design inputs

The contract is derived from the inspected public `VAST-AI-Research/tripo-python-sdk` and `VAST-AI-Research/tripo-mcp` surfaces:

- Tripo work is asynchronous and task-oriented: submit → task_id → poll → terminal result.
- Stable task observations include task type, status, progress, inputs, outputs, timestamps, queue/runtime hints, and bounded error fields.
- Useful output references include base model, model, PBR model, rendered image, rig state, and multiview image fields.
- Tripo SDK exposes distinct v2 and v3 transport paths and normalizes newer task payloads into a stable Task representation.
- The SDK includes an SSL-verification-disabled download retry. AIOS explicitly rejects that fallback.
- Tripo MCP combines provider execution, Blender mutation, asset retrieval, and arbitrary Blender Python in one server. AIOS deliberately separates those authorities.

## Boundary

This slice defines four records only:

1. `TripoProviderRequest/0.1`
2. `TripoTaskObservation/0.1`
3. `TripoArtifactCandidate/0.1`
4. `TripoImportProposal/0.1`

No record grants destination-write authority.

## State machine

```text
REQUEST_PREPARED
  ↓ explicit future provider authorization
SUBMITTED
  ↓
QUEUED | RUNNING
  ↓
SUCCESS | FAILED | CANCELLED | BANNED | EXPIRED
  ↓ success only
ARTIFACT_CANDIDATE
  ↓ local validation
IMPORT_PROPOSED
  ↓ separate Blender executor approval
IMPORTED
```

`UNKNOWN` is observational only and may never be treated as success.

## Security invariants

- TLS verification is mandatory. Certificate failure terminates the transfer.
- API keys are references/secrets owned by the executor and never serialized into requests, observations, receipts, fixtures, logs, or telemetry.
- Provider error payloads are normalized to bounded codes/messages; raw HTTP bodies are not durable telemetry.
- Provider success does not authorize Blender import.
- Blender import does not authorize arbitrary Python execution.
- `execute_blender_code`-style unrestricted execution is outside this adapter contract.
- Artifact URLs are untrusted transport pointers until downloaded and hashed by an authorized executor.
- No external call may occur in this contract slice.

## Receipt candidates

A future execution receipt SHOULD bind:

- provider: `tripo`
- adapter contract version
- provider model snapshot/version
- API route family (`v2` | `v3`)
- task id
- ordered source references
- sanitized generation parameters
- geometry/model seed when available
- texture seed when available
- requested face limit
- quad / PBR / smart-low-poly / part-generation flags when used
- submit/observe/terminal timestamps
- normalized terminal state
- artifact URL identities without query-secret persistence
- downloaded artifact digest
- local validation report id
- import proposal id
- external effects actually performed

## Acceptance criteria

- Fixtures validate deterministic required-field and enum rules.
- Success without a task id fails.
- Artifact candidate without a cryptographic digest state fails.
- Any `tls_policy` other than `VERIFY_REQUIRED` fails.
- Any serialized API key/token field fails.
- Import proposal defaults to `authorization: NONE`.
- Import proposal cannot request arbitrary code execution.
- Provider terminal success and Blender import remain separate records.
- No live provider request occurs during validation.

## Terminal state

`CONTRACT_READY / FROZEN_FIXTURES / NO_PROVIDER_CALL / NO_BLENDER_MUTATION / NO_CANON_PROMOTION`
