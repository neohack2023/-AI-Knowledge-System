# Cognition Trace Observability v0.1

## Purpose

`CognitionTrace` is the read-only observability envelope for a real server-side workflow execution.

It reports observable system facts around reasoning and execution without exposing private chain-of-thought.

The trace answers:

- Was AI_MEMORY_OS actually active?
- What intent was observed, if an intent detector actually ran?
- Was scope merely requested, or resolved by a real resolver?
- Which systems were actually read?
- What authority role did each read carry?
- What retrieval packets were assembled?
- Which preferences were applied, inactive, or conflicting?
- What workflow events occurred?

## Hard invariants

### 1. `READ_FROM` is not `AUTHORITY`

Every `source.read` observation MUST provide both:

- `system`
- `authority_role`

A read from Google Drive does not imply Google Drive is authoritative.

Current authority model remains:

- Notion: authoritative migrated project memory until governed cutover
- Google Drive: runtime/control-plane and `drive_shadow` migration surfaces according to declared authority
- GitHub: live repository execution truth
- transient conversation/input context: transient only

### 2. Missing observations stay missing

The trace MUST NOT infer events that did not occur.

Examples:

- no intent detector ran → `intent.status = NOT_OBSERVED`
- no scope resolver ran → `scope_resolution.status = REQUESTED_ONLY`
- no retrieval packet was assembled → `packets = []`
- no preference engine ran → `preferences = []`
- no Notion/Drive/GitHub adapter read occurred → no source-read entry for that system

### 3. Telemetry is read-only

Observability records facts about execution. It does not grant authority, mutate memory, promote canon, invoke STONE/MASON, or perform external writes.

### 4. No silent simulation substitution

A LIVE workflow without a registered real handler remains failed/blocked according to the workflow kernel contract. Observability must never relabel simulation output as LIVE telemetry.

## Instrumentation contract

Real server components receive a `WorkflowObservationEmitter` and should record only events they actually perform:

- `intent(...)`
- `scope(...)`
- `authority(...)`
- `sourceRead(...)`
- `packet(...)`
- `preference(...)`
- `event(...)`

External adapters must call `sourceRead(...)` at the point where the read actually occurs, using the exact source system and declared authority role.

## Current v0.1 behavior

The server workflow kernel creates one `CognitionTrace` per LIVE execution and embeds it in `ExecutionSnapshot`.

The internal runtime diagnostic records one truthful read of `TRANSIENT_CONTEXT / workflow_execution.input`. It still reports `external_systems_accessed: []` because no Notion, Google Drive, or GitHub adapter is invoked.

Read-only trace access is available at:

- `/api/observability-traces?execution_id=<id>`
- `/api/observability-traces?trace_id=<id>`
- `/api/observability-traces` for the latest process-local trace

Developer surface:

- `/observability`

## Persistence boundary

v0.1 trace storage is `PROCESS_LOCAL` and uses the same in-memory runtime limitation as the current workflow kernel.

It is not durable and is not guaranteed across worker isolates.

Durable/cross-isolate trace storage is a later slice and must not be inferred from this implementation.
