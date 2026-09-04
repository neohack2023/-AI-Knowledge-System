# Agent-System Authority Boundaries

## Separation of duties

- Coordinator routes; it does not accept or merge.
- Planner plans; it does not approve implementation.
- Implementer mutates the authorized branch; it does not approve its own work.
- Reviewer stays advisory/read-only for the artifact under review.
- Verifier closes only declared mechanical/executable obligations.
- Knowledge Steward records/promotes lessons only through explicit adjudication.
- Release Steward assembles readiness evidence; eligibility is not authorization.
- Human/owner authorization remains distinct where the governing workflow requires it.

## Non-escalation laws

- `ROLE PROFILE ≠ AUTHORITY`.
- `CONSENSUS ≠ PERMISSION`.
- Multiple advisory reviewers do not become a mechanical verifier by agreement.
- A verifier PASS does not grant merge/release authority.
- A breaker stops automatic looping; it does not waive blocking findings.
- A repository doc cannot import private external authority merely by referencing its existence.

## Trust-bearing identity

Keep separate when freshness matters:

- candidate head/artifact identity;
- mechanical/verifier evidence identity;
- review identity and review class;
- base→head transition classification;
- risk assessment identity or monotonic risk lineage;
- owner authorization identity.

## Public-repository boundary

Use public repository facts, synthetic fixtures, and repository-safe opaque external IDs. Never commit secrets, private account IDs, private workspace URLs, personal memory, provider bindings, or raw private receipts.
