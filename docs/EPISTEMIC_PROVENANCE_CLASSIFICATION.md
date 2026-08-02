# Epistemic Provenance Classification

Status: Candidate implementation slice
Scope: `global-working-memory`

## Purpose

The Context Provenance Envelope already records where an object came from, which execution used it, what authority state applies, and how it was transformed. This slice adds one explicit field that records what kind of knowledge claim the envelope represents.

```text
epistemic_type:
  CLAIM
  OBSERVATION
  ACTION_REQUEST
  ACTION_RESULT
  VERIFICATION
  DURABLE_FACT
```

This prevents a statement, tool result, verification, and governed durable fact from being flattened into the same generic provenance record.

## Initial runtime mapping

| Runtime object | Epistemic type | Reason |
| --- | --- | --- |
| Workflow input read from transient execution context | `CLAIM` | The caller asserted the input; the kernel has not independently verified it. |
| Diagnostic SHA-256 computation output | `ACTION_RESULT` | The server executed a bounded computation and recorded its result. |
| Process-local governed-write probe receipt | `ACTION_RESULT` | The write path reported a bounded result, but this slice does not claim independent readback verification or durable authority. |

`VERIFICATION` and `DURABLE_FACT` are defined for future governed workflows but are not emitted by the diagnostic handler in this slice.

## Validation rule

`epistemic_type` is mandatory on every new provenance emission. Unknown values fail with `PROVENANCE_VALIDATION_FAILED`.

## Explicit exclusions

- No packet binding-strength field
- No automatic claim-to-fact promotion
- No automatic STONE or MASON execution
- No external source reads
- No production source writes
- No authority cutover
- No drift repair
- No canon mutation

## Follow-up

A later bounded slice may add packet binding strength as a separate contract:

```text
INFORMATIONAL
PREFERENCE
WORKFLOW_RULE
CANON_LOCK
AUTHORITY_FACT
GOVERNANCE_GATE
```

Authority answers who may define a fact. Binding strength answers how the runtime must behave when that fact is included in a context packet. They should remain separate fields.
