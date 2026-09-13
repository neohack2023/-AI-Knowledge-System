# Repository Agent-System Schemas

These schemas define repository-local records. Fields may be represented as Markdown front matter, YAML blocks, JSON, or equivalent structured sections, but the semantics must remain stable.

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

## DevOS repository inventory

```yaml
schema_name: DevOSRepositoryInventory
schema_version:
root:
top_level_entries: []
languages: []
package_manager:
architecture: SINGLE_ROOT | MONOREPO
maturity: GREENFIELD | EMERGING | ESTABLISHED
instruction_surfaces: []
devos_roots: []
repository_os_surface:
workflow_files: []
test_surfaces: []
verification_commands: {}
```

The inventory is descriptive evidence used by the compiler. It does not grant repository or external-memory authority.

## DevOS adaptation profile

```yaml
schema_name: DevOSAdaptationProfile
schema_version:
mode: BOOTSTRAP_REQUIRED | DEVOS_PRESENT | EQUIVALENT_REPO_OS_PRESENT
target_root:
repository_shape: {}
authority:
  live_repository_execution: GIT_REPOSITORY
  devos_role: REPOSITORY_LOCAL_COGNITION_AND_ROUTING_PROJECTION
  external_memory_role: UPSTREAM_DURABLE_MEMORY_OR_GOVERNANCE_WHEN_DECLARED
  research_authority_effect: NONE
retrieval_order: []
components:
  local_context_bundle:
  agent_router:
  research_preflight:
  negative_knowledge:
  applied_learning:
  runtime_database:
  repository_native_skills:
  upstream_sync:
research_triggers: []
learning_states: []
bootstrap_policy:
  overwrite_existing_files: false
  copy_external_memory_corpus: false
  research_auto_promotes: false
  negative_knowledge_auto_promotes: false
  normal_repo_work_external_fetch_required: false
```

The compiler must return reuse/no-op when a coherent repository operating layer already owns the function. The adaptation profile is a plan, not authority to mutate the target repository.

## DevOS research receipt

```yaml
research_id:
trigger_task_ids: []
trigger_signals: []
questions: []
queries: []
sources:
  - source_ref:
    source_class:
    published_or_updated:
    retrieved_on:
claims:
  - statement:
    source_refs: []
    confidence:
    fact_or_inference:
uncertainties: []
inspirations:
  - idea:
    source_refs: []
    analogy_boundary:
validation_refs: []
no_op_reason:
authority_effect: NONE
promotion_state: CANDIDATE_ONLY
```

Research can expand the candidate space. It cannot promote itself into repository law or external-memory canon.

## DevOS learning object

```yaml
learning_id:
representation: EPISODIC | SEMANTIC | PROCEDURAL | NEGATIVE
maturity: OBSERVED | RESEARCH_SUPPORTED | LOCALLY_VALIDATED | REPEATED | REUSABLE_CANDIDATE | DEPRECATED
scope:
statement:
evidence_refs: []
regression_refs: []
holdout_or_transfer_refs: []
known_failure_modes: []
promotion_state: NONE | LOCAL_RULE | BROADER_CANDIDATE
```

Learning maturity and authority/promotion are independent dimensions.

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
source_evidence:
  - kind: REVIEW_FINDING | CI_RUN | REGRESSION | PROCESS_OBSERVATION | COMMIT
    head_sha:
    review_id:
    thread_id:
    comment_id:
    run_id:
    artifact_ref:
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

`source_evidence` is an evidence-edge list, not a prose summary. Populate only fields that exist for that edge. Every `CONFIRMED` or `VALIDATED_LOCAL` record requires at least one immutable edge that identifies the exact head/artifact plus the most specific available review, thread, comment, CI run, regression, or process observation.

`evidence_state` and `promotion_state` are orthogonal. Promotion never overwrites evidence maturity, and evidence maturity never grants promotion automatically.

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
