# Repository Context Bundle

This directory is the default semantic orientation packet for normal repository-scoped work.

## Self-sufficiency rule

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE`

A repository agent should first exhaust the checked-in context and live GitHub repository state before requesting external workspace context.

External Notion/Drive retrieval is reserved for explicit upstream synchronization, cross-repository/global governance changes, unresolved authority conflicts, or an owner request.

## Read order

1. `PROJECT_CHARTER.md` — what this repository is and what it is for.
2. `REPOSITORY_HANDOFF.md` — current semantic phase, active concerns, and next repository actions.
3. `AUTHORITY_MAP.md` — which surface owns which class of truth.
4. `GOVERNANCE_BUNDLE.md` — public-safe repository execution laws vendored from upstream AIOS governance.
5. `governance-lock.yaml` — snapshot identity, sync state, and external-fetch triggers.
6. `../knowledge/KNOWLEDGE_INDEX.md` — route to deeper repository knowledge only when the task needs it.

Then load the smallest task-specific role, command, PR rule, feature dossier, architecture doc, or execution plan.

## Freshness boundary

Tracked context files are semantic snapshots. They must not pretend to know mutable GitHub facts such as the current default-branch SHA, current PR head, current CI conclusion, or current unresolved review threads. Resolve those live from GitHub when relevant.

If a semantic handoff conflicts with current repository contents, GitHub/repository state wins for implementation facts and the mismatch becomes a handoff-drift finding.

## Upstream synchronization

The Knowledge Steward owns proposals to refresh this bundle from upstream cross-repo/global AIOS governance. A normal implementer or reviewer does not fetch upstream context just because it exists.
