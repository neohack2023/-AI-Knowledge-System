# GitHub Copilot Repository Instructions

Use `AGENTS.md` as the canonical repository-local instruction map.

Before proposing or editing code:

- Read `AGENTS.md` and any more specific nested `AGENTS.md` that applies to the files you touch.
- Use `docs/README.md` to load only the smallest relevant repository documentation.
- For `server/coding-harness/**`, read `server/coding-harness/AGENTS.md` and `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md` before reviewing or changing trust logic.
- Keep one coherent concern per pull request and state non-goals.
- Do not widen scope to chase non-critical advisory findings without explicit owner direction.
- Treat identity, freshness, review class, risk, transition classification, and owner authorization as separate trust-bearing facts when the contract requires them.
- Do not inherit PASS, approval, risk, or review disposition across a changed head unless exact binding proves it is still current.
- `MODEL_ADVISORY` review is evidence, not terminal mechanical acceptance.
- Respect bounded repair breakers. A blocking finding after the configured ceiling requires adjudication, not an automatic extra repair round.
- Run the applicable tests and public-release validation, then rely on exact-head CI for repository acceptance evidence.
- Never copy private workspace links, personal memory, live provider bindings, secrets, or private receipts into this public repository.
- Never merge, deploy, release, or change authority boundaries solely because an automated review or test is green.

When reviewing a pull request, prioritize concrete correctness, trust-binding, security, data-loss, contract, and liveness defects. Avoid repeatedly re-raising already repaired prior-head findings unless the current head still reproduces the defect.