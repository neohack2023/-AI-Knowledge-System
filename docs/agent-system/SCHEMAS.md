# Repository Agent-System Schemas

These schemas define repository-local records. Fields may be represented as Markdown front matter, YAML blocks, or equivalent structured sections, but the semantics must remain stable.

## Agent role contract

```yaml
role_id:
display_name:
purpose:
role_class:
applicable_scopes: []
positive_triggers: []
negative_triggers: []
required_inputs: []
required_outputs: []
read_boundary: []
write_boundary: []
authority_exclusions: []
required_evidence: []
handoff_targets: []
known_failure_modes: []
```

Law: `ROLE PROFILE ≠ AUTHORITY`.

## Command contract

```yaml
command_id:
intent:
primary_role:
preconditions: []
required_context: []
procedure: []
outputs: []
mutation_class: READ_ONLY | BRANCH_WRITE | EVIDENCE_WRITE
terminal_authority: NONE | DECLARED_VERIFIER | HUMAN_OWNER
failure_stop: []
```

Commands do not inherit authority from their names.

## PR rule record

```yaml
rule_id:
scope:
status: PROMOTED_AREA | PROMOTED_COMMON
imperative:
rationale:
evidence_refs: []
regression_refs: []
supersedes: []
last_reviewed:
```

Only compact adjudicated rules belong in `pr-rules/**`.

## Anti-pattern candidate

```yaml
anti_pattern_id:
domain:
source_pr:
source_review_or_thread:
source_head:
observed_behavior:
why_it_looked_reasonable:
actual_failure:
detection_method:
repair_pattern:
regression_guard:
evidence_state: CANDIDATE | CONFIRMED | VALIDATED_LOCAL
promotion_state: NONE | PROMOTED_AREA | PROMOTED_COMMON
rule_targets: []
recurrence_count:
supersedes: []
```

A candidate can guide investigation before promotion, but it is not automatically always-loaded law.

## Feature dossier

```yaml
feature_id:
state:
concern:
risk_tier:
source_intent_summary:
external_governance_refs: []   # opaque public-safe IDs only; never private workspace URLs
repository:
base_ref:
base_sha:
branch:
pr_number:
touched_areas: []
non_goals: []
assigned_roles: []
decisions: []
review_evidence: []
repair_rounds: []
verifier_evidence: []
anti_pattern_candidates: []
terminal_disposition:
promotion_refs: []
```

`current_head_sha` is deliberately **not** a required tracked field. A file cannot reliably contain the SHA of the commit that contains that same file. Resolve current candidate identity live from GitHub and store immutable historical reviewed/verified heads in evidence rows.

## Review evidence row

```yaml
review_id:
head_sha:
review_kind: FULL | SCOPED_REPAIR | OTHER
reviewer_class: MODEL_ADVISORY | HUMAN_GOVERNED | OTHER
findings: []
disposition:
```

Review identity, review currency, and review class are separate facts.

## Verifier evidence row

```yaml
verifier_id:
verifier_authority_class:
head_or_artifact_identity:
run_id:
obligations_checked: []
result: PASS | FAIL | PARTIAL
receipt_ref:
```

A PASS closes only the obligations the declared verifier is authorized to close.
