# AI Knowledge System Repository Instructions

This file is the canonical repository-local instruction map for coding agents. Keep it compact. Put detailed, path-specific rules in nested `AGENTS.md` files or repository docs and link to them from here.

## Repository role

- This repository is the public implementation surface for the AI Knowledge System / AIOS runtime and cockpit.
- GitHub is authoritative for the code, commits, branches, pull requests, CI results, and repository-owned documentation that exist here.
- Repository instructions are derived execution context. They do not replace external architecture, governance, or memory authority.
- Never copy private workspace content, personal memory, live provider bindings, private evidence, credentials, or owner-specific source links into this public repository.

## Start here

1. Read `README.md` for repository identity, runtime prerequisites, and normal commands.
2. Read `docs/README.md` for the smallest relevant documentation entry point. Do not scan all docs by default.
3. Read `package.json` before inventing build, test, lint, or release commands.
4. Before editing a subtree, check for a more specific nested `AGENTS.md`; the deeper file governs that subtree when it does not conflict with higher-priority instructions.
5. Before editing `server/coding-harness/**`, read `server/coding-harness/AGENTS.md` and `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md`.
6. Before adding a tracked path or public artifact, read `docs/PUBLIC_RELEASE_BOUNDARY.md` and `public-release-manifest.yaml`.

## Work-unit discipline

- One branch and pull request should carry one coherent concern. State explicit non-goals.
- Do not write or merge directly to `main` as part of agent execution.
- Do not widen scope merely to satisfy a non-critical advisory finding. Record it for follow-up unless the owner explicitly widens the task.
- Preserve existing behavior unless the task explicitly authorizes a behavior change.
- Prefer the smallest repair that establishes the missing invariant and add a regression for the failure mode.

## Trust-bearing state

Do not collapse trust-bearing evidence into loose booleans when identity or freshness matters.

- Bind mechanical gate evidence to the exact immutable candidate head or artifact it verified.
- Bind review evidence to the exact reviewed head and preserve the required review class separately from review freshness.
- Bind repair/scope classification to the exact base-to-head transition it describes.
- Bind risk classification to the candidate that was assessed, or preserve a monotonic effective risk tier so stale state cannot silently lower review requirements.
- Bind owner authorization to the exact candidate head authorized.
- After any candidate-head change, assume prior head-bound gate, review, classification, and authorization evidence is stale unless the contract mechanically proves transferability.
- `MODEL_ADVISORY` review can identify defects and propose repairs, but it never becomes terminal mechanical acceptance by repetition or confidence.
- A verifier PASS closes only the obligation that verifier is authorized to close.

## Review and repair convergence

- Review currency is checked before inherited findings trigger another repair.
- Review identity and review depth are separate obligations.
- Batch confirmed in-scope findings for the reviewed head when practical instead of producing one repair commit per comment.
- Preserve prior review evidence as history; do not inherit its disposition across a changed head.
- Respect the task's repair budget. When the configured breaker is exhausted and a blocking finding remains, stop at explicit adjudication. Do not silently create another repair round.
- A breaker is a loop terminator, never a merge bypass.
- Merge eligibility never implies merge authorization.

## Validation

- Node.js requirement: `>=22.13.0`.
- Do not run install/build loops as blind preflight. Inspect the task and existing environment first.
- Use targeted checks while repairing, then run the applicable repository validation before handoff.
- `npm test` is the repository's full build-and-test suite.
- `npm run lint` runs repository linting.
- `npm run check:public-release` validates the public release boundary and must remain green for tracked public changes.
- Pull-request CI checks the exact PR head and emits verifier-owned CodingHarness evidence. Local success does not substitute for current exact-head CI.
- Do not claim a required gate passed unless the corresponding current evidence actually exists.

## Public-release safety

- `public-release-manifest.yaml` is allowlist-first; unknown tracked paths fail closed.
- Prefer already-classified repository surfaces for new public documentation and tooling.
- Public examples and fixtures must be synthetic.
- Do not add Notion/Drive workspace links, private account identifiers, live provider object IDs, secrets, private receipts, or raw execution evidence to tracked public files.
- Generated `outputs/**` are evidence artifacts, not public source inputs.

## Pull-request handoff

Before declaring work ready for owner review, report:

- exact base and candidate head;
- coherent scope and non-goals;
- files changed;
- commands/checks actually run and their outcomes;
- current CI/receipt evidence when available;
- required review class and reviewed head;
- repair-round/breaker state when review repair occurred;
- unresolved findings or follow-up work;
- owner authorization state.

Do not merge, deploy, release, widen capability, or change authority boundaries unless that action is explicitly authorized.