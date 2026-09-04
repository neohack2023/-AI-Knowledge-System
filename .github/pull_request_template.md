## Objective

<!-- One coherent concern. What changes, and why? -->

## Scope

- In scope:
- Non-goals:

## Candidate identity

- Base branch / SHA:
- Candidate head SHA:
- Changed paths:

## Risk classification

- Declared tier: `LOW | STANDARD | SENSITIVE`
- Risk evidence is bound to candidate head: `YES | NO | N/A`
- Sensitive boundary involved: `AUTHORITY | SECURITY | DATA_LOSS | CONTRACT | NONE`
- Rationale:

> Do not carry a prior head's risk classification forward without current binding or a contractually monotonic effective-risk derivation.

## Verification

- Local/targeted commands actually run:
  - [ ] `npm run lint` when applicable
  - [ ] `npm test` when applicable
  - [ ] `npm run check:public-release`
- Exact-head CI run:
- Exact-head CodingHarness receipt/artifact:
- Required mechanical obligations still open:

## Review state

- Required review class: `FULL | SCOPED_REPAIR | N/A`
- Reviewed head SHA:
- FULL-review evidence head SHA, if required:
- Confirmed blocking findings remaining:
- Non-critical out-of-scope follow-ups:

## Repair convergence

- Repair round: `0 / configured max`
- Repair-only/scope classification bound to base→head: `YES | NO | N/A`
- Breaker state: `OPEN | EXHAUSTED | N/A`
- If exhausted with a blocking finding: `ADJUDICATE_STOP` recorded: `YES | NO | N/A`

> Do not create an automatic repair round beyond the configured breaker.

## Public-release safety

- [ ] New tracked paths are classified by `public-release-manifest.yaml`.
- [ ] No private workspace links, owner-specific bindings, credentials, personal memory, or private execution receipts were added.
- [ ] Public examples/fixtures are synthetic where applicable.

## Owner authorization

- Owner-authorized head SHA: `PENDING`
- Merge authorized: `NO` by default

Passing tests, current review, or merge eligibility do not by themselves authorize merge, deployment, release, capability widening, or authority changes.

## Handoff notes

- Known risks:
- Rollback/recovery:
- Follow-up work: