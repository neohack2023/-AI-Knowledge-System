# Phase 1 Registry Compiler

Status: active development for issue #11  
Source contract: `RepoRegistrySource/1.0`  
Compiled contracts: `CompiledAiosRegistry/1.0` and `AiosRegistryInventory/1.0`  
Resolution contract: `ScopeResolutionResult/1.0`  
Composition contract: `PortableAiosRuntime/0.1`

## Purpose

Phase 1 moves portable scope, alias, capability, workflow, and authority configuration into versioned repository files. These files are public starter configuration, not an export of the maintainer's private Notion or Google Drive registries.

```text
config source files
        |
        v
validate exact IDs, references, health, handlers, and schema fingerprints
        |
        v
compile deterministic full-policy and compact-inventory artifacts
        |
        v
verify checked-in runtime snapshot matches compiler output exactly
        |
        v
portable composition root
   |                    |
   v                    v
exact scope resolver    capability discovery/materialization
```

## Commands

```sh
npm run registry:validate
npm run registry:compile
```

Compilation writes two untracked operational artifacts under `outputs/registry/`:

- `compiled-registry.json`, the complete portable policy snapshot
- `registry-inventory.json`, the compact discovery projection

The edge-compatible runtime consumes the checked-in deterministic snapshot at `packages/runtime-composition/compiled-public-registry.ts`. CI recompiles the source registry and requires byte-equivalent object content, including both fingerprints. A stale or manually altered runtime snapshot fails the Phase 1 registry job.

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

## Portable runtime composition

`server/runtime/portable.ts` is the active composition root for this slice. It loads one immutable compiled registry snapshot, creates the capability provider from that snapshot, and exposes exact scope resolution against the same registry identity.

The existing capability API now uses this composition root instead of the in-code native capability array. Discovery envelopes carry the compiled registry version and full-policy fingerprint. Materialization rechecks the same fingerprint before loading a schema.

The composition root exposes no execution method. It declares:

- `execution_authority=NONE`
- `destination_write_authorized=false`
- `workflow_execution_entrypoint=WorkflowExecutionKernel`

All later LIVE execution must still enter the existing kernel. Registry loading, scope resolution, capability discovery, and schema materialization do not create a parallel authority path.

## HTTP surfaces

- `GET /api/scopes/resolve` returns the resolver contract and compiled registry identity.
- `POST /api/scopes/resolve` performs exact, non-semantic resolution without loading project packets.
- `GET /api/capabilities` reports the same compiled registry version and fingerprints.
- Existing capability discovery, selection, approval, rejection, and materialization operations remain process-local and non-executing.

## Current validation gates

The compiler and runtime tests fail closed for:

- malformed JSON and contract headers
- duplicate scope, alias, capability, workflow, and authority IDs
- overlapping exact aliases after case normalization
- aliases or authority bindings pointing to unknown scopes
- unknown parent scopes
- capabilities pointing to unknown workflows
- capability/workflow handler-reference disagreement
- unavailable handlers
- malformed, stale, or mismatched capability schema fingerprints
- checked-in runtime snapshot drift
- compiled capability contract or fingerprint mismatch
- duplicate capability IDs in the compiled provider
- inactive, unhealthy, or expired exact scope matches
- registry identity divergence between scope and capability HTTP surfaces

Diagnostics include a stable error code, repository-relative file, field, and actionable message.

## Authority and privacy boundaries

- Repository configuration is the portable public default, not the maintainer's private canon.
- Notion and Drive adapters may later import observations, but they do not become canonical compiler dependencies.
- The default validation, compile, resolution, discovery, and composition paths perform no cloud-provider reads.
- `READ_FROM`, `AUTHORITY`, execution permission, and destination-write permission remain separate.
- Runtime mutation of registry source files is outside this slice and must use the governed write path.

## Next bounded work

1. Add deprecation, replacement, overlap-precedence, ambiguity, and inventory-only delta tests.
2. Add registry compatibility rules for supported contract-version ranges and explicit migration failures.
3. Introduce the portable authority-resolution service over compiled authority bindings.
4. Prepare the handoff from issue #11 into the end-to-end portable runtime work in issue #12.
