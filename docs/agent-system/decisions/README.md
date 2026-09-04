# Repository Decisions

This directory records durable repository-local architecture and operating decisions that future agents should be able to discover without external memory retrieval.

## Use a decision record when

- a material architectural choice has plausible alternatives;
- a repository operating rule changes;
- an interface or persistence contract changes;
- an authority/separation-of-duty decision affects repository work;
- a prior decision is superseded.

Do not create ADRs for routine implementation details already obvious from the code or PR.

## State

`PROPOSED → ACCEPTED → SUPERSEDED | DEPRECATED`

Acceptance of a decision record does not itself grant merge, release, capability, or global governance authority.

## Naming

`ADR-XXXX-short-title.md`

Use `ADR_TEMPLATE.md` for new records.

## Provenance

A decision record should point to repository-visible PRs/issues/commits where possible. Private upstream context must be summarized into public-safe rationale rather than linked directly.
