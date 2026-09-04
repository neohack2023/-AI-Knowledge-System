---
name: review-pr
description: Perform a bounded, read-only review of a repository candidate or pull request against current repository rules. Use for code review, documentation/governance review, repair re-review, or exact-head advisory assessment.
---

# Review PR

Use this skill for read-only candidate review. The historical command name is `review-pr`, but the procedure may review an ordinary PR candidate or an explicitly authorized direct-main staging commit.

## Authority boundary

- `READ_ONLY`.
- Findings are `MODEL_ADVISORY` unless a stronger declared verifier contract says otherwise.
- Do not edit the candidate, resolve a defect by mutation, promote a lesson, merge, release, or grant terminal acceptance.
- Multiple agreeing model reviews do not upgrade advisory authority.

## Resolve the candidate

1. Resolve live repository state.
2. For a PR, record base ref/SHA, candidate head SHA, changed paths, and review class required by current repository law.
3. For explicitly authorized direct-main staging, record the exact commit/range being reviewed and the owner-authorized exception that made direct-main delivery valid.
4. Never reuse a prior review disposition across a changed candidate unless the governing contract explicitly proves transferability.

## Context load

Read only the relevant packet:

1. `AGENTS.md` and the local context bundle;
2. applicable nested `AGENTS.md` / path-specific instructions;
3. `docs/agent-system/pr-rules/common.md`;
4. the smallest touched-area PR-rule file;
5. active feature dossier / execution plan when present;
6. detailed anti-pattern candidates only when a promoted rule, touched path, or current failure points to them.

## Procedure

1. Compute/retrieve the exact candidate diff against the declared base or parent.
2. Check instruction and authority consistency before style concerns.
3. Review for concrete correctness, trust-binding, security, data loss, contract violations, liveness, stale-state reuse, release-boundary violations, and verification gaps.
4. Distinguish **review freshness** from **review depth/class**.
5. Bind every blocking/repair finding to the exact reviewed candidate.
6. Do not re-raise a prior-head finding merely because it existed historically; confirm the current candidate still reproduces it.
7. Batch related in-scope findings when practical.
8. Separate out-of-scope observations from blocking in-scope findings.
9. Identify what was actually verified by existing mechanical evidence and what remains only advisory inspection.
10. Suggest negative-knowledge candidates separately. Do not create or promote them while acting as Reviewer.

## Output contract

Return exactly these sections when practical:

- **Reviewed identity**
- **Summary**
- **Blocking**
- **Should fix**
- **Nice to have**
- **Verified**
- **Review class / freshness**
- **Lesson candidates**
- **Terminal authority statement**

For each finding include severity, affected path/contract, failure mechanism, and the smallest credible repair direction. Do not fabricate line numbers or evidence.

## Stop conditions

Stop or mark the review incomplete when:

- exact candidate identity is unavailable;
- the diff cannot be resolved;
- required touched-area instructions are unavailable or contradictory;
- repository context declares an unresolved authority conflict;
- the requested review would require mutation to complete.
