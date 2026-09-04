---
applyTo: "server/coding-harness/**,tests/ci-exact-head-binding.test.mjs"
---

Treat this as a trust-bearing subsystem.

Read `server/coding-harness/AGENTS.md`, `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md`, `docs/agent-system/pr-rules/coding-harness.md`, and the active feature/plan before changing or reviewing it.

Keep candidate identity, hard-gate evidence identity, review head, review class, delta base→head classification, risk evidence, owner authorization, and breaker state separate. Stale or unbound evidence fails closed where the contract requires freshness.

A later narrower review on the same immutable head must not erase retained FULL-review evidence. Any candidate-head movement invalidates head-bound evidence unless transferability is mechanically proven.

Tests must prove the actual structured binding or behavior, not merely nearby matching text. A passing regression should fail when the exact protected field/relationship is mutated.

`MODEL_ADVISORY` cannot close verifier obligations. A breaker terminates automatic repair; it never authorizes merge.