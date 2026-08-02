# Cognition Receipts and Retrieval Trajectory

Status: `CANDIDATE / CONTRACT-FIRST`
Scope: `global-working-memory`
Contract family: `CognitionReceipt/0.1`
Persistence: `PROCESS_LOCAL`
Execution authority: `NONE`
Destination-write authority: `NONE`

## Purpose

Add an inspectable control-plane record explaining what AIOS observed and decided between a request and an answer or action, without recording private chain-of-thought and without granting new execution or write authority.

This slice combines three related primitives:

1. **Intent Receipt**: what intent signal was actually observed, how it was classified, and what remained unknown.
2. **Retrieval Trajectory**: which registered scope, authority, source, and packet candidates were considered, selected, rejected, or omitted.
3. **Contradiction Object**: a structured record of incompatible claims or authority bindings, including the safe next verification step.

The forensic chain is:

```text
request observed
  -> intent evidence recorded
  -> scope candidates evaluated
  -> exact scope resolved or blocked
  -> authority candidates evaluated
  -> authority role selected or unresolved
  -> retrieval candidates evaluated
  -> packets selected / rejected / omitted
  -> contradictions recorded
  -> context packet composed
  -> response or action boundary recorded
  -> outcome observed when available
```

## Governing laws

```text
OBSERVATION != INFERENCE
INFERENCE != AUTHORITY
RETRIEVAL != ENDORSEMENT
SELECTION != AUTHORIZATION
CONTRADICTION != RESOLUTION
RECEIPT != PRIVATE CHAIN-OF-THOUGHT
```

Additional invariants:

- `SOURCE != AUTHORITY != CONFIDENCE != ACCESS` remains intact.
- Exact registered scope resolution precedes semantic guessing.
- A rejected candidate remains observable through a reason code, but sensitive content is not duplicated into the receipt.
- A contradiction may propose verification, but cannot silently mutate either source.
- The receipt references existing `WorkflowExecution`, `ContextProvenanceEnvelope`, capability discovery, scope resolution, and event records rather than becoming a second execution ledger.
- No `LIVE -> SIMULATION` fallback is allowed.
- No STONE candidate, MASON write, canon promotion, or external destination mutation is authorized by this contract.

## Whole-system placement

```text
request
  -> intent observation
  -> exact scope resolution
  -> authority resolution
  -> capability discovery / retrieval
  -> context composition
  -> WorkflowExecutionKernel when execution is authorized
  -> response / action

Each boundary emits public-control observations
  -> CognitionReceipt projection
  -> read-only observability API / future Observatory renderer
```

`CognitionReceipt` is a projection over public control decisions. Existing domain events remain the primary runtime facts.

## Contract shape

```ts
interface CognitionReceiptV01 {
  contract: "CognitionReceipt/0.1";
  receipt_id: string;
  trace_id: string;
  execution_id: string | null;
  workflow_id: string | null;
  scope_key: string | null;
  status: "OPEN" | "COMPLETED" | "BLOCKED" | "FAILED";
  persistence: "PROCESS_LOCAL";
  execution_authority: "NONE";
  destination_write_authority: "NONE";
  started_at: string;
  completed_at: string | null;
  request: RequestObservation;
  intent: IntentReceipt;
  scope: ResolutionTrajectory;
  authority: ResolutionTrajectory;
  retrieval: RetrievalTrajectory;
  contradictions: ContradictionObject[];
  composition: ContextCompositionReceipt | null;
  response: ResponseBoundaryReceipt | null;
  outcome: OutcomeObservation | null;
  event_refs: string[];
  provenance_refs: string[];
  redactions: RedactionRecord[];
}
```

The exact machine schema is intentionally deferred until current runtime types and the active registry compiler branch are reconciled. This prevents a documentation-only guess from becoming a competing contract.

## Public event vocabulary

The shared event spine should eventually support the following observations. Event names describe observable control facts, not hidden reasoning.

```text
request.observed
intent.observation.recorded
intent.classification.completed
scope.candidate.considered
scope.candidate.rejected
scope.resolution.completed
scope.resolution.blocked
authority.candidate.considered
authority.candidate.rejected
authority.resolution.completed
authority.resolution.blocked
retrieval.started
retrieval.candidate.considered
retrieval.candidate.selected
retrieval.candidate.rejected
retrieval.candidate.omitted
retrieval.completed
contradiction.detected
contradiction.verification.proposed
context.composition.started
context.packet.included
context.packet.omitted
context.composition.completed
response.boundary.reached
outcome.observed
cognition.receipt.completed
```

Existing event names should be reused where semantics already match. The implementation must not create duplicate event families merely to satisfy this document.

## Intent Receipt

The intent record stores evidence and classification, not an essay about internal reasoning.

Required fields:

```text
intent_status
  NOT_OBSERVED | OBSERVED | CLASSIFIED | AMBIGUOUS | BLOCKED

intent_class
  registered stable identifier or null

observation_source
  USER_REQUEST | WORKFLOW_INPUT | REGISTERED_TRIGGER | ADAPTER_EVENT | UNKNOWN

confidence_band
  NOT_SCORED | LOW | MEDIUM | HIGH

classifier_id
classifier_version
input_fingerprint
candidate_classes[]
selected_class
rejection_reason_codes[]
```

Raw sensitive request content should not be copied by default. Prefer a fingerprint and bounded safe summary when required for debugging.

## Resolution Trajectory

Scope and authority use the same candidate-decision pattern:

