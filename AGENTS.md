# AI Knowledge System Repository Instructions

This file is the canonical repository-local instruction map for coding agents. Keep it compact. Put detailed path-specific rules in nested `AGENTS.md`, `.github/instructions/**`, or repository docs and route to them from here.

## Repository role

- This repository is the public implementation surface for the AI Knowledge System / AIOS runtime and cockpit.
- GitHub is authoritative for repository files, commits, branches, pull requests, reviews, CI, and repository-owned documentation.
- For normal repository-scoped work, checked-in repository context is the default semantic source. External Notion/Drive retrieval is an escalation/synchronization path, not the normal bootstrap.
- Repository self-sufficiency does not silently move global/cross-repository AIOS authority into GitHub.
- Never copy private workspace content, personal memory, live provider bindings, private evidence, credentials, or owner-specific private source links into this public repository.

## Start here

1. Read `README.md` for repository identity, runtime prerequisites, and normal commands.
2. Read `docs/agent-system/context/README.md` for the local semantic orientation packet and `docs/agent-system/context/governance-lock.yaml` for external-fetch triggers.
3. Use `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md` and `docs/README.md` to load only the smallest relevant documentation. Do not scan all docs by default.
4. Read `package.json` before inventing build, test, lint, or release commands.
5. Before editing a subtree, check for a more specific nested `AGENTS.md` and applicable `.github/instructions/**/*.instructions.md`.
6. Before editing `server/coding-harness/**`, read `server/coding-harness/AGENTS.md`, `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md`, and the coding-harness PR rules.
7. Before adding a tracked path or public artifact, read `docs/PUBLIC_RELEASE_BOUNDARY.md` and `public-release-manifest.yaml`.

## Repository organization

- `docs/agent-system/agents/` contains vendor-neutral bounded job contracts.
- `.github/agents/` projects those jobs into GitHub Copilot custom agents.
- `docs/agent-system/commands/` defines lifecycle entry contracts.
- `docs/agent-system/pr-rules/` contains compact promoted review law.
- `docs/agent-system/anti-patterns/` contains deeper negative knowledge and immutable source evidence.
- `docs/agent-system/features/`, `decisions/`, and `exec-plans/` hold feature provenance, durable repository decisions, and execution plans.
- `docs/agent-system/adapters/` explains product-specific routing without creating a second policy authority.

## Work-unit discipline

- Default: one coherent concern per branch/pull request with explicit non-goals.
- Direct writes to `main` are allowed only when the owner/user explicitly authorizes a narrow direct-main operation or staging phase. Record the exception and resulting exact commit(s). Otherwise do not write or merge directly to `main` as part of agent execution.
- Do not widen scope merely to satisfy a non-critical advisory finding without explicit direction.
- Preserve existing behavior unless the task explicitly authorizes a behavior change.
- Prefer the smallest repair that establishes the missing invariant and add a regression for the failure mode.

## Trust-bearing state

Do not collapse trust-bearing evidence into loose booleans when identity or freshness matters.

- Bind mechanical gate evidence to the exact immutable candidate head or artifact it verified.
- Bind review evidence to the exact reviewed head and preserve required review class separately from review freshness.
- Bind repair/scope classification to the exact base-to-head transition it describes.
- Bind risk classification to the candidate assessed, or preserve a monotonic effective risk tier so stale state cannot silently lower review requirements.
- Bind owner authorization to the exact candidate authorized.
- After any candidate-head change, assume prior head-bound gate, review, classification, and authorization evidence is stale unless the contract mechanically proves transferability.
- `MODEL_ADVISORY` review may identify defects and propose repairs, but repetition/confidence never upgrades it into terminal mechanical acceptance.
- A verifier PASS closes only the obligation that verifier is authorized to close.

## Review and repair convergence

- Check review currency before inherited findings trigger another repair.
- Review identity and review depth are separate obligations.
- Batch confirmed in-scope findings for the reviewed head when practical.
- Preserve prior review evidence as history; do not inherit its disposition across a changed head.
- Respect the task's repair budget. Breaker exhaustion with a blocking finding routes to explicit adjudication, not an implicit extra repair round.
- A breaker is a loop terminator, never a merge bypass.
- Merge eligibility never implies merge authorization.

## Validation

- Node.js requirement: `>=22.13.0`.
- Do not run install/build loops as blind preflight. Inspect the task and existing environment first.
- Use targeted checks while repairing, then run applicable repository validation before handoff.
- `npm test` is the repository full build-and-test suite.
- `npm run lint` runs repository linting.
- `npm run check:public-release` validates the public release boundary.
- Acceptance-relevant evidence must state the exact head/artifact it actually verified. Never describe a default PR merge-ref checkout as immutable candidate-head evidence.
- Local success does not substitute for required current repository/CI evidence.

## Public-release safety

- `public-release-manifest.yaml` is allowlist-first; unknown tracked paths fail closed.
- Prefer already-classified repository surfaces for new public documentation/tooling.
- Public examples and fixtures must be synthetic.
- Do not add Notion/Drive private workspace links, private account identifiers, live provider object IDs, secrets, private receipts, or raw private execution evidence to tracked public files.
- Generated `outputs/**` are evidence artifacts, not public source inputs.

## Handoff

Before declaring material work complete, report the applicable exact base/candidate or direct-main commit identity, scope/non-goals, files changed, checks actually run, current evidence, review/breaker state, unresolved findings, and authorization state.

Do not deploy, release, widen capability, or change authority boundaries unless that action is explicitly authorized.