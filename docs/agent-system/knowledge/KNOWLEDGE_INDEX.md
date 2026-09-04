# Repository Knowledge Index

Use this index instead of searching external memory first.

## Orientation

- `../context/PROJECT_CHARTER.md` — repository identity and mission.
- `../context/REPOSITORY_HANDOFF.md` — semantic current phase and next actions.
- `../context/AUTHORITY_MAP.md` — source-of-truth routing.
- `../context/GOVERNANCE_BUNDLE.md` — vendored local execution laws.
- `../context/governance-lock.yaml` — external-fetch/synchronization triggers.

## Agent organization

- `../README.md` — operating-system map and load order.
- `../agents/` — vendor-neutral bounded job contracts.
- `../adapters/` — product-specific routing for Codex/GitHub Copilot.
- `../../../.github/agents/` — GitHub Copilot custom-agent projections.
- `../../../.github/instructions/` — GitHub path-specific instruction adapters.
- `../commands/README.md` — lifecycle entry points.
- `../guardrails/` — separation-of-duty and authority constraints.
- `../SCHEMAS.md` — local record schemas.

## Planning and decisions

- `../decisions/README.md` — durable repository decision lane.
- `../exec-plans/README.md` — execution-plan contract.
- `../../plans/` — existing bounded repository plans.
- `../features/` — feature dossiers and provenance maps.

## Review and negative knowledge

- `../pr-rules/common.md` — always-relevant promoted review law.
- `../pr-rules/` — area-specific promoted rules.
- `../anti-patterns/README.md` — anti-pattern lifecycle.
- `../anti-patterns/candidates/` — detailed failure evidence when a rule/task points there.

## Verification / acceptance

- `../../VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md` — verifier-owned acceptance contract.
- `../../../server/coding-harness/AGENTS.md` — coding-harness path law when touching that subtree.
- `../../../.github/instructions/coding-harness.instructions.md` — Copilot-native path adapter for the trust-bearing harness surface.

## Public-release safety

- `../../PUBLIC_RELEASE_BOUNDARY.md`
- `../../../public-release-manifest.yaml`
- `../../../.github/instructions/public-release.instructions.md`

## External escalation

Do not fetch Notion/Drive by default. Escalate only when `../context/governance-lock.yaml` triggers an upstream read/synchronization or when the owner explicitly requests one. Repository adapters and custom agents must route through this same boundary rather than inventing their own external-memory policy.
