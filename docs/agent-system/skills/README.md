# Repository-Native Skills

This repository installs task-specific Agent Skills under `.github/skills/<skill-name>/SKILL.md`.

The canonical Phase 3 skill set is:

| Skill | Primary role | Purpose |
| --- | --- | --- |
| `plan-feature` | Planner | turn intent into a bounded implementation plan |
| `review-pr` | Reviewer | perform read-only exact-candidate advisory review |
| `verify-head` | Verifier | run declared mechanical checks against exact candidate/artifact identity |
| `harvest-lesson` | Knowledge Steward | preserve confirmed negative knowledge and propose, but not self-promote, compact rules |
| `prepare-release` | Release Steward | assemble merge/release readiness evidence without granting authorization |

## Why `.github/skills`

`.github/skills` is the repository's installed project-skill surface. The vendor-neutral lifecycle meaning remains documented under `docs/agent-system/commands/`; the installed `SKILL.md` files package those procedures for tools that support the Agent Skills format.

Do not maintain duplicate copies under `.claude/skills` or `.agents/skills` unless a future compatibility test proves a separate copy is required. One canonical installed skill avoids drift.

## Skill law

- **Skill = how**, not who and not authority.
- A role/profile may invoke a skill, but invocation does not widen that role's permissions.
- Explicit user/task instructions may choose a different procedural path when they are compatible with stronger repository authority and safety boundaries.
- A skill does not turn `MODEL_ADVISORY` into terminal acceptance.
- A verifier skill closes only the obligation owned by its declared verifier.
- A skill cannot convert merge eligibility into merge/release authorization.
- Skills must use live GitHub state for mutable repository identity and the checked-in context bundle for normal semantic context.
- Notion/Drive retrieval remains an explicit synchronization/escalation path, not a normal skill bootstrap.
- Do not pre-approve shell/bash execution in skill frontmatter unless a reviewed future skill genuinely requires it. The Phase 3 skills contain no `allowed-tools` shell grant.

## Promotion criteria

A repository-native skill should exist only when the procedure is repeatable, bounded, public-safe, testable, and materially different from an always-on instruction or a role contract.

The lifecycle commands met that bar because they define repeatable multi-step procedures with stable inputs, outputs, evidence rules, and stop conditions.

## Maintenance

When modifying a skill:

1. preserve its authority boundary;
2. keep name/description accurate enough for task-triggered discovery;
3. update the corresponding lifecycle command when semantic behavior changes;
4. update the primary role profile if role-to-skill routing changes;
5. harvest confirmed skill failures through `harvest-lesson` rather than silently accreting exceptions;
6. keep supporting details in referenced repository docs instead of turning `SKILL.md` into a second knowledge base.
