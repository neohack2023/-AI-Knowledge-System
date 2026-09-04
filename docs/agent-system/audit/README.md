# Agent-System Audit

Phase 4 gives the repository-local agent organization a deterministic internal-audit lane.

The audit is intentionally narrower than code review. It verifies the structural claims that make the repository self-sufficient and navigable for agents. It does not judge product behavior and it does not grant merge, release, verifier, or owner authority.

## Commands

- `npm run test:agent-system` tests the audit logic itself.
- `npm run check:agent-system` audits the current repository and writes `outputs/agent-system-audit.json`.
- `.github/workflows/agent-system-audit.yml` runs the same checks on relevant pull requests, pushes to `main`, and manual dispatch.

## Fail-closed checks

1. **Skill discovery** — every registered `.github/skills/<name>/SKILL.md` has valid YAML frontmatter, a lowercase kebab-case `name`, a useful `description`, and a name that matches its directory.
2. **Role → skill binding** — each canonical lifecycle role references the exact registered skill path.
3. **Local documentation links** — relative Markdown targets inside the agent-system/instruction surfaces must resolve to a repository file or directory.
4. **Governance freshness** — `governance-lock.yaml` must declare Phase 4, keep the organization audit active, match the installed skill registry, and remain before its explicit `valid_through` date.
5. **Anti-pattern provenance** — every `CONFIRMED` or `VALIDATED_LOCAL` anti-pattern must preserve an immutable 40-character source identity plus a specific review/run/process evidence edge; promoted lessons must resolve to an existing PR rule.
6. **Feature / decision / plan indexing** — real feature dossiers, ADRs, and active execution plans must remain structurally valid and discoverable from their repository indexes/handoff surfaces.
7. **Handoff phase drift** — the semantic handoff phase must equal the governance-lock phase, and its next-action block may not advertise an already-active phase as future work.

## Governance expiry

`valid_through` is intentionally time-sensitive. Once that date passes, the audit fails until the Knowledge Steward reviews the local governance snapshot and explicitly refreshes it. This prevents a repository that claims self-sufficiency from silently operating forever on an unreviewed policy projection.

## Evidence

The report schema is deliberately small:

- audited immutable head when available;
- `PASS` or `FAIL`;
- enabled check classes;
- issue counts by stable failure code;
- sorted issue records with file and message.

Generated `outputs/**` remains evidence, not tracked source.

## Authority boundary

A green organization audit means the checked repository structure satisfies these declared organizational invariants. It does **not** mean application tests passed, a model review is clean, a candidate is merge eligible, or an owner authorized release.
