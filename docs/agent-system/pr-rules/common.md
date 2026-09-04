# Common Promoted PR Rules

These are compact human-promoted rules intended for repeated repository review. Detailed incident history stays in `../anti-patterns/candidates/`.

## `PR-COMMON-001` — Bind trust-bearing evidence to identity

Evidence is valid only for the exact candidate/artifact/transition it names. If candidate identity changes, treat head-bound evidence as stale unless the governing contract mechanically proves transferability.

Sources: PR #67, PR #68.  
Candidates: `../anti-patterns/candidates/PR-67.md`, `../anti-patterns/candidates/PR-68.md`.

## `PR-COMMON-002` — Review identity and review class are separate

A review being current does not prove it has the required depth/class. Check both reviewed identity and required review kind.

Source: PR #67.

## `PR-COMMON-003` — Resolved threads are not a fresh review

Thread resolution closes known discussions. It does not prove the changed current candidate has no additional defects.

Source: PR #67.

## `PR-COMMON-004` — Green CI is not merge authorization

Mechanical PASS, review disposition, merge eligibility, and owner authorization are separate capabilities.

Source: PR #67.

## `PR-COMMON-005` — Local/sandbox success is not repository state

Verify the authoritative branch/PR head before consuming delegated local results as current repository evidence.

Source: earlier code-reuse harvest; reinforced by PR #67–#69 workflow.

## `PR-COMMON-006` — Breakers terminate loops; they do not bypass blockers

When the configured repair budget is exhausted and a blocking finding remains, stop for adjudication. Do not silently create another repair round and do not merge through the breaker.

Source: PR #67.

## `PR-COMMON-007` — Reviewer suggestions do not self-promote

A review may suggest a reusable lesson. Promotion into always-loaded PR rules requires explicit human/knowledge-steward adjudication.

Source: repository agent-system bootstrap.
