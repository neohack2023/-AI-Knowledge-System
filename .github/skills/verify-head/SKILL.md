---
name: verify-head
description: Verify the exact current repository candidate with declared mechanical checks and produce obligation-local acceptance evidence. Use when asked to validate a PR head, direct-main staging commit, artifact, test gate, or verifier-owned acceptance obligation.
---

# Verify Head

Use this skill to produce mechanical evidence bound to the exact candidate or artifact actually checked.

## Authority boundary

- The Verifier owns only the declared acceptance obligation.
- Do not edit the candidate while verifying it.
- A PASS closes only the obligation the verifier is authorized to close.
- Verification does not grant merge, release, deployment, capability, or owner authorization.
- Model review is not a substitute for a declared mechanical verifier.

## Candidate identity

Resolve live state first:

- PR candidate: exact immutable PR head SHA plus base identity.
- Direct-main staging: exact commit SHA or explicit commit range authorized for verification.
- Artifact verification: artifact digest/version plus producing candidate when applicable.

A changed candidate makes prior head-bound evidence stale unless transferability is mechanically proven by the governing contract.

## Context load

Read:

1. `AGENTS.md` and applicable nested/path instructions;
2. `docs/VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md`;
3. active feature dossier / execution plan;
4. subsystem verifier contract, if any;
5. repository validation commands from `package.json` / existing workflow definitions rather than inventing commands.

## Procedure

1. State the exact identity being verified before running checks.
2. Enumerate the obligations to check and the verifier authority class for each.
3. Reject stale evidence, ambiguous merge-ref evidence, or evidence whose artifact/head identity does not match the candidate.
4. Run the smallest targeted checks that directly exercise the changed invariant.
5. Run broader repository validation when the plan/contract requires it.
6. Capture command/run identity, exact head/artifact, outcome, and any coverage limitation.
7. For CI/workflow evidence, inspect what the job actually checked out. Do not call a default merge ref an immutable candidate head.
8. Report `PASS`, `FAIL`, or `PARTIAL` per obligation.
9. On failure, identify whether the failure is candidate-caused, environment/infra-blocked, or evidence-identity-invalid when that distinction can be established.
10. Preserve previous evidence as history but never silently carry terminal effect to a changed candidate.

## Output contract

For each obligation report:

- verifier authority class;
- exact candidate/artifact identity;
- check/run/command identity;
- result: `PASS | FAIL | PARTIAL`;
- evidence pointer when available;
- coverage / limitation;
- terminal effect: the exact obligation this evidence may close.

Finish with:

- **Overall verifier state**
- **Stale evidence rejected**
- **Unverified obligations**
- **Authorization boundary**

## Stop conditions

Stop and return blocked/partial rather than guessing when:

- exact candidate identity cannot be resolved;
- the required verifier is unavailable;
- environment failure prevents the check;
- the task would require mutating the candidate to continue;
- evidence cannot be bound to the object it claims to verify.
