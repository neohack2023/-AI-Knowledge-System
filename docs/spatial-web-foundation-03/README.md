# SPATIAL_WEB_FOUNDATION_03

Status: `READ_ONLY_ADAPTER_CONTRACT_READY / CANDIDATE / NO_RUNTIME_BINDING`
Scope: `global-working-memory`
Base: `SPATIAL_WEB_FOUNDATION_02`

## Objective

Define and test a read-only adapter boundary that supplies registered Spatial Web research records, engine profiles, experiment records, and independently verified MASON receipts to the executable validators from Foundation 02.

This slice does not connect to Notion, Google Drive, GitHub, a database, a network endpoint, or any other provider. It defines provider-neutral ports and an immutable snapshot implementation only.

## Laws

1. `READ_PORT != PROVIDER_ADAPTER`.
2. `SOURCE_RECORD != VALIDATED_RECORD`.
3. `VALIDATED_RECORD != PROMOTED_MEMORY`.
4. `RECEIPT_LOOKUP != PROMOTION_AUTHORIZATION`.
5. `SNAPSHOT_LOAD != RUNTIME_BINDING`.
6. `READ_ONLY != LOW_RISK_BY_DEFAULT`.
7. `MISSING_RECORD != EMPTY_SUCCESS`.
8. `WRONG_SCOPE != FILTERED_SUCCESS`.

## Implemented surfaces

- `server/spatial-web/read-adapter-contracts.ts`
  - provider-neutral read-port contracts
  - immutable source envelopes
  - adapter capability declarations
  - explicit read-result states
- `server/spatial-web/snapshot-read-adapter.ts`
  - process-local immutable snapshot adapter
  - exact-ID retrieval
  - scope and fingerprint preservation
  - no network, mutation, execution, or promotion methods
- `server/spatial-web/read-service.ts`
  - strict validation after retrieval
  - fail-closed scope checks
  - exact receipt resolver bridge
  - packet assembly from validated records only
- `tests/spatial-web-read-adapter.test.ts`
  - immutable snapshot behavior
  - missing-record behavior
  - wrong-scope rejection
  - invalid-record rejection
  - exact receipt lookup
  - no-write capability contract
  - validated packet assembly

## Explicit exclusions

- No Notion adapter
- No Google Drive adapter
- No GitHub adapter
- No database adapter
- No HTTP client
- No authentication binding
- No secret handling
- No cache refresh loop
- No writes
- No deletes
- No updates
- No promotion
- No STONE or MASON execution
- No runtime registration
- No capability activation
- No merge authorization
