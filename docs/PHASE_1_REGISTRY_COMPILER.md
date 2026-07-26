# Phase 1 Registry Compiler

Status: development foundation for issue #11  
Source contract: `RepoRegistrySource/1.0`  
Compiled contracts: `CompiledAiosRegistry/1.0` and `AiosRegistryInventory/1.0`

## Purpose

Phase 1 moves portable scope, alias, capability, workflow, and authority configuration into versioned repository files. These files are public starter configuration, not an export of the maintainer's private Notion or Google Drive registries.

```text
config/registry.json
config/scopes/*.json
config/aliases/*.json
config/capabilities/*.json
config/workflows/*.json
config/authority/*.json
        |
        v
validate exact IDs, references, health, handlers, and schema fingerprints
        |
        v
compile deterministic full-policy and compact-inventory artifacts
```

## Commands

```sh
npm run registry:validate
npm run registry:compile
```

Compilation writes two untracked operational artifacts under `outputs/registry/`:

- `compiled-registry.json`, the complete portable policy snapshot
- `registry-inventory.json`, the compact discovery projection

The full-policy fingerprint and compact-inventory fingerprint are separate. The compiler does not include wall-clock compilation time, absolute paths, host metadata, or provider state in either artifact, so identical source inputs produce byte-identical outputs on separate machines.

## Routing law

The source manifest preserves this order:

1. exact scope key
2. exact project name
3. registered alias
4. explicit parent/subproject mapping
5. bounded conversational continuity mapped to a registered scope
6. ambiguity or no-match

Semantic similarity may later propose candidates, but it may not silently select a durable scope.

## Current validation gates

The compiler fails closed for:

- malformed JSON and contract headers
- duplicate scope, alias, capability, workflow, and authority IDs
- overlapping exact aliases after case normalization
- aliases or authority bindings pointing to unknown scopes
- unknown parent scopes
- capabilities pointing to unknown workflows
- capability/workflow handler-reference disagreement
- unavailable handlers
- malformed, stale, or mismatched capability schema fingerprints

Diagnostics include a stable error code, repository-relative file, field, and actionable message.

## Authority and privacy boundaries

- Repository configuration is the portable public default, not the maintainer's private canon.
- Notion and Drive adapters may later import observations, but they do not become canonical compiler dependencies.
- The default validation and compile path performs no cloud-provider reads and executes no workflows.
- `READ_FROM`, `AUTHORITY`, execution permission, and destination-write permission remain separate.
- Runtime mutation of registry source files is outside this slice and must use the governed write path.

## Next bounded work

1. Ratify the JSON Schema bundle for every registry source type and compiled artifact.
2. Add exact project-name, alias, parent/subproject, ambiguity, and no-match resolution services over the compiled artifact.
3. Replace the native in-code capability array with a compatibility adapter consuming the compiled registry without changing discovery authorization rules.
4. Add deprecation, replacement, overlap-precedence, and inventory-only delta tests.
