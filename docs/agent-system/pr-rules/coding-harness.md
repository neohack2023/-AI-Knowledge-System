# Coding-Harness Promoted PR Rules

Load with `common.md` for changes affecting coding-harness review/acceptance semantics.

## `PR-HARNESS-001` — Bind delta classification to the transition

Repair-only and scope-expansion classification describes a specific `base → head` edge. Do not inherit it across a later candidate transition.

Source: PR #67.

## `PR-HARNESS-002` — Bind risk classification to the candidate or preserve monotonic risk

A stale lower risk tier must never carry forward and silently reduce current-head review requirements.

Source: PR #67 final blocking P1.

## `PR-HARNESS-003` — Preserve FULL-review evidence on an immutable head

A later narrower scoped review on the same immutable head must not erase the fact that a current FULL review exists for that head.

Source: PR #67.

## `PR-HARNESS-004` — Check review currency before inherited findings trigger repair

Do not let findings attached to stale review evidence create another automatic repair round before the current candidate has been reviewed at the required class.

Source: PR #67.

## `PR-HARNESS-005` — Sensitive/non-repair candidates require current FULL review

A scoped repair review is not sufficient for a new non-repair STANDARD candidate or a SENSITIVE candidate unless the governing contract explicitly says otherwise.

Source: PR #67.

## `PR-HARNESS-006` — Current FULL review can discharge prior scope-expansion obligation

Scope expansion should force a FULL review, but once that exact candidate has a current FULL review the obligation is satisfied rather than becoming permanently sticky.

Source: PR #67.
