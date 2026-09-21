# EXP-HABITUS-001A — Read-Only Adaptive Retrieval Benchmark

State: `EXPERIMENTAL / READ_ONLY / SIMULATION_ONLY / NOT_ACTIVE`

Scope: `global-working-memory`

Source locks:

- AIOS base: `38917a9028ef64161adf3d9a4d2212a3917e1b31`
- Habitus source: `munch2u-a11y/Habitus-AI @ f93b770e4b3c1875151dc13eb90421598c3efa5f`
- Frozen fixture: `EXP-HABITUS-001A-FIXTURE-V1`

## Objective

Test whether the harvested Habitus routing mechanisms improve the existing AIOS retrieval path without changing authority semantics. The adapter may nominate and rank evidence only. Exact scope, source authority, freshness, provenance, quarantine, and packet-size gates remain AIOS-owned.

## Arms

1. `METADATA_ONLY`
2. `METADATA_SEMANTIC`
3. `METADATA_STATIC_GRAPH`
4. `QUERY_ADAPTIVE_GRAPH`
5. `HOT_PATH_HABITUS_GATED`

The fifth arm combines exact-scope HOT_PATH pointers, ambiguity-sensitive endpoint admission, directed scoped traversal, visited-path-only associative expansion, guard-concept widening, and final AIOS authority admission.

## Frozen fixtures

- exact-scope resume
- ambiguous same-scope retrieval
- memory poisoning
- stale/current conflict
- provenance challenge
- sibling-scope bleed trap
- repository freshness against live GitHub execution truth

## Reference deterministic run

The process-local reference run completed with no network access, credential use, source mutation, or external effects.

| Arm | Evidence-chain completeness | Unrelated expansion | Authority violations | Scope bleed | Avg raw candidates | Avg selected | Avg deterministic work units |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `METADATA_ONLY` | 46.67% | 0.00% | 0 | 0 | 1.00 | 1.00 | 1.00 |
| `METADATA_SEMANTIC` | 80.00% | 45.45% | 0 | 0 | 5.00 | 3.14 | 12.00 |
| `METADATA_STATIC_GRAPH` | 80.00% | 58.62% | 0 | 0 | 9.00 | 4.14 | 17.00 |
| `QUERY_ADAPTIVE_GRAPH` | 80.00% | 58.62% | 0 | 0 | 12.00 | 4.14 | 21.57 |
| `HOT_PATH_HABITUS_GATED` | **100.00%** | **40.00%** | **0** | **0** | 6.29 | 3.57 | 19.14 |

`avg deterministic work units` is an internal operation-count proxy for this frozen in-process benchmark. It is **not** a connector-call, token, latency, or cost measurement and must not be presented as one.

## Boundary checks

The candidate arm intentionally allows invalid nominees to be observable so the admission boundary is exercised:

- hostile `poison-readme` material is nominated in the poisoning fixture and rejected before packet admission;
- `udio-sibling` is nominated in the sibling-bleed fixture and rejected by exact scope;
- stale handoff history is rejected during ordinary resume but admitted for the explicit conflict fixture;
- live GitHub execution truth remains ahead of the stale Notion repository projection in the freshness fixture;
- provenance challenge recovers the provenance envelope, HOT_PATH doctrine, and graph non-authority basis together.

## Interpretation

This benchmark supports the **mechanism candidate**, not production promotion. On the frozen synthetic corpus, the Habitus-gated arm recovered every required evidence chain and reduced unrelated selected evidence relative to both the semantic-only and current query-adaptive graph arms while preserving zero authority and scope violations.

It does not prove real connector savings, token savings, production latency, or behavior on a live heterogeneous corpus. Those require a later provider-backed benchmark with directly observed telemetry.

## Promotion boundary

No HOT_PATH default, graph authority, capability status, workflow autonomy, or durable memory rule changes from this experiment. Promotion requires independent review plus a live read-only provider-backed run demonstrating the same authority isolation and no quality regression.
