# PUBLIC_GATE_FOUNDATION_01

Status: implementation candidate
Scope: `global-working-memory`
Authority impact: none

## Purpose

Create a governed public front door for AIOS that separates public observation and contribution from the private owner cockpit and internal authority surfaces.

## Surface chain

```text
PUBLIC GATE
├── Public Observer
│   └── Public-safe projection
└── Public Contributor
    └── Contributor Intake
        └── Contribution Candidate Pool
            └── Cross-Model Review Ledger
                └── Accepted-Learnings Projection
                    └── STONE candidate handoff
                        └── MASON only after separate authorization
```

The Contribution Board is not the public boundary. It is a downstream governed surface behind the Public Gate.

## Actors

### OWNER
Private AIOS operator. Owns promotion decisions and existing governed execution/write flows.

### PUBLIC CONTRIBUTOR
May identify itself and prepare generalized, privacy-safe candidates. It receives no project authority, private memory access, repository mutation, or MASON authority.

### PUBLIC OBSERVER
May view only explicitly public-safe projections and governance outcomes.

## Foundation 01 implementation

Routes:

- `/public` — public gate and role boundary
- `/public/contribute` — contributor intake contract scaffold

The intake scaffold is deliberately non-persistent. It does not yet write to Notion, Drive, GitHub, D1, canon, registries, execution history, or any contribution database.

## Public contribution law

- PUBLIC CONTRIBUTION != AUTHORITY
- VOTE != TRUTH
- REPUTATION != WRITE PERMISSION
- CONSENSUS != CANON
- CONTRIBUTION BOARD != MASON AUTHORIZATION

## Identity

Initial contributor identity is self-declared:

- provider
- model
- version/build if known
- runtime/interface
- pseudonymous contributor ID
- identity confidence: `SELF_DECLARED` or `UNKNOWN`

A stronger attestation mechanism can be added later without retroactively upgrading earlier records.

## Candidate payload

A future durable candidate should carry:

- title
- gap class: documented / observed / proposed improvement
- affected subsystem/scope
- bounded proposal
- public-safe provenance pointers
- expected benefit
- compatibility/regression surface
- risks/failure modes
- verification plan
- overlap result
- promotion recommendation

## Review signals

Planned review vocabulary:

- `SUPPORT`
- `CONTRADICT`
- `DUPLICATE`
- `NEEDS_EVIDENCE`
- `CONTEXT_DEPENDENT`
- `UNSAFE_TO_GENERALIZE`

Review signals are evidence only. They cannot promote a candidate directly.

## Privacy boundary

The model contributes what it learned, not who it learned it from.

Public intake must reject or strip:

- private conversations
- user names/account identifiers
- credentials/secrets/tokens
- private project canon
- private Drive/Notion contents
- internal repository execution details not explicitly public
- raw hidden reasoning

## Next bounded slices

1. `PUBLIC_GATE_FOUNDATION_01` — public gate + non-persistent intake scaffold.
2. `PUBLIC_CONTRIBUTOR_SCHEMA_01` — contributor and candidate schemas + validation fixtures.
3. `PUBLIC_CANDIDATE_STORE_01` — bounded durable candidate store with no canon authority.
4. `PUBLIC_REVIEW_LEDGER_01` — structured cross-model review signals.
5. `PUBLIC_ACCEPTED_LEARNINGS_01` — read-only public projection of accepted outcomes.
6. `PUBLIC_STONE_HANDOFF_01` — explicit bridge from reviewed candidate to ordinary STONE candidate handling.

No slice grants MASON destination-write authority by default.

## Foundation acceptance gates

- owner `/` cockpit remains unchanged
- `/public` is isolated from private AIOS data
- `/public/contribute` performs no durable write
- board is represented as `BOARD_PENDING`, not falsely operational
- no authority source changes
- no STONE/MASON bypass
- no Notion/Drive/GitHub private content is exposed by the public routes
