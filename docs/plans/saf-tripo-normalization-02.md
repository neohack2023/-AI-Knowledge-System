# SAF-TRIPO-NORMALIZATION-02

Status: Review / pure-local normalization
Scope: `global-working-memory` → `SPATIAL_ASSET_FOUNDRY`
Depends on: `SAF-TRIPO-ADAPTER-CONTRACT-01`
External effects: NONE
Provider activation: NOT AUTHORIZED

## Objective

Implement the smallest pure-local adapter layer that converts provider-shaped Tripo task payloads into the stable records defined by `SAF-TRIPO-ADAPTER-CONTRACT-01`, while preserving the authority boundary established in PR #45.

This slice does not submit a provider request, poll Tripo, download an artifact, import into Blender, activate a backend, or promote canon.

## Why this is the next slice

The contract slice established allowed record shapes and fail-closed security rules. The remaining gap is behavioral normalization: provider v2/v3 payload drift, provider task-state drift, error redaction, signed transport URL handling, and stable receipt projection must be proven before any live adapter can exist.

## Inputs

Frozen synthetic fixtures only:

- v2-shaped success payload
- v3-shaped semantically equivalent success payload
- failed provider payload with sensitive-looking error text
- unknown future provider state
- non-HTTPS artifact pointer

No fixture is evidence that a live Tripo API currently returns the exact synthetic shape. They are adversarial compatibility fixtures derived from the previously inspected SDK/MCP seams.

## Pure functions

### `normalizeStatus(value)`

Maps known provider states to the stable AIOS observation enum. Any unknown state becomes `UNKNOWN`. Unknown never becomes success.

### `durableArtifactIdentity(url)`

Accepts HTTPS only and removes query strings and fragments before a URL can become durable identity. Signed transport parameters remain ephemeral and are never written into observation/receipt evidence.

### `normalizeTask(payload, options)`

Normalizes v2/v3-shaped task payloads into:

- `TripoTaskObservation/0.1`
- zero or more `TripoArtifactCandidate/0.1` records
- a derived terminal-state boolean

Raw provider bodies are never emitted. Error code/message fields are bounded and redacted before they enter the observation.

### `projectReceipt(...)`

Projects stable execution evidence only. It explicitly emits:

- provider / adapter version
- operation / scope / route family / model snapshot
- task id / terminal state
- source references
- sanitized generation parameters inherited from an already-valid request contract
- durable artifact identities
- local validation state
- `authorization: NONE`
- `external_effects: []`

The receipt projection intentionally excludes `secret_ref`.

## Acceptance criteria

- semantically equivalent v2/v3 fixture payloads normalize to the same stable task identity, task semantics, and artifact identities
- signed artifact URLs lose query strings and fragments before durable persistence
- non-HTTPS artifact URLs fail closed
- unknown provider states normalize to `UNKNOWN` and are not terminal success
- provider errors are bounded, single-line, and redacted
- no raw provider response body is emitted
- receipt projection contains no secret reference or bearer credential material
- receipt projection grants no import/provider authority
- no live provider request occurs
- no artifact is downloaded
- no Blender mutation occurs
- no provider/canon promotion occurs

## Explicit non-goals

- authentication implementation
- Tripo SDK installation
- HTTP transport
- retry policy
- cost tracking
- artifact download/hash execution
- local mesh validation
- Blender import
- arbitrary Blender code
- registry activation

## Terminal target

`NORMALIZER_READY / DRIFT_FIXTURES_FROZEN / ERROR_REDACTION_PROVEN / RECEIPT_PROJECTION_BOUNDED / NO_PROVIDER_CALL / NO_DOWNLOAD / NO_BLENDER_MUTATION / NO_CANON_PROMOTION`
