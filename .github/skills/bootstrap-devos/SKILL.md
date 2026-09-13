---
name: bootstrap-devos
description: Inspect a target repository and install or adapt the smallest repository-native DevOS scaffold without duplicating an existing operating layer or importing external memory as a runtime dependency.
---

# Bootstrap DevOS

Use this skill when a repository-facing engineering task reaches a repository that lacks a usable DevOS or equivalent repository operating layer.

## Authority boundary

- The repository's live code, tests, commits, branches, PRs, and CI remain repository execution truth.
- DevOS is a local cognition/routing/evidence layer, not a new authority source.
- External memory/governance remains upstream when declared by the target repository.
- Research findings are candidate-only until validated and promoted through the target repository's normal governed path.
- This skill does not authorize merge, release, deployment, authority cutover, or bulk import of external memory.

## Preflight

1. Resolve the exact target repository/root and current immutable base when available.
2. Inventory existing instructions, DevOS/repo-OS surfaces, languages, package/runtime markers, tests, CI, and verification commands.
3. Run the compiler in plan-only mode:

```bash
node scripts/agent-system/devos-compiler.mjs --root <target-root>
```

4. Inspect the `DevOSAdaptationProfile` before writing anything.

## Decision law

- `DEVOS_PRESENT` → reuse it; do not create a competing scaffold.
- `EQUIVALENT_REPO_OS_PRESENT` → adapt/reuse the existing local operating layer; do not create `devos/` merely for naming consistency.
- `BOOTSTRAP_REQUIRED` → install only the minimal scaffold justified by the repository.

The compiler is a template compiler, not a copier. A greenfield repository should not receive the full machinery of a mature reference implementation.

## Apply

When repository writes are authorized:

```bash
node scripts/agent-system/devos-compiler.mjs --root <target-root> --apply --report <receipt-path>
```

Apply must remain non-destructive:

- never overwrite an existing file;
- preserve coherent repository conventions;
- create `AGENTS.md` only when absent;
- do not add SQLite, specialist roles, CI, or additional skills unless repository evidence separately justifies them;
- do not copy private Notion/Drive content, user memory, credentials, or raw private evidence into the repository.

## Research handoff

The bootstrap installs a research-preflight policy. During later work, bounded public research is justified only by declared signals such as external uncertainty, blocker, capability gap, stale evidence, weak comparison, design dead-end, feature-incubation need, or relevant opportunity window.

Research should prefer primary/inspectable sources for factual claims and keep fact, inference, and inspiration separate. A source being persuasive, popular, or recent does not grant authority.

## Learning handoff

Successful work may produce repository-local semantic/procedural knowledge. Failed plausible approaches may produce negative knowledge/anti-pattern records. Preserve evidence and maturity state.

Do not auto-promote either path. Broader reusable lessons remain candidates until transfer/regression evidence and repository governance justify promotion.

## Verification

At minimum:

1. run `node --test tests/devos-compiler.test.mjs` in this source repository when changing the compiler;
2. inspect the generated target scaffold;
3. run the target repository's applicable existing verification commands;
4. report files created/skipped and any deferred components;
5. bind the handoff to the actual target repository/base identity when available.

## Stop conditions

Stop or return a bounded no-op when:

- an existing DevOS/repo OS already owns the function;
- the target repository cannot be resolved safely;
- applying the scaffold would overwrite existing files;
- the requested change would create a competing authority layer;
- external knowledge is required but its authority/source boundary cannot be established;
- the task needs a larger runtime/database/governance installation than the minimal compiler is authorized to provide.
