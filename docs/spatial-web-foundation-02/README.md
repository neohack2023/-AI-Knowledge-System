# SPATIAL_WEB_FOUNDATION_02

Status: `VALIDATION_IMPLEMENTED / CANDIDATE / NO_CANON_PROMOTION`
Scope: `global-working-memory`
Base contract: `SPATIAL_WEB_FOUNDATION_01` v0.2.0

## Objective

Convert the Spatial Web Systems foundation contracts into executable, process-local validation and deterministic context-packet assembly without adding external adapters, destination writes, runtime registration, skill activation, or memory promotion.

## Implemented surfaces

- `server/spatial-web/contracts.ts`
  - typed research, memory, engine-profile, experiment, receipt, and packet contracts
  - registered validation error codes
- `server/spatial-web/validator.ts`
  - fail-closed validators for all four record classes
  - reference-only enforcement
  - version-review enforcement
  - independent MASON receipt resolution and exact binding verification
- `server/spatial-web/packet-assembler.ts`
  - deterministic L0/L1/L2 selection
  - explicit L2 reason gating
  - sibling-scope rejection
  - canonical SHA-256 packet fingerprint
- `tests/spatial-web-contracts.test.ts`
  - positive fixture validation
  - version-sensitive failure
  - embedded payload rejection
  - missing and fabricated receipt rejection
  - deterministic packet equality
  - monotonic disclosure expansion
  - sibling isolation
  - L2 reason gating

## Review findings addressed

1. Public release paths are classified by relocating safe YAML artifacts beneath `docs/**`.
2. The live cross-system receipt is removed from the tracked public repository tree.
3. `promotion_receipt_id` is non-empty and format-bounded, but still cannot authorize promotion alone.
4. A memory card must carry an exact promotion binding and the receipt must resolve independently through a registered resolver.
5. Version-sensitive research requires at least one explicit review trigger.
6. Asset and artifact reference fields reject data URIs, blob URLs, and raw base64 payloads.

## Authority boundary

The implementation is Candidate code. A passing validator result means only that an object satisfies this bounded contract with the supplied evidence resolver. It does not itself establish source authority, create MASON authorization, mutate memory, activate a skill, or grant destination-write rights.

## Explicit exclusions

- No Notion or Drive adapter
- No provider-native URL committed as a runtime binding
- No external receipt fetcher
- No STONE execution
- No MASON execution
- No workflow handler registration
- No capability-registry mutation
- No project canon mutation
- No merge or promotion authorization
