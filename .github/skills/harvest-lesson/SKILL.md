---
name: harvest-lesson
description: Convert a confirmed repository failure or review finding into durable negative knowledge without automatically promoting it into global review law. Use after a concrete incident, repair, regression, or recurring review finding.
---

# Harvest Lesson

Use this skill to preserve a confirmed failure as repository-local institutional memory.

## Authority boundary

- A reviewer suggestion is not automatically a durable lesson.
- Evidence maturity and promotion scope are separate axes.
- Creating or updating a candidate record does not authorize promotion.
- Promotion into `pr-rules/**` requires the repository's explicit adjudication path.
- Do not copy private workspace URLs, private receipts, personal memory, provider bindings, secrets, or raw private evidence into the public repository.

## Required source event

Require a concrete source such as:

- review finding;
- failing regression;
- CI/verifier failure;
- merged defect discovered later;
- repair-loop/breaker incident;
- repeated pattern across repository episodes.

Bind the source to immutable repository evidence whenever possible: PR number, exact head/commit, review/thread/comment ID, workflow/run/test identity, or artifact digest.

## Context load

Read:

1. `docs/agent-system/anti-patterns/README.md`;
2. `docs/agent-system/SCHEMAS.md`;
3. existing candidate records for the same subsystem/pattern;
4. applicable promoted `pr-rules/**`;
5. relevant feature dossier/decision/plan when it explains the incident.

## Procedure

1. Confirm the failure actually occurred and is not merely speculative advice.
2. Search existing candidates for duplicates, superseded variants, or recurrence.
3. Record the immutable `source_evidence` edges.
4. State the observed behavior and failure mechanism.
5. Explain why the behavior looked reasonable or was easy to accept at the time.
6. Record the concrete impact/risk.
7. Record how the defect was detected.
8. Record the repair, if one exists, and distinguish proposed repair from verified repair.
9. Record the regression guard and the exact evidence that proves it when available.
10. Set **evidence maturity** independently from **promotion state**.
11. Search for recurrence. A single local defect normally remains local unless its mechanism clearly generalizes or the owner/Knowledge Steward explicitly adjudicates broader promotion.
12. If promotion is justified, produce a compact imperative candidate rule plus its target scope (`AREA` or `COMMON`). Do not silently write/promote it unless separately authorized.

## Output contract

Return or write a candidate record containing:

- candidate ID;
- title / pattern;
- evidence maturity;
- promotion state;
- affected area;
- immutable source evidence;
- observed behavior;
- why it looked reasonable;
- failure mechanism;
- impact;
- detection method;
- repair status;
- regression guard;
- recurrence evidence;
- optional compact promotion proposal;
- adjudication required / completed state.

## Promotion test

Before proposing promotion, ask:

1. Is the mechanism recurring or structurally general?
2. Is the compact rule stable enough to load repeatedly?
3. Would the rule prevent the defect without overfitting one incident?
4. Is there evidence stronger than one model opinion?
5. Does the target scope belong in area rules or common rules?

If not, keep the detailed candidate without promoting it.

## Stop conditions

Stop or mark incomplete when:

- the source event cannot be verified;
- immutable provenance is available but missing;
- the record would require publishing private material;
- promotion would widen authority or policy beyond the current authorization;
- the candidate is actually a duplicate that should be linked/superseded instead.
