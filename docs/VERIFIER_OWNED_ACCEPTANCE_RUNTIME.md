# Verifier-Owned Acceptance Runtime

`aios_verifier_acceptance_v0_1` is the runtime receipt primitive that binds a repository execution result to the exact obligation a verifier is allowed to close.

## Core rule

**The search/repair agent proposes candidates. The declared verifier owns terminal acceptance for its bound obligation.**

A passing verifier receipt is deliberately local. It does not imply that lint, security, release, migration, deployment, authorization, or unrelated correctness obligations passed unless those obligations have their own current acceptance receipts.

## Runtime surfaces

- `server/coding-harness/verifier-acceptance.ts` validates verifier identity, artifact/head binding, freshness, coverage, result, priority declarations, and mechanically derives the terminal effect.
- `server/coding-harness/receipt.ts` aggregates verifier receipts into a `CodingHarnessReceipt`, resolves each declared obligation, derives the overall harness status, and emits a deterministic SHA-256 receipt digest.
- `scripts/coding-harness/emit-receipt.ts` provides a repository command surface that accepts execution evidence as JSON and emits the mechanically resolved receipt.
- `schemas/aios-verifier-acceptance-v0.1.schema.json` exposes the portable receipt shape.

## Fail-closed behavior

- `MODEL_ADVISORY` never has terminal mechanical authority by itself.
- stale or unknown verifier freshness escalates instead of inheriting PASS.
- artifact/head mismatch blocks receipt construction.
- incomplete coverage cannot become terminal ACCEPT.
- conflicting terminal verifiers block unless an explicit higher-priority verifier declaration resolves the conflict.
- a PASS closes only its declared obligation.

## CodingHarness status derivation

For required obligations:

- any `REJECTED` obligation -> `FAIL`
- otherwise any `BLOCKED` obligation -> `BLOCKED`
- otherwise any `OPEN` or `PARTIAL` obligation -> `PARTIAL`
- all required obligations `ACCEPTED` -> `PASS` (or `FLAKY` when the execution explicitly carries a flaky signal)

The caller does not supply the terminal status or receipt digest. Both are derived by the runtime.

## Command surface

```bash
npm run coding-harness:receipt -- path/to/execution-input.json
# or
cat path/to/execution-input.json | npm run coding-harness:receipt
```

Input uses `verifier_acceptance_inputs`; the runtime derives each `terminal_acceptance_effect`, resolves obligation ownership, and emits a `CodingHarnessReceipt` with `verifier_acceptances`, obligation states, `terminal_status`, and `receipt_digest`.

This primitive does not authorize merge, deployment, release, promotion, or capability widening. Those remain separate gates.
