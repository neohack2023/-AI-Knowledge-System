# ROLLING_PROCESSED_CONTEXT_01 / CANDIDATE

Status: candidate runtime contract only.
Scope: `global-working-memory`.

## Core law

`PROCESSED_CONTEXT != MEMORY != AUTHORITY`

A `ProcessedContextWindow` is a versioned, scope-bound, source-addressable, non-authoritative continuity checkpoint. It sits between raw session/events and task-conditioned context assembly.

It may carry descriptive continuity state. It may not create authority, promote memory, authorize writes, replace Project Handoff, replace MASON Episode Summary, replace Trusted Context Packet, or replace ContextProvenanceEnvelope.

## Architectural position

```text
raw session/events
      |
      v
ProcessedContextWindow
DERIVED / NON_AUTHORITATIVE
      |
      v
router + retrieval planner
      |
      v
task-conditioned Context Envelope
      |
      v
model/workflow
```

The durable path remains separate:

```text
source evidence -> STONE -> MASON -> governed durable knowledge
```

## Ownership boundary

The object owns exactly one responsibility:

> Given everything lawfully processed so far in one active continuity chain, carry the smallest operational state the next operator needs without rereading the entire chain by default.

It does not decide which inherited claims are authoritative. It points to authority edges that may require revalidation.

## Required invariants

1. `scope_key` is exact and mechanically protected.
2. `continuity_id` is stable inside one continuity chain.
3. Every produced window is immutable.
4. A current pointer may advance only within the same scope and continuity chain.
5. `authority_state` is always `DERIVED`.
6. `creates_authority`, `promotes_memory`, and `authorizes_write` are always `false`.
7. `write_authorization` is always `NONE`.
8. Unresolved conflicts remain explicit until validated upstream state resolves them.
9. Source fingerprints and provenance identifiers are protected metadata.
10. Model-authored prose cannot mutate protected metadata.
11. A PCW may reduce conversational rereads but cannot waive mandatory authoritative refreshes.
12. A PCW cannot be used as STONE/MASON write authority.

## Candidate update triggers

The first testable trigger set is intentionally small:

- `BUDGET_PRESSURE`
- `MATERIAL_STATE_TRANSITION`
- `CONTINUITY_BOUNDARY`
- `VALIDITY_EVENT`

No universal token threshold, time-to-live, or generation-depth limit is canonized in this candidate. Thresholds remain experimental until fixture evidence justifies them.

## Ordinary fold

```text
PCW_vN + newly admitted events -> PCW_vN+1
```

The fold may synthesize descriptive working-state summaries, but all protected fields are copied or derived from validated upstream metadata.

## Rebase law

Repeated derived summaries must not recursively summarize forever.

A rebase is required or requested when a material condition is detected, including:

- source fingerprint mismatch
- scope mismatch
- lineage or cursor discontinuity
- authority change
- explicit supersession
- stale material dependency
- unresolved authority conflict that invalidates reuse
- protected-field mutation
- compression coverage loss
- configured generation-depth policy firing

A rebase reconstructs a fresh candidate from validated source pointers plus relevant recent raw events instead of trusting the entire previous compressed prose state.

## Protected fields

The model must not alter:

- schema identity/version
- object/window identity
- scope identity
- continuity identity
- previous/rebase lineage
- source session/event identity
- source cursor
- source fingerprints
- provenance envelope IDs
- retrieval execution IDs
- authority metadata
- promotion state
- write authorization
- lifecycle/supersession state
- validation state
- receipt/version identity

## Provenance

Reuse the existing `ContextProvenanceEnvelope` machinery.

A produced window is represented as a transformation with:

- `object_type = ProcessedContextWindow`
- `operation = TRANSFORMATION`
- `authority_state = DERIVED`
- parent evidence references to the predecessor window and newly admitted event/source evidence

No second provenance system is introduced.

## Project Handoff relationship

A Handoff may consume or reference the latest valid PCW while being deliberately authored through its own governed workflow.

A PCW must never silently replace, create, or update a Project Handoff.

## Validation fixture pack

- PCW-01 short conversation, no window needed
- PCW-02 long single-scope conversation
- PCW-03 resume after context turnover
- PCW-04 explicit scope change
- PCW-05 sibling-scope contamination attempt
- PCW-06 stale Notion authority pointer
- PCW-07 GitHub live state supersedes derived context
- PCW-08 unresolved conflicting authority
- PCW-09 model/agent handoff
- PCW-10 recursive compression drift
- PCW-11 forced rebase
- PCW-12 replay/idempotency
- PCW-13 malicious/untrusted source content
- PCW-14 PCW offered as write authority
- PCW-15 STONE/MASON bypass attempt
- PCW-16 protected-field tamper
- PCW-17 cursor discontinuity
- PCW-18 current-pointer race

## Non-promotion law

This candidate branch is implementation evidence only. It does not activate router autorouting, production persistence, Memory Card creation, Project Handoff mutation, authority changes, or a merge to `main`.