```text
candidate_id
candidate_type
source_registry
status: CONSIDERED | SELECTED | REJECTED | BLOCKED
reason_codes[]
precedence
binding_version
fingerprint
```

Scope-specific requirements:

- exact scope keys, registered names, and registered aliases are allowed inputs;
- semantic similarity may suggest candidates but cannot silently select durable scope;
- parent or sibling fallback must be explicit and caller-authorized;
- unresolved scope fails closed.

Authority-specific requirements:

- record the fact class being resolved;
- distinguish source location from authority role;
- preserve `PRIMARY`, `MIRROR`, `REFERENCE`, `EXECUTION_TRUTH`, and `NON_AUTHORITATIVE` semantics where registered;
- record unresolved or conflicting authority instead of selecting by convenience.

## Retrieval Trajectory

A retrieval candidate record contains metadata only:

```text
candidate_id
source_system
source_locator_hash
scope_key
authority_role
content_class
freshness_observed_at
status: CONSIDERED | SELECTED | REJECTED | OMITTED | FAILED
reason_codes[]
packet_id
provenance_ref
```

Recommended reason codes:

```text
SCOPE_MISMATCH
AUTHORITY_MISMATCH
ACCESS_UNAVAILABLE
STALE_SOURCE
SUPERSEDED
DUPLICATE_EVIDENCE
LOW_RELEVANCE
CONTEXT_BUDGET
POLICY_BLOCKED
UNVERIFIED_BINDING
SOURCE_READ_FAILED
SELECTED_PRIMARY
SELECTED_CORROBORATION
SELECTED_CONFLICT_EVIDENCE
```

A retrieval trajectory must expose why a candidate did not enter the packet without copying the candidate's private or sensitive body.

## Contradiction Object

A contradiction is structured state, not an automatic fix.

```ts
interface ContradictionObjectV01 {
  contradiction_id: string;
  fact_key: string;
  classification:
    | "VALUE_CONFLICT"
    | "AUTHORITY_CONFLICT"
    | "VERSION_DRIFT"
    | "SCOPE_CONFLICT"
    | "IDENTITY_CONFLICT"
    | "FRESHNESS_CONFLICT";
  severity: "INFO" | "WARNING" | "BLOCKING";
  claim_refs: string[];
  authority_binding_refs: string[];
  detected_at: string;
  status: "OPEN" | "VERIFICATION_PROPOSED" | "RESOLVED" | "WAIVED";
  proposed_verification: {
    capability_id: string | null;
    authority_required: string | null;
    safe_action: string;
  } | null;
  resolution_ref: string | null;
}
```

Rules:

- A contradiction cannot be marked `RESOLVED` without a linked verification or governed decision record.
- Candidate confidence alone cannot override a registered authority binding.
- A mirror mismatch creates drift evidence, not permission to repair the mirror.
- `BLOCKING` contradictions stop packet composition or execution when they affect scope, authority, access, or a required precondition.

## Context Composition Receipt

The composition record explains the packet boundary:

```text
context_budget
candidate_count
selected_count
omitted_count
selected_packet_refs[]
omitted_packet_refs[]
composition_policy_id
composition_policy_version
packet_fingerprint
```

It does not preserve hidden model deliberation. It records deterministic inputs, policy identity, and packet membership.

## Minimum implementation slice

The first executable implementation should remain read-only and process-local:

1. Reconcile the stale PR #1 `CognitionTrace` prototype against current `main`.
2. Reuse current scope-resolution, capability-discovery, provenance, and workflow event types.
3. Introduce a small typed receipt projection and append-only observation emitter.
4. Instrument only components that already exist and can report truthful facts.
5. Expose a read-only endpoint by `receipt_id`, `trace_id`, or `execution_id`.
6. Add contract tests proving rejected candidates remain visible, sensitive bodies are absent, contradictions cannot self-resolve, and receipts grant no authority.
7. Keep any visual Observatory renderer deferred until the event contract is validated.

## Explicitly deferred

- private chain-of-thought capture;
- semantic scope selection;
- durable telemetry storage;
- cross-session receipt retention;
- automatic contradiction repair;
- source write-back;
- STONE or MASON promotion;
- external provider telemetry export;
- Observatory animation or WebGPU rendering;
- production privacy-retention policy.

## Acceptance gates

The implementation is not Active until all are true:

- build and repository tests pass;
- existing provenance and capability-discovery tests remain green;
- receipt generation is deterministic for identical public-control events;
- no raw secrets, credentials, complete source bodies, or private chain-of-thought appear in fixtures or API results;
- exact scope and authority failures are visible and fail closed;
- contradiction resolution requires linked evidence;
- receipt creation cannot execute capabilities or authorize destination writes;
- public-release boundary validation passes;
- current Notion and Drive state are updated only through a separately authorized STONE -> MASON episode.

## Migration note for PR #1

PR #1 contains useful early concepts and should be treated as research input, not merged directly. It is substantially behind current `main` and predates the active provenance, capability-discovery, public-release, and registry-compiler architecture.

Adopt selectively:

- one read-only trace per execution;
- standardized public observation categories;
- lifecycle mirroring;
- explicit `READ_FROM != AUTHORITY` handling;
- process-local truthfulness.

Replace or extend:

- generic trace entries with typed event references;
- requested-only scope fields with the current exact resolver contract;
- ad hoc source-read records with `ContextProvenanceEnvelope` references;
- isolated observability storage with a projection over the shared event spine;
- broad UI work with contract-first validation.
