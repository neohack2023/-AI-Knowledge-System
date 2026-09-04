# Repository Documentation Map

Use this index to load the smallest relevant documentation set for the task. Do not treat every document in `docs/` as required context.

## Repository orientation and self-sufficiency

- `agent-system/context/README.md` — default semantic orientation packet for normal repository work.
- `agent-system/context/REPOSITORY_HANDOFF.md` — current semantic phase and next repository actions; resolve mutable branch/PR/CI facts live from GitHub.
- `agent-system/context/AUTHORITY_MAP.md` — source-of-truth routing.
- `agent-system/context/GOVERNANCE_BUNDLE.md` + `governance-lock.yaml` — vendored public-safe execution rules and upstream-sync boundary.
- `agent-system/knowledge/KNOWLEDGE_INDEX.md` — smallest-relevant repository knowledge router.

Normal repository work should use these checked-in surfaces before external workspace retrieval. External Notion/Drive reads are escalation/synchronization paths, not the default bootstrap.

## Verification and acceptance

- `VERIFIER_OWNED_ACCEPTANCE_RUNTIME.md` — verifier authority classes, exact artifact/head binding, obligation-local PASS semantics, and fail-closed acceptance behavior.
- `CONTEXT_PACKET_BINDING_STRENGTH.md` — context binding strength and evidence expectations.
- `CONTEXT_PROVENANCE_KERNEL_INTEGRATION.md` — provenance integration at the context/runtime boundary.
- `EPISTEMIC_PROVENANCE_CLASSIFICATION.md` — repository-owned epistemic/provenance classifications.

For edits under `server/coding-harness/**`, also read `../server/coding-harness/AGENTS.md`.

## Public release and contribution boundary

- `PUBLIC_RELEASE_BOUNDARY.md` — allowlist-first public release policy, private-binding exclusions, content scanning, binary admission, and CI/private-check separation.
- `PUBLIC_GATE_FOUNDATION_01.md` — public-gate foundation contract.
- `PUBLIC_CONTRIBUTOR_SCHEMA_01.md` — public contributor schema and contribution-facing data boundary.
- `SYNTHETIC_FIXTURE_POLICY.md` — rules for public synthetic fixtures.

Always inspect `../public-release-manifest.yaml` before adding a new tracked path. Unknown paths fail closed.

## Capability/runtime materialization

- `CAPABILITY_DISCOVERY_MATERIALIZATION.md` — capability discovery and materialization behavior.

## Repository agent operating system

- `agent-system/README.md` — repository-local agent roles, commands, review-rule routing, anti-pattern learning, feature dossiers, decisions/plans, local context, and authority boundaries.
- Load this surface for feature planning, repository-aware review, verification handoff, lesson harvesting, or changes to the repository's agent organization.
- The local governance bundle is sufficient for normal repository execution but does not silently replace global/cross-repo AIOS authority.

## Plans

- `plans/` contains bounded task plans. Plans are task-specific execution context, not automatically permanent architecture or canon.
- `agent-system/exec-plans/` defines the repository execution-plan contract/template.
- Read only the plan that matches the active task.

## Decisions

- `agent-system/decisions/` contains repository-local durable decision records and the ADR template.

## Fixtures and labs

- `fixtures/` contains repository test/documentation fixtures.
- `gog-2d-to-3d-lab-v0-1.md` is a bounded lab document and should not be treated as global repository policy.

## Documentation authority rule

Repository docs describe the public implementation and its operating contracts. They are not permission to import private workspace data, external provider bindings, personal memory, or private execution evidence into Git.

For normal repository work, use the checked-in vendored execution contract. If an explicit upstream synchronization trigger or unresolved authority conflict appears, surface it and route to the Knowledge Steward / owner rather than making every agent fetch external memory preemptively.

If two repository docs appear to conflict, prefer the more specific current contract for the affected subsystem, then surface the conflict rather than silently choosing a weaker rule.
