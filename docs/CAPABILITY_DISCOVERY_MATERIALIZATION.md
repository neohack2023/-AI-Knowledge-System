# Dynamic Capability Discovery + Materialization

Status: implementation foundation
Contract: `CapabilityDiscoveryEnvelope/1.0`
Scope: `global-working-memory`
Authority: GitHub owns live repository execution facts; Notion remains authoritative for migrated project memory

## Purpose

Implement dynamic capability discovery without turning discovery into a universal execution tool.

The runtime keeps a compact inventory of registered capability summaries. A request resolves against exact intent, scope, mode, authority domain, health, and boundary metadata. Full input/output schemas remain hidden until an eligible candidate is explicitly selected and materialized.

```text
intent + exact scope
  -> compact capability summaries
  -> deterministic policy evaluation
  -> eligible + rejected candidates
  -> explicit selection
  -> optional materialization-only approval
  -> registry snapshot freshness check
  -> health freshness check
  -> schema fingerprint verification
  -> exact schema packet
```

Discovery never executes the selected capability and never grants destination-write authority.

## Whole-system placement

This subsystem sits before the native `WorkflowExecutionKernel` execution boundary.

It does not replace:

- Project Scope Registry resolution
- source-authority resolution
- `WorkflowExecution` lifecycle truth
- `ContextProvenanceEnvelope/1.0`
- registry-backed next actions
- STONE candidate generation
- MASON authorization and promotion
- execution verification or receipts

The current implementation is process-local and read-only. A later execution bridge may bind a `discovery_id` to a `WorkflowExecution`, but it must use the existing kernel rather than create a second execution authority.

## Runtime truth source

`nativeRuntimeCapabilityRegistry` contains code-native capabilities that exist in the repository. It is a GitHub execution-truth surface, not a replacement for the authoritative Notion Capability Registry.

A later governed registry compiler should reconcile:

```text
Notion authoritative Capability Registry
  -> governed export / validation
  -> Drive runtime-control-plane snapshot
  -> typed GitHub runtime artifact
  -> registered executor availability
```

Until that adapter exists, the runtime must not claim that the full Notion registry has been synchronized.

## Capability definition

Every runtime definition declares:

- stable capability and workflow IDs
- version and active state
- positive and negative intent boundaries
- overlap group and deterministic precedence
- scope allowlist and denylist
- authority domains
- schema references and expected SHA-256 fingerprint
- executor reference
- trust, data access, reversibility, and blast radius
- autonomy and approval requirements
- supported execution modes
- health state, verification source, and optional expiry
- source authority

The GET `/api/capabilities` inventory returns summaries only. It intentionally omits executable schemas.

## Discovery contract

`POST /api/capabilities` with `action=discover` returns:

- exact scope and optional workflow/execution binding
- compact eligible candidates
- rejected candidates with machine-readable reasons
- recommended candidate only when the confidence margin is not ambiguous
- registry fingerprint and version
- observable discovery events

The registered `cap:capability-discovery` handler is the exact `api:/api/capabilities#discover` action. Its materialized input schema requires `action`, `scope_key`, `mode`, and `intent_class`. Its output schema matches the process-local route response:

```text
envelope
selection
materialized_capability
events
persistence
execution_authority
requested_by
```

A no-match result is successful read-only discovery. It must not invent a tool or silently widen scope.

## Selection and approval

Selection is separate from discovery.

A selection authorizes only schema materialization. It always carries:

```text
authorization_scope = MATERIALIZATION_ONLY
execution_authorized = false
destination_write_authorized = false
```

Capabilities may require an explicit approval before materialization. That approval still does not authorize capability execution.

## Materialization

Materialization requires a capability that was eligible in the referenced discovery and was selected or approved.

Discovery and materialization are bound to one immutable registry decision surface:

1. Discovery clones and sorts one registry snapshot.
2. Policy evaluation and `registry_fingerprint` are computed from that same snapshot.
3. Materialization clones one current registry snapshot.
4. The selected capability version, workflow ID, schema refs, and expected schema fingerprint must still match.
5. The full current registry fingerprint must still equal the discovery fingerprint.
6. Any mismatch fails closed and requires a new discovery.

This prevents a capability or policy definition from changing between selection and schema loading.

Health is evaluated at both boundaries. `status=VERIFIED` is insufficient when `health.expires_at` is non-null and has passed. Expired or invalid health attestations are ineligible during discovery and blocked again during materialization.

Before returning schemas, the runtime recomputes the SHA-256 fingerprint over:

- capability ID
- version
- input schema
- output schema

A mismatch fails closed with `CAPABILITY_SCHEMA_FINGERPRINT_MISMATCH`.

Additional fail-closed materialization errors include:

- `CAPABILITY_DEFINITION_CHANGED`
- `CAPABILITY_REGISTRY_CHANGED`
- `CAPABILITY_HEALTH_EXPIRED`
- `CAPABILITY_HEALTH_BLOCKED`

## Observability

The process-local snapshot records:

- `capability.discovery.started`
- `capability.candidate.returned`
- `capability.candidate.rejected`
- `capability.discovery.completed`
- `capability.selected`
- `capability.approval.required`
- `capability.approved`
- `capability.rejected`
- `capability.schema.requested`
- `capability.schema.loaded`

These are observable control decisions, not private chain-of-thought.

## Current boundary

Implemented now:

- code-native runtime capability definitions
- compact inventory
- deterministic intent/scope/authority/mode/health filtering
- time-aware health expiry enforcement
- overlap precedence support
- explicit candidate selection
- materialization-only approval semantics
- exact handler input/output schema contracts
- immutable registry snapshot binding between discovery and materialization
- just-in-time schema loading
- SHA-256 schema verification
- process-local event trace
- API and source-level fail-closed tests

Not implemented in this slice:

- live Notion Capability Registry adapter
- Drive compiled-registry publication
- external MCP/provider schema fetching
- durable discovery storage
- automatic capability execution
- cockpit renderer
- MASON or destination writes

Those remain separate bounded slices because discovery is not authorization and materialization is not execution.
