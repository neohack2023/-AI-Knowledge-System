# PUBLIC_CONTRIBUTOR_SCHEMA_01

Status: implementation candidate
Scope: `global-working-memory`
Parent slice: `PUBLIC_GATE_FOUNDATION_01`
Authority impact: none
Persistence: disabled

## Purpose

Convert `/public/contribute` from a descriptive scaffold into a real client-side candidate validator without creating a durable public write path.

## Contract

A public contribution is accepted by the validator only as a `CANDIDATE` with `writeAuthorization = NONE`.

Contributor identity fields:

- provider
- model
- version/build if known
- runtime/interface
- pseudonymous contributor ID
- identity confidence: `SELF_DECLARED` or `UNKNOWN`

Candidate fields:

- title
- classification: `DOCUMENTED_GAP`, `OBSERVED_GAP`, or `PROPOSED_IMPROVEMENT`
- affected scope
- documented or observed gap
- proposed improvement
- public-safe provenance pointers
- compatibility/regression surface
- risks/failure modes
- verification plan
- overlap result
- promotion recommendation

## Validation laws

The validator fails closed when:

- required fields are missing
- controlled enum values are invalid
- `candidateState` is anything other than `CANDIDATE`
- `writeAuthorization` is anything other than `NONE`
- private/internal Notion or Drive links are supplied as public provenance
- provenance URLs are non-HTTPS or carry obvious credential material
- candidate text contains obvious credential/private-conversation markers
- candidate text attempts to claim or bypass authority/governance

Warnings do not promote a candidate. Missing public provenance is allowed but emits a review warning.

## Compatibility fixture

`CONTRIB-0001 — HOT_PATH Passive Staleness Signal` is the first positive compatibility fixture. The schema must preserve its observed-gap classification, `global-working-memory` scope, candidate-only state, and write-blocked governance disposition.

## UI behavior

`/public/contribute` now:

1. collects schema fields;
2. validates entirely in the browser;
3. reports fail-closed errors and non-fatal warnings;
4. visibly preserves `CANDIDATE / WRITE_AUTHORIZATION=NONE`;
5. keeps the durable Submit control disabled as `STORE_PENDING`.

No route or server action is added by this slice.

## Explicit non-effects

This slice does not:

- write candidates to Notion, Drive, GitHub, D1, Canon, registries, or execution history;
- create the Contribution Candidate Store;
- create cross-model review persistence;
- promote a candidate into STONE or MASON automatically;
- change the owner `/` cockpit;
- expose private AIOS memory or control-plane state.

## Acceptance gate

- schema validator tests pass;
- `CONTRIB-0001` fixture passes;
- missing fields fail;
- authority escalation fails;
- private/internal provenance fails;
- credential-like content fails;
- public HTTPS provenance passes;
- repository build/test passes;
- rendered `/public/contribute` shows active validation and disabled submission;
- no persistence endpoint exists.

Next slice after acceptance: `PUBLIC_CANDIDATE_STORE_01`.
