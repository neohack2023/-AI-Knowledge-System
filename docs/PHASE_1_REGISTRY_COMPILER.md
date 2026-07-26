# Phase 1 Registry Compiler

Status: active development for issue #11  
Source contract: `RepoRegistrySource/1.0`  
Compiled contracts: `CompiledAiosRegistry/1.0` and `AiosRegistryInventory/1.0`  
Resolution contract: `ScopeResolutionResult/1.0`

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
        |
        v
resolve exact scope without loading packets or granting execution authority
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

## Deterministic routing tables

The compiled policy contains machine-generated lookup tables:

- `exact_scope_keys`
- `exact_project_names`
- `exact_aliases`
- `children_by_parent`

Keys are normalized by trimming, collapsing whitespace, and applying lowercase comparison. Values remain canonical registered scope keys. These tables are part of the full-policy fingerprint, so routing-policy drift changes the compiled registry identity.

## Routing law

The resolver preserves this order:

1. exact scope key
2. exact project name
3. registered alias
4. explicit parent/subproject mapping
5. bounded conversational continuity mapped to a registered scope
6. ambiguity or no-match

Bounded continuity must be explicitly authorized by the caller and must point to an already registered scope. Semantic similarity may later propose candidates, but it may not silently select a durable scope.

A successful scope resolution still reports:

- `scope_packet_loaded=false`
- `workflow_execution_authorized=false`
- `destination_write_authorized=false`

Routing identifies a legal scope candidate. It does not grant data access, workflow entry, or mutation authority.

## Compiled capability compatibility loader

`packages/capability-registry/compiled-provider.ts` converts the compiled capability collection into a stable provider snapshot for the existing discovery service. It validates contract headers, identifiers, handler references, schema fingerprints, and duplicate capability IDs before returning cloned definitions.

The loader exposes metadata and definitions only. It declares `execution_authority=NONE` and `destination_write_authorized=false`. Wiring it into the active runtime remains a separate patch so the transition can be tested without silently replacing execution truth.

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

1. Wire the compiled capability provider into the existing discovery runtime behind a compatibility composition root.
2. Expose exact scope resolution through the direct TypeScript API and existing HTTP surface.
3. Bind discovery envelopes to the compiled registry version and full-policy fingerprint.
4. Add deprecation, replacement, overlap-precedence, ambiguity, and inventory-only delta tests.
