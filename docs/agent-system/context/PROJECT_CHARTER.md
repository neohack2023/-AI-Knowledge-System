# Project Charter

## Identity

AI Knowledge System is the public implementation repository for the AIOS knowledge/runtime/cockpit workstream. It contains repository-owned code, public contracts, tests, workflows, documentation, and agent-operating guidance.

## Mission

Build a repository that is understandable, reviewable, testable, and operable by bounded coding agents without requiring a private workspace lookup for normal repository tasks.

## Repository laws

- GitHub is authoritative for repository files, commits, branches, pull requests, reviews, workflow runs, and current implementation state.
- Checked-in repository documentation is the default source for repository-local architecture, operating rules, decisions, plans, and semantic handoff state.
- Private workspace memory, credentials, personal context, live provider bindings, and private evidence do not belong in this public repository.
- Repository-local context can vendor the execution rules needed from broader AIOS governance without claiming a global authority cutover.
- Current mutable repository facts must be resolved live rather than copied into long-lived docs as if they were permanent.

## Normal work definition

Normal repository work includes repository-scoped planning, implementation, review, verification, negative-knowledge capture, decision recording, execution-plan maintenance, and release-handoff preparation.

Normal repository work should not require Notion or Drive retrieval when the required local context is present and current enough for the task.

## External context boundary

External AIOS governance remains relevant for cross-repository/global policy, authority changes, upstream synchronization, or conflicts that the repository bundle cannot resolve. Those are explicit escalation cases, not the default entry path.
