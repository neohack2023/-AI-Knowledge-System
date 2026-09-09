# ROLLING_PROCESSED_CONTEXT_03 — Notion + Google Drive Harness Integration

STATE: CANDIDATE / BOUNDED VALIDATION
SCOPE: global-working-memory
AUTHORITY EFFECT: NONE
VALIDATED PREDECESSOR HEAD: 3644d6361994cbddb860705f819e1d374062d15f
PLAN: MASON-WP-20260909-GLOBAL-ROLLING-PROCESSED-CONTEXT-03

## Authorized slice

This slice integrates the validated ProcessedContextWindow compiler and scoped current-pointer primitives with the Notion + Google Drive harness boundary only.

### Harness flow

1. Resolve exact `scope_key + continuity_id` in the process-local current-pointer store.
2. If a current PCW exists, select only requested task-relevant working items with the validated Context Envelope consumer.
3. Accept already-retrieved Notion / Google Drive connector projections as separate evidence edges.
4. Match selected PCW authority dependencies to connector edges by:
   - exact source system,
   - exact source ID,
   - expected authority role,
   - explicit dependency binding,
   - current connector projection status,
   - present provenance envelope.
5. Report satisfied and unresolved freshness dependencies without mutating the PCW or connector evidence.
6. Advance the current pointer only when the caller provides a valid folded or rebased PCW and the exact expected predecessor.

## Core law

`PCW continuity + connector evidence != connector authority replacement`

ProcessedContextWindow remains `DERIVED` and never satisfies authoritative freshness by itself. Connector evidence retains the authority state supplied by the existing canonical-state adapter layer. A Google Drive `shadow` edge stays `shadow`; a Notion `authoritative` edge stays `authoritative`.

## Runtime boundary

The repository adapter does not call Notion or Google Drive APIs. Connector retrieval remains outside this candidate module. This layer consumes normalized, already-retrieved connector projections and compiles them alongside task-relevant PCW continuity.

No new database, authority store, memory store, or top-level runtime root is introduced.

## Pointer boundary

The current pointer remains process-local routing state keyed by exact `scope_key + continuity_id`. All insert, version, predecessor, idempotency, and race semantics are delegated to the validated `InMemoryProcessedContextCurrentPointerStore` from slice 02.

## Explicit exclusions

- No router autorouting.
- No automatic per-turn PCW creation.
- No connector HTTP/API client implementation in repository code.
- No durable PCW database or D1 migration.
- No Memory Card creation or mutation.
- No Project Handoff mutation.
- No Context Envelope authority escalation.
- No sibling-scope reads or writes.
- No STONE -> MASON bypass.
- No canon promotion.
- No merge to main from validation alone.

## Acceptance fixtures

- PCW-HARNESS-01: exact scoped current-pointer lookup feeds the harness context.
- PCW-HARNESS-02: missing current PCW yields connector-only context with no fabricated continuity.
- PCW-HARNESS-03: selected continuity remains DERIVED and never satisfies authoritative freshness itself.
- PCW-HARNESS-04: sibling scope and continuity do not leak current PCW state.
- PCW-HARNESS-05: fresh Notion authoritative edge satisfies only its matching authority dependency.
- PCW-HARNESS-06: fresh Drive shadow edge remains SHADOW and cannot impersonate Notion authority.
- PCW-HARNESS-07: stale or unknown connector edges never satisfy revalidation.
- PCW-HARNESS-08: PCW alone cannot clear a required connector freshness dependency.
- PCW-HARNESS-09: unresolved PCW conflicts remain unresolved in compiled harness context.
- PCW-HARNESS-10: guarded pointer advance preserves exact replay idempotency.
- PCW-HARNESS-11: wrong predecessor fails visibly through the validated pointer guard.
- PCW-HARNESS-12: harness output cannot authorize durable writes even with authoritative connector evidence.

## Completion gate

The slice is not complete until the exact branch head passes the independent GitHub-hosted Node 22 verifier, while predecessor PCW-01..18 and slice-02 compiler/pointer fixtures remain green. Validation evidence does not authorize merge, router activation, durable storage, or canon promotion.
