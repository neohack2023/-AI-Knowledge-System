# Repository Knowledge

This directory is the routing layer for durable repository knowledge that agents should be able to discover locally.

It is not a dump of every conversation, external research artifact, or historical receipt.

## Knowledge classes

- **Architecture / contracts** — how the repository is designed and what interfaces mean.
- **Decisions** — durable choices and supersession history.
- **Execution plans** — bounded current work context.
- **Feature dossiers** — provenance maps for material features.
- **Promoted rules** — compact lessons that should recur in review.
- **Anti-pattern candidates** — deeper negative knowledge retrieved only when relevant.
- **Semantic handoff** — current project phase and next repository actions.

## Admission law

Checked-in knowledge must be repository-relevant, public-safe, reviewable, and useful to future repository work. Private workspace history is not copied merely to make the repository feel complete.

## Retrieval law

Start with `KNOWLEDGE_INDEX.md`. Load the smallest relevant packet. Context budget is a reliability constraint.
