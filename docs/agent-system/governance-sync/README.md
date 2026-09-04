# Repository Governance Synchronization

This lane is the bounded upstream supply path for repository governance. It exists so normal agents can work from checked-in context without treating Notion or Drive as a routine runtime dependency.

## Default rule

`NORMAL_REPO_WORK_EXTERNAL_FETCH_REQUIRED = FALSE`

Only the Knowledge Steward should invoke upstream synchronization, and only when `governance-lock.yaml` or explicit owner direction triggers it.

## Supply chain

```text
governance-lock trigger
→ Knowledge Steward / sync-governance skill
→ resolve exact repository base
→ fetch only pinned upstream governance sources
→ record opaque source snapshot identities
→ compare semantic delta only
→ classify delta
→ reconcile or stop
→ write immutable sync receipt
→ bind receipt SHA-256 in governance-lock
→ derive valid_through from fixed freshness policy
→ mechanical sync validation
→ organization audit
→ handoff
```

## Delta states

- `NO_MATERIAL_DELTA`: relevant upstream governance remains compatible with the repository bundle.
- `MATERIAL_DELTA_RECONCILED`: a material difference exists and the bounded repository-safe reconciliation has been explicitly recorded/applied.
- `MATERIAL_DELTA_PENDING`: a material difference exists but remains unresolved. Freshness must not be renewed.

## Freshness

The lock owns `sync_freshness_days`. A receipt may renew freshness only when its delta state is `NO_MATERIAL_DELTA` or `MATERIAL_DELTA_RECONCILED`.

`valid_through` must equal `performed_on + sync_freshness_days`. The Knowledge Steward cannot select an arbitrary expiration date.

## Snapshot identity

Public receipts record:

- stable source ID;
- opaque upstream page/object ID;
- observed last-edited/version timestamp.

They do not store private workspace URLs or copy the upstream knowledge corpus into Git.

## Receipt integrity

Receipts live under `docs/agent-system/governance-sync/receipts/` and are immutable historical records once committed. The active lock points to the latest receipt and stores its SHA-256.

`npm run check:governance-sync` fails when:

- the receipt is missing or its digest does not match the lock;
- the source set differs from the pinned lock;
- source snapshot identities are incomplete;
- a material delta is pending;
- freshness was renewed without reconciliation;
- `valid_through` is not derived from the fixed freshness policy;
- the receipt widens authority or contains private workspace URLs.

## Source-set rule

Recurring upstream sources should be stable cross-repository/global governance contracts. Mutable repository implementation plans and sync episode ledgers are historical evidence, not recurring supply dependencies, because including the sync plan itself would make synchronization self-invalidating.

## Authority boundary

A successful sync means only that the declared upstream sources were compared and the bounded repository governance snapshot was reconciled for the stated freshness interval. It does not authorize merge, release, deployment, capability widening, verifier changes, or global authority cutover.
