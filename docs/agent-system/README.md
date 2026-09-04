# Repository Agent Operating System

This directory is the repository-local operating map for agents working in AI Knowledge System. It organizes **who does the work, when a workflow is invoked, which review rules apply, how failures become lessons, and how material features remain traceable**.

It intentionally does not duplicate external cross-repository governance. GitHub remains authoritative for repository files, branches, commits, pull requests, reviews, and CI. These files are the public, local execution projection agents need while working here.

## Core model

- **Agent/role = who** performs a bounded job.
- **Command = when** a repeatable repository workflow is invoked.
- **Skill = how** a reusable procedure is performed.
- **Verifier = which acceptance obligation** a check is authorized to close.
- **PR rule = promoted compact review law** that should be loaded repeatedly.
- **Anti-pattern candidate = detailed negative knowledge** that is not automatically always-loaded.
- **Feature dossier = navigable provenance map** for a material feature; Git history and live PR/CI state remain repository truth.

No label grants authority by itself.

## Load order

For material repository work:

1. Read root `AGENTS.md`.
2. Read the most specific nested `AGENTS.md` for touched paths.
3. Read only the relevant role file under `agents/`.
4. Read the matching lifecycle command in `commands/README.md`.
5. Load `pr-rules/common.md` plus the smallest touched-area rule file.
6. Load the active feature dossier when one exists.
7. Consult detailed anti-pattern candidates only when a promoted rule, touched area, or current finding points to them.

Do **not** preload every candidate lesson by default.

## Organization

- `agents/` — bounded professional job contracts.
- `commands/` — repeatable lifecycle entry points.
- `pr-rules/` — compact human-promoted rules for repeated review use.
- `anti-patterns/` — candidate negative knowledge and promotion lifecycle.
- `features/` — feature-dossier schema and future feature provenance maps.
- `skills/` — repository-local skill projection boundary.
- `guardrails/` — authority and separation-of-duty constraints.
- `SCHEMAS.md` — canonical local record shapes.

## Compounding loop

```text
confirmed incident/review finding
→ anti-pattern candidate
→ evidence + regression guard
→ local validation
→ human/knowledge-steward adjudication
→ compact area/common PR rule
→ future reviews load the promoted rule
```

A reviewer may **suggest** a lesson candidate. A reviewer may not silently write or promote its own lesson into review law.

## Feature trace

For a material feature, the navigable chain is:

```text
intent
→ external STONE/MASON reference IDs when safe to expose
→ repository plan / feature dossier
→ branch + PR
→ implementation commits
→ review findings
→ repair rounds
→ exact-head CI/verifier evidence
→ anti-pattern candidates
→ terminal disposition
```

A tracked dossier must not attempt to self-bind to the commit SHA that contains itself. Current candidate head is read live from GitHub; historical reviewed/verified heads may be recorded as evidence rows.

## Seed set

The first local negative-knowledge seed comes from PRs #67–#69. PR #67 supplied trust-binding and convergence failures, PR #68 supplied instruction/CI mismatches, and PR #69 supplied regression-test strength failures. Detailed records live under `anti-patterns/candidates/` and only selected generalized lessons are promoted into `pr-rules/`.
