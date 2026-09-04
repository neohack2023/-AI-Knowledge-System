# Anti-Pattern Knowledge

This surface stores detailed negative knowledge discovered through repository work. It is deliberately separate from always-loaded PR rules.

## Two-axis lifecycle

Evidence maturity and rule promotion are independent facts. Never replace one with the other.

```text
EVIDENCE STATE
CANDIDATE
→ CONFIRMED
→ VALIDATED_LOCAL
→ SUPERSEDED / DEPRECATED when later evidence replaces the lesson

PROMOTION STATE
NONE
→ PROMOTED_AREA
→ PROMOTED_COMMON when broader adjudication is justified
```

A candidate can therefore be `VALIDATED_LOCAL + NONE`, `VALIDATED_LOCAL + PROMOTED_AREA`, or `VALIDATED_LOCAL + PROMOTED_COMMON`. Promotion does not erase how strong the evidence is, and stronger evidence does not automatically promote a rule.

## Capture law

A useful anti-pattern records:

- what happened;
- why the wrong behavior looked reasonable;
- the actual failure mechanism;
- how it was detected;
- the smallest repair pattern;
- the regression/process guard;
- immutable source evidence;
- evidence state and promotion state separately.

## Source-binding law

Every confirmed or promoted candidate must carry at least one immutable source edge sufficient to re-audit the lesson. Prefer exact candidate head plus the most specific available review/thread/comment, CI run, regression, or process observation. A bare PR number or branch label is navigation, not provenance.

## Promotion law

- Reviewers may suggest candidates but may not promote their own suggestions.
- Promotion requires explicit human/knowledge-steward adjudication.
- Promote the **smallest generalized imperative**, not the whole incident narrative.
- Keep detailed source history here and link promoted rules back to it.
- Cross-area/common promotion should prefer recurrence or unusually strong invariant-level evidence.
- Duplicate lessons should add evidence edges to an existing candidate when practical instead of creating near-identical rules.

## Context-budget rule

`pr-rules/**` is repeatedly loadable compact memory. `anti-patterns/candidates/**` is deeper forensic memory and should be retrieved only when relevant.
