# Context Provenance Envelope — Kernel Integration

Status: Candidate / implementation branch
Contract: `ContextProvenanceEnvelope/1.0`
Scope: AI_MEMORY_OS / AI_KNOWLEDGE_SYSTEM execution kernel

## Purpose

Connect the ratified Slice 2 Context Provenance Envelope to real server-side workflow execution without changing the existing authority model.

The implementation preserves:

- `SOURCE != AUTHORITY != CONFIDENCE != ACCESS`
- Notion authority for migrated project memory until governed cutover
- Drive runtime/control-plane authority only where explicitly declared
- GitHub authority for live repository execution facts
- STONE bounded intake and MASON governed promotion/write rules
- no silent `LIVE -> SIMULATION` fallback

## Runtime integration

Every `WorkflowExecution` now owns an execution-scoped provenance stream exposed in `ExecutionSnapshot.provenance_envelopes`.

`WorkflowHandlerContext.provenance` provides three primitives:

1. `list()` — read envelopes already attached to the current execution.
2. `emit()` — validate and attach a retrieval, transformation, or governed-write envelope.
3. `assertGovernedWriteAuthorization()` — fail closed before a write when write policy, MASON episode, write plan, authorization, or destination evidence is missing.

The kernel emits structured events:

- `provenance.retrieval.emitted`
- `provenance.transformation.emitted`
- `provenance.governed_write.authorization_validated`
- `provenance.governed_write.emitted`

## Envelope rules

All envelopes require stable object/source identity, scope, source and object fingerprints, authority metadata, policy references, execution binding, and validation timestamps.

### Retrieval

Requires:

- `retrieved_at`
- source identity and fingerprint
- access policy reference
- authority owner/domain/state

### Transformation

Requires:

- at least one `parent_evidence_id`
- at least one typed `transform_chain` step
- derived object fingerprint

### Governed write

Requires all transformation lineage plus:

- `write_authorized=true`
- non-empty `write_policy_refs`
- `mason_episode_id`
- `write_plan_id`
- `authorization_id`
- `execution_receipt_id`
- exact `destination`

A governed-write envelope is prepared and fully validated before the corresponding handler result is committed. The kernel appends the envelope only after the handler output/state mutation is applied, preventing partially committed writes caused by invalid provenance.

## Live proof path

`InternalDiagnosticWorkflowHandler` now exercises the contract truthfully:

1. reads its actual execution-local input and emits `RETRIEVAL` provenance from `TRANSIENT_CONTEXT / workflow_execution.input`;
2. computes the real SHA-256 digest and emits a `TRANSFORMATION` envelope linked to the retrieval envelope;
3. optionally runs a process-local governed-write probe that must pass the write-authorization gate, mutates only execution-local output, then emits a `GOVERNED_WRITE` envelope marked `NON_AUTHORITATIVE`.

The diagnostic probe never claims Notion, Drive, GitHub, or another external authority was written.

## Production adapter contract

A future Notion, Drive, GitHub, research, asset, or memory adapter must:

```text
connector/source read
  -> normalize stable ContextObject identity
  -> provenance.emit(RETRIEVAL)
  -> transformation
  -> provenance.emit(TRANSFORMATION)
  -> packet/cognition admission
```

A future MASON-backed write handler must:

```text
locked STONE/MASON inputs
  -> provenance.assertGovernedWriteAuthorization(...)
  -> exact destination mutation
  -> re-fetch/verify
  -> execution receipt
  -> handler result with GOVERNED_WRITE provenance emission
  -> kernel validates + attaches envelope
```

Unwrapped connector data must not be promoted to trusted packet assembly once adapter integration is enabled.

## Current boundary

This branch wires the provenance primitive into the real server workflow kernel and proves retrieval, transformation, and a non-authoritative process-local governed-write lifecycle.

It does **not** claim that production Notion/Drive/GitHub connector adapters or a real external MASON write handler already exist in the repository. Those components must use this contract when implemented rather than inventing a second provenance model.
