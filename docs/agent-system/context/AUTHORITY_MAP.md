# Repository Authority Map

This map answers: **where should an agent look first, and which surface owns the fact?**

| Fact class | Repository-local owner | External/upstream role |
| --- | --- | --- |
| code, commits, branches, PRs, reviews, CI | live GitHub | none for current repository truth |
| repository architecture and public contracts | checked-in repository docs | upstream may inform future synchronized changes |
| repository-local operating rules | `AGENTS.md`, nested instructions, `docs/agent-system/**` | upstream global governance may be vendored by reviewed sync |
| semantic repository handoff | `context/REPOSITORY_HANDOFF.md` | upstream project handoff may seed/synchronize it |
| feature provenance | feature dossier + Git history + PR/CI evidence | upstream may retain cross-project episode memory |
| repository decisions | `decisions/**` | global decisions remain upstream until explicitly synchronized |
| task execution plans | repository plan/exec-plan surfaces | upstream may retain program-level planning |
| anti-pattern candidates and promoted PR rules | `anti-patterns/**` + `pr-rules/**` | cross-repo promotion remains upstream-governed |
| secrets, personal memory, private evidence, provider bindings | **not stored here** | private external surfaces only |
| merge/release/authority authorization | explicit human/declared authority bound to current candidate | never inferred from docs, role names, CI, or model review |

## Resolution rules

1. For current repository facts, live GitHub wins.
2. For repository-local operating semantics, the most specific current checked-in contract wins unless it conflicts with a stronger explicit authority boundary.
3. The vendored governance bundle is sufficient for normal repository work until its lock declares an external synchronization trigger.
4. External retrieval is an escalation path, not the default bootstrap.
5. A source conflict is a finding. Do not silently merge authorities or choose the weaker rule.
