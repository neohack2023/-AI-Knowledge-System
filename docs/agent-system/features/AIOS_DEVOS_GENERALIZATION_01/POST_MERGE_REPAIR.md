# AIOS_DEVOS_GENERALIZATION_01 — Post-Merge Repair

State: `ACTIVE`

## Trigger

Post-merge review of PR #86 identified three confirmed bootstrap safety defects in `scripts/agent-system/devos-compiler.mjs`:

1. caller-controlled `--devos-root` could escape the target repository via parent traversal;
2. a nonexistent `--root` could be treated as an empty repository and created accidentally;
3. directory existence alone could be mistaken for a coherent DevOS, preventing interrupted bootstrap recovery.

## Authority boundary

These findings are evidence-backed negative knowledge, not global law. The repair is bounded to the DevOS compiler and its regression tests. No authority, release, deployment, or external-memory boundary changes are included.

## Repair obligations

- fail closed when the requested repository root does not exist or is not a directory;
- reject absolute or escaping DevOS roots before mutation;
- validate every generated scaffold target remains inside the resolved repository root;
- distinguish coherent DevOS, incomplete known bootstrap, and unrecognized path conflict;
- resume a known incomplete minimal bootstrap by creating only missing files;
- keep unrelated existing `devos/` / `.devos/` paths fail-closed rather than silently claiming them;
- add regression tests for each failure mode;
- run exact-head CI and Agent System Audit before merge.
