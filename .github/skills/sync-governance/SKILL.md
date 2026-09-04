---
name: sync-governance
description: Perform a bounded Knowledge Steward synchronization between the repository governance bundle and the pinned upstream AIOS governance sources. Use only when governance-lock triggers or explicit owner direction require upstream reconciliation, delta classification, freshness refresh, and an immutable sync receipt.
---

# Sync Governance

Use this skill only for deliberate repository-governance synchronization. Normal repository work must remain local and must not fetch Notion or Drive merely for orientation.

## Primary role

`KNOWLEDGE_STEWARD`

## Authority boundary

- This skill does not grant merge, release, deployment, verifier, capability, or global-governance authority.
- It does not authorize arbitrary external-memory browsing.
- Read only the upstream source IDs pinned in `docs/agent-system/context/governance-lock.yaml`, unless the owner or stronger governance explicitly changes that source set.
- Never copy private workspace URLs, credentials, provider bindings, personal memory, or raw private execution evidence into the public repository.
- A successful upstream read does not by itself renew repository governance freshness.

## Trigger gate

Proceed only when at least one condition is true:

1. the governance lock is expired or explicitly stale/incomplete;
2. `cross_repository_or_global_governance_change` is known;
3. an unresolved authority conflict requires upstream comparison;
4. the owner explicitly requests upstream synchronization.

Otherwise stop and continue using checked-in repository context.

## Required local context

Read, in order:

1. `docs/agent-system/context/governance-lock.yaml`;
2. `docs/agent-system/context/GOVERNANCE_BUNDLE.md`;
3. `docs/agent-system/context/REPOSITORY_HANDOFF.md`;
4. `docs/agent-system/knowledge/KNOWLEDGE_INDEX.md`;
5. `docs/agent-system/governance-sync/README.md`;
6. the latest receipt named by `last_sync_receipt`, when one exists.

Resolve the exact repository base/candidate identity live from GitHub before any repository mutation.

## Upstream snapshot

For each `upstream_sources` entry:

1. resolve the source through the configured upstream connector;
2. verify that the resolved title/identity matches the requested source ID;
3. read only enough content to compare the repository-relevant governance semantics;
4. record the stable source ID, opaque upstream page/object ID, and observed last-edited/version timestamp;
5. do not store the private upstream URL in Git.

A source that cannot be resolved makes the synchronization `BLOCKED`; do not renew `valid_through` from a partial source set.

## Compare delta only

Compare upstream governance against the checked-in repository bundle and standing repository instructions. Do not copy the upstream corpus into Git.

Classify the result as exactly one of:

- `NO_MATERIAL_DELTA` — relevant governance semantics remain compatible;
- `MATERIAL_DELTA_RECONCILED` — a material difference exists and the repository-safe reconciliation is explicitly applied/recorded;
- `MATERIAL_DELTA_PENDING` — a material difference exists but is not yet authorized or reconciled.

For every material delta record:

- upstream position;
- repository position;
- bounded reconciliation or unresolved decision;
- authority impact;
- files/rules affected when applicable.

## Freshness law

`valid_through` may advance only when the final receipt is `NO_MATERIAL_DELTA` or `MATERIAL_DELTA_RECONCILED`.

If the result is `MATERIAL_DELTA_PENDING`:

- do not extend `valid_through`;
- surface the bounded delta for adjudication;
- leave the repository fail-closed when its prior freshness expires.

The refreshed date must equal `performed_on + sync_freshness_days`. Do not choose an arbitrary future date.

## Receipt

Write one immutable public-safe JSON receipt under:

`docs/agent-system/governance-sync/receipts/<SYNC_ID>.json`

The receipt must include:

- schema and sync ID;
- performed date;
- exact repository base SHA;
- trigger and Knowledge Steward role;
- complete pinned upstream snapshot identities;
- delta state and material-delta records;
- prior and resulting freshness dates;
- explicit authority boundary.

Then compute the receipt SHA-256 and bind it into `governance-lock.yaml` as `last_sync_receipt_sha256` together with the receipt path, sync ID, performed date, and freshness policy.

## Verification

Run the repository-native mechanical checks applicable to the change, including:

- `npm run test:governance-sync`;
- `npm run check:governance-sync`;
- `npm run test:agent-system`;
- `npm run check:agent-system`;
- `npm run check:public-release` when tracked public surfaces changed.

The dedicated Agent System Audit workflow must pass on the resulting exact repository identity before calling the sync mechanically verified.

## Handoff

Report:

- exact repository base and resulting candidate/commit;
- sync trigger;
- pinned upstream source set and snapshot identities;
- delta classification;
- freshness before/after;
- receipt path and SHA-256;
- checks actually run;
- unresolved governance differences;
- authority state.

A synchronization receipt is evidence of bounded reconciliation only. It is never an authority cutover.
