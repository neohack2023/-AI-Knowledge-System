---
name: prepare-release
description: Assemble release or merge-readiness evidence for the exact current repository candidate without performing the merge/release or converting evidence into authorization. Use for final handoff, release readiness, merge eligibility, or owner authorization packets.
---

# Prepare Release

Use this skill to assemble the evidence packet needed to decide whether a candidate is eligible for merge/release or requires adjudication.

## Authority boundary

- Evidence assembly is not authorization.
- `ELIGIBLE` does not mean `AUTHORIZED`.
- Do not merge, release, deploy, widen capability, mutate branch protections, or change authority while using this skill unless a separate explicit action authorization is present.
- Green CI or a clean model review never substitutes for exact owner/declared authorization when required.

## Resolve identity

Resolve live repository state and record:

- delivery mode: PR or explicitly authorized direct-main staging;
- base/parent identity;
- exact candidate head/commit;
- changed paths / coherent concern;
- risk classification bound to the current candidate;
- owner authorization identity/status when applicable.

## Context load

Read:

1. `AGENTS.md`;
2. `docs/agent-system/context/AUTHORITY_MAP.md`;
3. `docs/agent-system/context/governance-lock.yaml`;
4. active plan / feature dossier / decision record;
5. `docs/PUBLIC_RELEASE_BOUNDARY.md` and release manifest when public release is relevant;
6. applicable PR rules and verifier contracts;
7. current live GitHub reviews, CI/checks, and unresolved findings.

## Procedure

1. Confirm the candidate identity is current.
2. Confirm the concern/scope matches the declared plan and that no silent scope expansion occurred.
3. Confirm risk evidence is bound to the current candidate or derives from a valid monotonic risk rule.
4. Inspect mechanical evidence and reject stale or object-mismatched results.
5. Confirm required review class and reviewed identity. Separate review freshness from depth.
6. Check blocking findings and verify any claimed repairs belong to the current candidate.
7. Check repair-round and breaker state. Breaker exhaustion with a blocking finding yields adjudication, never an automatic bypass.
8. Check public-release validation / manifest implications when applicable.
9. Check rollback / recovery notes for material or sensitive changes.
10. Check owner/declared authorization when the terminal action requires it.
11. Return one status:
   - `ELIGIBLE`: evidence obligations appear satisfied, but terminal action may still require explicit authorization;
   - `BLOCKED`: a required obligation is unsatisfied or stale;
   - `ADJUDICATION_REQUIRED`: governance/breaker/authority conflict requires human resolution.

## Output contract

Return:

- **Candidate identity**
- **Scope / non-goals**
- **Risk + binding**
- **Mechanical evidence**
- **Review evidence**
- **Repair / breaker state**
- **Unresolved findings**
- **Public-release state**
- **Rollback / recovery**
- **Owner / terminal authorization state**
- **Disposition: ELIGIBLE | BLOCKED | ADJUDICATION_REQUIRED**
- **Next authorized action**

## Direct-main staging note

When the owner explicitly authorizes direct-main staging, do not invent a merge gate that no longer applies. Instead verify the exact resulting commit/range, record the scoped exception, and distinguish staging completion from later production/release authorization.

## Stop conditions

Stop and return `BLOCKED` or `ADJUDICATION_REQUIRED` when:

- candidate identity cannot be resolved;
- required evidence is stale or mismatched;
- review depth/freshness is insufficient;
- a blocking finding remains;
- breaker state requires adjudication;
- owner authorization is required but absent;
- public-release or authority boundaries are unresolved.
