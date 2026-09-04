# Anti-Pattern Knowledge

This surface stores detailed negative knowledge discovered through repository work. It is deliberately separate from always-loaded PR rules.

## Lifecycle

```text
CANDIDATE
→ CONFIRMED
→ VALIDATED_LOCAL
→ PROMOTED_AREA or PROMOTED_COMMON
→ SUPERSEDED / DEPRECATED when later evidence replaces it
```

## Capture law

A useful anti-pattern records:

- what happened;
- why the wrong behavior looked reasonable;
- the actual failure mechanism;
- how it was detected;
- the smallest repair pattern;
- the regression/process guard;
- evidence and promotion state.

## Promotion law

- Reviewers may suggest candidates but may not promote their own suggestions.
- Promotion requires explicit human/knowledge-steward adjudication.
- Promote the **smallest generalized imperative**, not the whole incident narrative.
- Keep detailed source history here and link promoted rules back to it.
- Cross-area/common promotion should prefer recurrence or unusually strong invariant-level evidence.
- Duplicate lessons should add evidence edges to an existing candidate when practical instead of creating near-identical rules.

## Context-budget rule

`pr-rules/**` is repeatedly loadable compact memory. `anti-patterns/candidates/**` is deeper forensic memory and should be retrieved only when relevant.
