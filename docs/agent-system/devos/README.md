# Portable DevOS Generalization

Status: `AIOS_DEVOS_GENERALIZATION_01 / CANDIDATE IMPLEMENTATION`

This surface generalizes the proven repository-self-sufficiency pattern and the newer Project Orath DevOS learning/research loop into a repository-adaptive compiler. It is a compiler template, not a filesystem copier.

## Objective

For repository-facing engineering, normal cognition should begin inside the repository. External memory remains useful for durable cross-project context and governance, but it should not be a mandatory translation hop before ordinary implementation work.

```text
repo task
  ↓
resolve live repository
  ↓
DevOS / equivalent repo OS present?
  ├─ yes → reuse it
  └─ no  → compile the smallest non-destructive scaffold
  ↓
repository-local context + code + tests + CI
  ↓
knowledge sufficient?
  ├─ yes → implement / evaluate
  └─ no
      ↓
  bounded upstream memory when a declared trigger applies
      ↓ still insufficient or stale
  bounded live public research
      ↓
  candidate approach
      ↓
  repository evaluation
      ↓
  success → semantic/procedural knowledge
  failure → negative knowledge / anti-pattern
      ↓
  broader promotion only through governed review
```

## Compiler

Use:

```bash
node scripts/agent-system/devos-compiler.mjs --root /path/to/repository
```

Plan-only is the default. To create missing scaffold files:

```bash
node scripts/agent-system/devos-compiler.mjs --root /path/to/repository --apply
```

The compiler never overwrites an existing file. If `devos/`, `.devos/`, or a coherent `docs/agent-system/` operating layer already exists, it returns a reuse/no-op disposition instead of installing a second authority-shaped system.

## Minimal bootstrap

A repository that lacks an operating layer may receive only:

```text
AGENTS.md                    # only when absent
devos/
├── README.md
├── project.json
├── adaptation-profile.json
├── research-policy.json
├── knowledge/
│   └── README.md
├── anti-patterns/
│   └── README.md
└── receipts/
    └── README.md
```

This is intentionally smaller than mature reference implementations. SQLite, specialist agents, extra skills, branch registries, detailed evaluation machinery, and additional governance surfaces are added only when repository evidence justifies them.

## Research preflight

Every compiled profile carries a bounded research-preflight contract. Research may be warranted for:

- external uncertainty;
- a blocker outside the repository;
- a demonstrated capability gap;
- stale evidence;
- a consequential weak comparison;
- a design dead-end;
- feature incubation;
- a relevant opportunity window.

Primary documentation, standards, source repositories, release notes, first-party/peer-reviewed research, maintainer engineering notes, and reproducible benchmarks are preferred as factual evidence. Community discussion, postmortems, talks, and analogues may inspire candidates but do not prove correctness.

Research remains `authority_effect = NONE` and `promotion_state = CANDIDATE_ONLY` until repository evaluation and the target repository's normal governed path admit it.

## Applied learning

Bootstrap knowledge uses explicit maturity states:

```text
OBSERVED
RESEARCH_SUPPORTED
LOCALLY_VALIDATED
REPEATED
REUSABLE_CANDIDATE
DEPRECATED
```

Representations remain distinct:

- `EPISODIC` — what happened in one execution;
- `SEMANTIC` — a supported lesson;
- `PROCEDURAL` — an executable/retrievable workflow;
- `NEGATIVE` — a known failure mode or rejected strategy.

A successful implementation does not automatically become a reusable rule. A failure does not become global policy merely because it repeated. Where risk warrants it, promotion should require evidence stronger than the examples that generated the candidate, such as held-out transfer, regression coverage, adversarial checks, or a real-work canary.

## Authority boundary

- Live Git repository state owns repository execution facts.
- DevOS is repository-local cognition, routing, evidence, and learning projection.
- Declared external memory/governance remains upstream when the target repository says so.
- Research, repetition, persistence, indexing, model confidence, and source count never upgrade authority by themselves.
- The compiler does not copy private external-memory corpora into repositories.

## Runtime database rule

The compiler does not install SQLite by default. Greenfield/emerging repositories defer it. Established repositories receive `OPTIONAL_AFTER_MEASURED_NEED`. A runtime database becomes justified when local task/evidence/learning state needs queryable persistence, not merely because a mature reference implementation has one.

## Acceptance for this slice

`AIOS_DEVOS_GENERALIZATION_01` is acceptable when:

1. greenfield repositories compile a minimal local-first scaffold;
2. existing DevOS/repo-OS surfaces are reused rather than duplicated;
3. apply is non-destructive and idempotent;
4. research preflight is bounded and authority-neutral;
5. negative knowledge is first-class;
6. SQLite is not forced onto small repositories;
7. unit tests cover the compiler decisions;
8. normal repository work remains external-fetch-free by default.
