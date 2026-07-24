# External Integration Foundation

Status: implementation foundation
Scope: `global-working-memory`
Authority: external providers have **no authority role**

## Adopted architecture

AI_KNOWLEDGE_SYSTEM remains the owner of:

- scope resolution
- authority resolution
- WorkflowExecution lifecycle
- ContextProvenanceEnvelope emission
- STONE candidate generation
- MASON authorization and promotion
- execution receipts and observability

External platforms are provider adapters beneath those controls.

```text
AI_KNOWLEDGE_SYSTEM
  -> native WorkflowExecution kernel
     -> optional orchestration/execution providers
     -> optional model gateway
     -> execution + provenance trace
     -> regression candidate
     -> optional evaluation provider
```

## Native addition: Failure -> Regression Candidate

`server/evaluations/` introduces `RegressionArtifact/1.0` and a deterministic candidate generator.

The artifact preserves:

- execution/workflow/scope identity
- failure classification
- stable failure signature
- input snapshot
- expected vs actual behavior
- evaluation targets
- candidate-only promotion state

This intentionally does **not** promote knowledge or mutate canon. A future kernel wiring slice should attach generated artifacts to failed execution snapshots and execution receipts.

Principle: **NO UNHARVESTED FAILURE**.

## Provider boundaries

### Braintrust

Role: optional evaluation provider.

Target use:
- regression datasets
- experiment/eval runs
- production trace scoring

Blocked until:
- API credentials are configured
- export payload contract is approved
- data/redaction policy is explicit

Braintrust never owns truth, scope, authority, or promotion.

### LiteLLM

Role: optional model gateway.

Target use:
- provider-neutral model access
- failover constrained by capability policy
- cost/latency telemetry
- centralized model routing

Blocked until:
- gateway endpoint and credentials are configured
- model capability mapping exists
- fail-closed behavior is tested

LiteLLM consumes Capability Registry decisions. It does not replace them.

### Ellipsis

Role: optional external execution provider for bounded repository tasks.

Target use:
- isolated coding sessions
- branch/test/PR workflows
- replayable external session history

Blocked until:
- account/API access is configured
- trust-band policy is mapped to session permissions
- execution receipt mapping is implemented

It may create bounded work products. It may not autonomously merge, promote memory, write canon, or bypass MASON.

### LangGraph

Role: optional orchestration adapter for workflows that genuinely require graph/checkpoint semantics.

Current state: research-only.

The native WorkflowExecution kernel remains runtime truth. Any adapter must map checkpoint, interrupt, resume, and terminal states back into native execution status and provenance contracts.

## Next implementation order

1. Wire `RegressionArtifactService` into kernel failure transitions and execution snapshots.
2. Add an EvaluationProvider dispatch boundary; implement Braintrust only after credentials/config are present.
3. Add ModelGatewayProvider dispatch behind Capability Registry decisions; implement LiteLLM canary routing.
4. Add ExternalExecutionProvider dispatch; implement Ellipsis as a repository-scoped canary.
5. Build a LangGraph conformance adapter only if native kernel tests identify a real missing capability.

## Non-negotiable invariants

- No silent LIVE -> SIMULATION fallback.
- No provider becomes an authority source merely because it executed work.
- No external output becomes canon without the governed STONE -> MASON path.
- Every external effect is bounded by reversibility and blast radius.
- Every provider action must be observable and receipt-backed.
