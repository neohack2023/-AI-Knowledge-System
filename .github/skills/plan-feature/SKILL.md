---
name: plan-feature
description: Plan a material repository change before implementation. Use for features, repairs, refactors, migrations, or other work that needs a bounded concern, explicit non-goals, risk, verification obligations, and an implementation handoff.
---

# Plan Feature

Use this skill to turn repository-scoped intent into a bounded implementation plan. It is a procedure, not an authority grant.

## Authority boundary

- Default mutation is read-only. Write planning or feature-dossier files only when the task authorizes repository documentation changes.
- Do not implement production code while acting through this skill.
- Do not infer merge, release, verifier, or owner authority from successful planning.
- If the task crosses a trigger in `docs/agent-system/context/governance-lock.yaml`, stop normal local planning and surface the required upstream synchronization or authority question.

## Required inputs

Resolve or derive from live repository state:

- objective / concern;
- current base branch and immutable base SHA;
- intended scope and explicit non-goals;
- touched areas and applicable nested instructions;
- dependencies or stacked-work relationships;
- initial risk hypothesis;
- desired terminal outcome.

## Context load

Read, in order, only what is relevant:

1. `AGENTS.md`;
2. `docs/agent-system/context/README.md`;
3. `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md`;
4. the most specific nested `AGENTS.md` / `.github/instructions/*.instructions.md` for touched paths;
5. `docs/agent-system/pr-rules/common.md` plus the smallest touched-area rule set;
6. an existing feature dossier, decision record, or execution plan when the work already has one.

Do not fetch Notion/Drive merely to reconstruct normal repository context.

## Procedure

1. Resolve the exact concern. If several independently shippable concerns are present, split them or define a stacked sequence.
2. Freeze the current base identity from live GitHub state. Treat copied SHAs in long-lived docs as historical unless re-resolved live.
3. Declare scope and non-goals. Name paths or subsystems when known.
4. Identify governing contracts, known anti-patterns, dependencies, and public-release implications.
5. Classify the risk hypothesis: `LOW`, `STANDARD`, or `SENSITIVE`, with the concrete boundary that drives the classification.
6. Choose ordinary PR vs stacked PR structure. Do not hide dependency order inside one oversized concern.
7. Decide whether the work merits a feature dossier / execution plan. Material, multi-stage, trust-bearing, or long-lived work usually does.
8. Declare role handoffs: who plans, implements, reviews, verifies, curates lessons, and prepares release evidence.
9. Declare mechanical verification obligations and the expected evidence identity they must bind to.
10. Declare required review depth and any task-specific repair breaker.
11. Define rollback / abandonment conditions and explicit stop conditions.
12. Produce an implementation handoff. Do not start implementation unless the active task also authorizes it.

## Output contract

Return:

- **Objective**
- **Base identity**
- **Scope**
- **Non-goals**
- **Dependencies / stack**
- **Risk hypothesis**
- **Touched contracts / rules**
- **Implementation steps**
- **Role handoffs**
- **Verification obligations**
- **Review obligation**
- **Repair breaker / stop conditions**
- **Rollback / abandonment path**
- **Next authorized action**

## Stop conditions

Stop and surface the blocker when:

- the base identity cannot be resolved;
- the requested scope cannot be represented as a coherent concern;
- repository-local contracts conflict on authority;
- the governance lock requires upstream synchronization;
- the plan would require secrets, private memory, or private evidence to be copied into the public repository;
- the next action would require authority not present in the task.
