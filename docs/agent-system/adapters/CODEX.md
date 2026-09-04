# OpenAI Codex Adapter

Codex enters this repository through hierarchical `AGENTS.md` instructions.

## Entry

1. Read root `AGENTS.md`.
2. Read `docs/agent-system/context/README.md` and the smallest local context it routes.
3. For every touched path, obey the most specific applicable nested `AGENTS.md`.
4. Resolve the relevant role, command, PR rules, plan/feature dossier, and verifier obligations from `docs/agent-system/**`.

## Context discipline

Keep `AGENTS.md` as a map rather than an encyclopedia. Deeper repository docs are the structured local knowledge base.

Normal repository tasks should not fetch Notion/Drive. Escalate only when `context/governance-lock.yaml` says upstream synchronization is necessary or the owner explicitly requests it.

## Authority discipline

Direct user/system/developer instructions can explicitly authorize an exception to repository defaults, but the exception must be narrow and recorded in the resulting handoff/receipt when it changes mutation policy.

A Codex review remains model advisory unless a declared verifier/human authority contract says otherwise. Codex may propose fixes and evidence; it does not create merge/release authority through confidence or repetition.
