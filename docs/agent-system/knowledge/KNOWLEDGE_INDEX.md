# Repository Knowledge Index

Use this index instead of searching external memory first.

## Orientation

- `../context/PROJECT_CHARTER.md` — repository identity and mission.
- `../context/REPOSITORY_HANDOFF.md` — semantic current phase and next actions.
- `../context/AUTHORITY_MAP.md` — source-of-truth routing.
- `../context/GOVERNANCE_BUNDLE.md` — vendored local execution laws.

## Agent organization

- `../README.md` — operating-system map and load order.
- `../agents/` — vendor-neutral bounded job contracts.
- `../../../.github/agents/` — installed GitHub custom-agent projections.
- `../commands/README.md` — vendor-neutral lifecycle entry points.
- `../skills/README.md` — repository-native skill law and command-to-skill mapping.
- `../../../.github/skills/` — installed task-specific Agent Skills.
- `../guardrails/` — separation-of-duty and authority constraints.
- `../SCHEMAS.md` — local record schemas.

## Installed lifecycle skills

Load only the skill relevant to the task:

- `.github/skills/plan-feature/SKILL.md`
- `.github/skills/review-pr/SKILL.md`
- `.github/skills/verify-head/SKILL.md`
- `.github/skills/harvest-lesson/SKILL.md`
- `.github/skills/prepare-release/SKILL.md`

Skills define repeatable procedure. They do not grant authority.

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

## Public-release safety

- `../../PUBLIC_RELEASE_BOUNDARY.md`
- `../../../public-release-manifest.yaml`

## External escalation

Do not fetch Notion/Drive by default. Escalate only when `../context/governance-lock.yaml` triggers an upstream read or when the owner explicitly requests one.