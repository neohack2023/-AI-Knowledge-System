# Repository Agent Operating System

This directory is the repository-local operating map for agents working in AI Knowledge System. It organizes **who does the work, when a workflow is invoked, which review rules apply, how failures become lessons, how material features remain traceable, and which checked-in context lets normal work proceed without external memory retrieval**.

GitHub remains authoritative for repository files, branches, commits, pull requests, reviews, and CI. These files are the public, local execution projection agents need while working here.

## Repository self-sufficiency target

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE`

For normal repository-scoped work, use checked-in context plus live GitHub state. Do not fetch Notion/Drive merely to reconstruct project identity, operating rules, current semantic phase, decisions, plans, or known repository lessons.

External workspace retrieval is an explicit escalation for cross-repository/global governance changes, unresolved authority conflicts, a stale/incomplete governance lock, or an owner-requested synchronization.

This is operational self-sufficiency, **not** a silent global AIOS authority cutover.

## Core model

- **Agent/role = who** performs a bounded job.
- **Command = when** a repeatable repository workflow is invoked.
- **Skill = how** a reusable procedure is performed.
- **Verifier = which acceptance obligation** a check is authorized to close.
- **PR rule = promoted compact review law** that should be loaded repeatedly.
- **Anti-pattern candidate = detailed negative knowledge** that is not automatically always-loaded.
- **Feature dossier = navigable provenance map** for a material feature; Git history and live PR/CI state remain repository truth.
- **Context bundle = public-safe semantic orientation** for normal repository work.
- **Governance lock = vendored upstream-policy snapshot boundary**, not mutable GitHub-state evidence.

No label grants authority by itself.

## Load order

For material repository work:

1. Read root `AGENTS.md`.
2. Read `context/README.md` and the smallest required context bundle.
3. Read the most specific nested `AGENTS.md` for touched paths.
4. Read only the relevant role file under `agents/`.
5. Read the matching lifecycle command in `commands/README.md`.
6. Load `pr-rules/common.md` plus the smallest touched-area rule file.
7. Load the active feature dossier / execution plan when one exists.
8. Consult detailed anti-pattern candidates only when a promoted rule, touched area, or current finding points to them.
9. Escalate to external governance only when the governance lock says the task requires it.

Do **not** preload every candidate lesson or external memory source by default.

## Organization

- `context/` — project charter, semantic handoff, authority map, vendored governance, and governance lock.
- `knowledge/` — repository knowledge routing/index.
- `agents/` — bounded professional job contracts.
- `commands/` — repeatable lifecycle entry points.
- `pr-rules/` — compact human-promoted rules for repeated review use.
- `anti-patterns/` — candidate negative knowledge and promotion lifecycle.
- `features/` — feature-dossier schema and future feature provenance maps.
- `decisions/` — durable repository decision/ADR lane.
- `exec-plans/` — execution-plan contract and template; active task plans may remain in existing `docs/plans/`.
- `skills/` — repository-local skill projection boundary.
- `guardrails/` — authority and separation-of-duty constraints.
- `SCHEMAS.md` — canonical local record shapes.

## Compounding loop

```text
confirmed incident/review finding
→ anti-pattern candidate
→ immutable source evidence + regression guard
→ local validation
→ human/knowledge-steward adjudication
→ compact area/common PR rule
→ future reviews load the promoted rule
```

Evidence maturity and promotion scope are independent axes. A reviewer may **suggest** a lesson candidate. A reviewer may not silently write or promote its own lesson into review law.

## Feature trace

For a material feature, the navigable repository chain is:

```text
intent
→ local plan / feature dossier
→ branch + PR
→ implementation commits
→ review findings
→ repair rounds
→ exact-head CI/verifier evidence
→ anti-pattern candidates
→ decisions / handoff updates
→ terminal disposition
```

Public-safe opaque upstream reference IDs may be carried when a feature originated in global AIOS governance, but normal repository execution does not require an external round-trip.

A tracked dossier must not attempt to self-bind to the commit SHA that contains itself. Current candidate head is read live from GitHub; historical reviewed/verified heads may be recorded as evidence rows.

## Seed set

The first local negative-knowledge seed comes from PRs #67–#70. Detailed records live under `anti-patterns/candidates/`; only explicitly adjudicated generalized lessons belong in `pr-rules/`.
