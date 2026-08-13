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
- API keys are references/secrets owned by the executor and never serialized into requests, observations, receipts, fixtures, logs, telemetry, nested parameter maps, or output maps.
- Secret-field rejection is recursive. Moving `api_key`, `token`, or `authorization_header` under nested objects or arrays does not bypass the contract.
- `secret_ref` may identify an executor-owned secret by `secret://...` reference only. It may not contain raw secret bytes or query-style payloads.
- Provider error payloads are normalized to bounded codes/messages; raw HTTP bodies are not durable telemetry.
- Provider success does not authorize Blender import.
- Blender import does not authorize arbitrary Python execution.
- `execute_blender_code`-style unrestricted execution is outside this adapter contract.
- Artifact transport URLs are untrusted and may be ephemeral or signed. Durable records persist only a sanitized HTTPS URL identity with no query string or fragment.
- Certificate-verified download plus a cryptographic artifact digest are independent requirements.
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
- sanitized artifact URL identities without query-secret persistence
- downloaded artifact digest
- local validation report id
- import proposal id
- external effects actually performed

## Self-review hardening pass

The first green CI pass exposed two contract gaps during manual adversarial review:

1. Top-level secret rejection did not prove that nested parameter objects were equally protected.
2. `source_url` accepted generic URI values even though the design forbids durable persistence of signed query strings or fragments.

The slice now closes both gaps by applying recursive forbidden-key constraints to parameter/output structures and requiring persistent artifact URL identities to be HTTPS URLs without query or fragment components. Adversarial fixtures cover nested `api_key`, deeply nested `token`, signed URL query persistence, fragment persistence, and insecure HTTP artifact pointers.

## Acceptance criteria

- Fixtures validate deterministic required-field and enum rules.
- Success without a task id fails.
- Artifact candidate without a cryptographic digest state fails.
- Any `tls_policy` other than `VERIFY_REQUIRED` fails.
- Any serialized API key/token/authorization-header field fails at any nesting depth governed by the contract.
- `secret_ref` is a narrow executor-owned reference, not secret material.
- Persistent artifact URL identity must use HTTPS and must contain no query string or fragment.
- Import proposal defaults to `authorization: NONE`.
- Import proposal cannot request arbitrary code execution.
- Provider terminal success and Blender import remain separate records.
- No live provider request occurs during validation.

## Terminal state

`CONTRACT_READY / FROZEN_FIXTURES / RECURSIVE_SECRET_GUARD / SANITIZED_ARTIFACT_IDENTITY / NO_PROVIDER_CALL / NO_BLENDER_MUTATION / NO_CANON_PROMOTION`
