# AIOS_DEVOS_GENERALIZATION_01 — Feature Dossier

## Identity

```yaml
feature_id: AIOS_DEVOS_GENERALIZATION_01
state: IMPLEMENTATION
concern: generalize repository-first DevOS bootstrap, research fallback, and applied-learning boundaries into a portable adaptive compiler
risk_tier: STANDARD
source_intent_summary: A repository-facing task should use local DevOS first; repositories without one should receive a minimal scaffold, then bounded research should fill material knowledge gaps and validated successes/failures should become useful local knowledge without authority laundering.
external_governance_refs:
  - AIOS_REPOSITORY_SELF_SUFFICIENCY_TEMPLATE
  - PROJECT_ORATH_DEVOS_REFERENCE_IMPLEMENTATION
repository: neohack2023/-AI-Knowledge-System
base_ref: main
base_sha: 99e7c38bd43b69c1b0e3de6fe6f071bf3f4d84b4
branch: aios/devos-generalization-01
pr_number: 86
```

## Scope

```yaml
touched_areas:
  - scripts/agent-system
  - tests
  - docs/agent-system
  - .github/skills
  - .github/agents
  - config/agent-system-audit.json
non_goals:
  - import Project Orath game-specific branches or runtime data
  - make Notion or any external memory a normal repository bootstrap dependency
  - install SQLite into every target repository
  - authorize autonomous promotion, merge, release, or authority cutover
  - copy private external-memory content into public repositories
assigned_roles:
  - Knowledge Steward
  - Implementer
  - Verifier
```

## Decisions

- DEC-001: The portable surface is an adaptive compiler, not a copied reference tree.
- DEC-002: Plan-only is default; apply creates missing files only and never overwrites.
- DEC-003: Existing `devos/`, `.devos/`, or coherent `docs/agent-system/` counts as an existing operating layer and prevents duplicate bootstrap.
- DEC-004: Research preflight is installed as a bounded candidate-generation policy with `authority_effect = NONE`.
- DEC-005: Negative knowledge is first-class; successful and failed approaches have separate maturity/promotion state.
- DEC-006: SQLite is optional after measured need, not a bootstrap requirement.

## Review evidence

| Review | Head SHA | Kind | Reviewer class | Findings | Disposition |
| --- | --- | --- | --- | --- | --- |

## Repair rounds

| Round | Input reviewed head | Repair head | Confirmed findings repaired | Breaker state |
| --- | --- | --- | --- | --- |

## Verifier evidence

| Verifier/run | Bound head/artifact | Obligations | Result | Receipt/reference |
| --- | --- | --- | --- | --- |
| local isolated Node test | pre-repository staging fixture | six compiler decision/behavior tests | PASS | local execution before branch installation |

## Anti-pattern candidates

- Candidate: copying a mature DevOS tree into every repository creates context/authority bloat and violates adaptive repository self-sufficiency.
- Candidate: forcing external memory retrieval before ordinary repo work reintroduces the context-compression problem DevOS is meant to remove.

## Terminal disposition

```yaml
terminal_disposition: OPEN
merge_or_release_identity:
promotion_refs: []
```

## Runtime identity note

Current candidate head is intentionally resolved live from GitHub. This dossier records the immutable base and historical verification evidence only.
