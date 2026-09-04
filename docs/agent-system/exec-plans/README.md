# Repository Execution Plans

Execution plans are bounded, repository-visible work packets for material changes. They let a new agent understand the active concern without reconstructing it from private memory or a long chat.

## Plan states

`DRAFT → ACTIVE → BLOCKED | COMPLETE | ABANDONED`

## Required properties

- one coherent concern;
- explicit non-goals;
- repository baseline identity;
- touched areas and applicable instructions;
- risk classification;
- implementation phases;
- verifier/review requirements;
- dependencies and blockers;
- handoff/completion criteria.

## Current-state rule

Do not store a self-referential `current_head_sha` as if the plan can know the SHA of the commit containing itself. Resolve current candidate identity live. Record immutable reviewed/verified heads only after they exist.

## Storage

Use the existing `docs/plans/` lane for task-specific plans when appropriate. This directory defines the agent-system execution-plan contract and template; it does not create a duplicate active-plan authority.

Use `EXEC_PLAN_TEMPLATE.md` when a feature dossier alone is not enough.
