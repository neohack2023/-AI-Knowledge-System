# ROLLING_PROCESSED_CONTEXT_02 — Compiler Consumption + Scoped Current Pointer

STATE: CANDIDATE / BOUNDED VALIDATION
SCOPE: global-working-memory
AUTHORITY EFFECT: NONE
VALIDATED PREDECESSOR HEAD: e3305b8a16052aab45d99dd73594d90ae041bf5a

## Authorized slice

1. Context Envelope compiler consumption
   - Select task-relevant ProcessedContextWindow working items.
   - Preserve exact scope_key + continuity_id.
   - Emit them only as DERIVED continuity input.
   - Processed context never creates authority and never satisfies authoritative freshness by itself.
   - INVALID or non-current windows fail closed.

2. Scoped current-pointer runtime storage
   - Process-local runtime storage only in this slice.
   - Key current state by exact scope_key + continuity_id.
   - Preserve immutable historical window versions.
   - Require exact predecessor and version +1 progression.
   - Exact replay is idempotent.
   - Stale predecessor races fail closed.

## Explicit exclusions

- No router autorouting.
- No automatic per-turn PCW creation.
- No production durable PCW database.
- No D1 migration or schema widening.
- No Memory Card creation or mutation.
- No Project Handoff mutation.
- No canon promotion.
- No authority widening.
- No sibling-scope access.
- No STONE -> MASON bypass.
- No merge to main from validation alone.

## Acceptance fixtures

- PCW-COMP-01: requested task-relevant entries remain DERIVED.
- PCW-COMP-02: exact scope and continuity are mandatory.
- PCW-COMP-03: revalidation state propagates; authoritative freshness remains false.
- PCW-COMP-04: invalid/non-current windows fail closed.
- PCW-PTR-01: exact scope_key + continuity_id key isolation.
- PCW-PTR-02: predecessor and version advance exactly one.
- PCW-PTR-03: exact immutable replay is idempotent.
- PCW-PTR-04: stale predecessor detects pointer race.
- PCW-PTR-05: initial insert cannot smuggle advanced lineage/version.

Independent executable validation is required before any next slice is opened.
