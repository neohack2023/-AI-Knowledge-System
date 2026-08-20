import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CanonicalProjectionAdapterInputError,
  adaptHandoffProjection,
  adaptInterfaceProjection,
  adaptLedgerProjection,
  adaptRegistryProjection,
  adaptRuntimeProjection,
  adaptScopeRegistryProjection,
  canonicalProjectionAdapterIds,
  type HandoffObservation,
  type InterfaceObservation,
  type LedgerObservation,
  type ProjectionObservationBase,
  type RegistryObservation,
  type RuntimeObservation,
  type ScopeRegistryObservation,
} from "../shared/canonical-state-adapters.ts";

const baseObservation = (overrides: Partial<ProjectionObservationBase> = {}): ProjectionObservationBase => ({
  source_system: "Notion",
  source_id: "projection:fixture",
  source_version: "v-current",
  source_fingerprint: "sha256:fixture",
  provenance_envelope_id: "prov-fixture-001",
  missing_provenance_reason: null,
  authority_owner: "AIOS",
  authority_domain: "fixture-domain",
  authority_state: "authoritative",
  freshness_anchor: "2026-08-20T22:15:00Z",
  supersedes: null,
  source_available: true,
  freshness_proven: true,
  observed_claims: {},
  ...overrides,
});

const healthyScope = (): ScopeRegistryObservation => ({
  ...baseObservation({ source_id: "scope:global-working-memory", authority_domain: "scope-resolution" }),
  requested_scope_key: "global-working-memory",
  canonical_scope_key: "global-working-memory",
  alias_target_scope_key: "global-working-memory",
  expected_alias_target_scope_key: "global-working-memory",
  source_binding_digest: "binding-v1",
  expected_source_binding_digest: "binding-v1",
  forbidden_roots_observed: [],
  competing_canonical_scope_keys: ["global-working-memory"],
});

const healthyHandoff = (): HandoffObservation => ({
  ...baseObservation({ source_id: "handoff:global-working-memory", authority_domain: "project-current-state" }),
  stored_repository_head_sha: "9e65443ec649b798158b2c75bc32331a83b36ccc",
  live_repository_head_sha: "9e65443ec649b798158b2c75bc32331a83b36ccc",
  handoff_property_state_id: "state-20260820-01",
  current_state_block_state_id: "state-20260820-01",
  supersession_required: false,
  supersession_anchor: null,
  historical_state_presented_as_current: false,
});

const healthyRuntime = (): RuntimeObservation => ({
  ...baseObservation({
    source_system: "Google_Drive",
    source_id: "runtime:global-working-memory",
    authority_domain: "runtime-control-plane",
    authority_state: "shadow",
  }),
  runtime_artifact_present: true,
  runtime_schema_version: "runtime-v0.1",
  expected_runtime_schema_version: "runtime-v0.1",
  runtime_revision: "rev-42",
  current_runtime_anchor: "rev-42",
  shadow_claims_project_memory_authority: false,
});

const healthyLedger = (): LedgerObservation => ({
  ...baseObservation({
    source_system: "Google_Drive",
    source_id: "ledger:mason",
    authority_domain: "execution-ledger",
    authority_state: "authoritative",
  }),
  missing_execution_ids: [],
  duplicate_machine_ids: [],
  ambiguous_human_labels: [],
  declared_complete_history: false,
  coverage_is_partial: true,
  receipt_link_mismatches: [],
});

const healthyInterface = (): InterfaceObservation => ({
  ...baseObservation({ source_id: "interface:cockpit", authority_domain: "interface-registry" }),
  declared_mode: "LIVE",
  implementation_mode: "LIVE",
  deployment_version: "v4",
  current_deployment_version: "v4",
  declared_surface_state: "implemented",
  evidence_surface_state: "implemented",
  declared_mutation_capability: "READ_ONLY",
  evidence_mutation_capability: "READ_ONLY",
  declared_authority_claim: "repository-execution-truth-only",
  evidence_authority_claim: "repository-execution-truth-only",
});

const healthyRegistry = (): RegistryObservation => ({
  ...baseObservation({ source_id: "registry:capability-workflow", authority_domain: "capability-workflow-registry" }),
  capability_status: "Review",
  workflow_capability_status: "Review",
  capability_version: "0.1-review",
  workflow_capability_version: "0.1-review",
  capability_reference_present: true,
  capability_reference_eligible: true,
  declared_write_authorization: "NONE",
  workflow_write_authorization: "NONE",
  declared_approval_required: true,
  workflow_approval_required: true,
  registered_execution_state: "REVIEW_READY",
  verified_execution_state: "REVIEW_READY",
});

test("B01.2 all six adapters emit the normalized projection shape with stable adapter IDs", () => {
  const projections = [
    adaptScopeRegistryProjection(healthyScope()),
    adaptHandoffProjection(healthyHandoff()),
    adaptRuntimeProjection(healthyRuntime()),
    adaptLedgerProjection(healthyLedger()),
    adaptInterfaceProjection(healthyInterface()),
    adaptRegistryProjection(healthyRegistry()),
  ];

  assert.deepEqual(projections.map((item) => item.projection_class), ["scope", "handoff", "runtime", "ledger", "interface", "registry"]);
  assert.deepEqual(projections.map((item) => item.adapter_id), Object.values(canonicalProjectionAdapterIds));
  assert.ok(projections.every((item) => item.status === "FRESH"));
  assert.ok(projections.every((item) => item.reason_codes.length === 0));
});

test("B01.2 A1 blocks sibling leakage and competing scope identities", () => {
  const input = healthyScope();
  input.forbidden_roots_observed = ["udio-algorithms"];
  input.competing_canonical_scope_keys = ["global-working-memory", "udio-algorithms"];

  const projection = adaptScopeRegistryProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, ["SIBLING_SCOPE_LEAK", "SCOPE_AMBIGUOUS"]);
});

test("B01.2 A1 detects alias and source-binding drift without changing scope identity", () => {
  const input = healthyScope();
  input.alias_target_scope_key = "github:neohack2023/Looper";
  input.source_binding_digest = "binding-stale";

  const projection = adaptScopeRegistryProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, ["ALIAS_TARGET_DRIFT", "SOURCE_BINDING_DRIFT"]);
});

test("B01.2 A2 turns the observed stale handoff repository SHA into explicit HANDOFF_STALE", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fixture = JSON.parse(fs.readFileSync(
    path.join(here, "fixtures", "canonical-state-reconciliation", "handoff-stale-observation.json"),
    "utf8",
  )) as HandoffObservation;

  const projection = adaptHandoffProjection(fixture);
  assert.equal(projection.status, "STALE");
  assert.deepEqual(projection.reason_codes, ["HANDOFF_STALE"]);
  assert.equal(projection.observed_claims.repository_projection_stale, true);
  assert.equal(projection.observed_claims.stored_repository_head_sha, "f63c79434e6010782960eea33b391fb3138c6906");
  assert.equal(projection.observed_claims.live_repository_head_sha, "9e65443ec649b798158b2c75bc32331a83b36ccc");
});

test("B01.2 A2 escalates property, supersession, or historical-current conflicts to DRIFTED", () => {
  const input = healthyHandoff();
  input.handoff_property_state_id = "properties-old";
  input.supersession_required = true;
  input.supersession_anchor = null;
  input.historical_state_presented_as_current = true;

  const projection = adaptHandoffProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, [
    "HANDOFF_PROPERTY_DRIFT",
    "SUPERSESSION_MISSING",
    "HISTORICAL_STATE_PROMOTED",
  ]);
});

test("B01.2 A3 preserves Drive shadow authority and blocks project-memory overreach", () => {
  const input = healthyRuntime();
  input.shadow_claims_project_memory_authority = true;

  const projection = adaptRuntimeProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, ["SHADOW_AUTHORITY_OVERREACH"]);
});

test("B01.2 A4 detects coverage overclaim, duplicate IDs, ambiguous labels, gaps, and receipt drift deterministically", () => {
  const input = healthyLedger();
  input.missing_execution_ids = ["exec-044"];
  input.duplicate_machine_ids = ["exec-057"];
  input.ambiguous_human_labels = ["Episode 039"];
  input.declared_complete_history = true;
  input.receipt_link_mismatches = ["exec-052"];

  const projection = adaptLedgerProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, [
    "LEDGER_GAP",
    "LEDGER_DUPLICATE_ID",
    "LEDGER_KEY_AMBIGUITY",
    "LEDGER_COVERAGE_OVERCLAIM",
    "RECEIPT_LINK_DRIFT",
  ]);
});

test("B01.2 A5 detects LIVE/SIMULATION mismatch and unsupported implementation claims", () => {
  const input = healthyInterface();
  input.declared_mode = "LIVE";
  input.implementation_mode = "SIMULATION";
  input.declared_surface_state = "implemented";
  input.evidence_surface_state = "design_only";

  const projection = adaptInterfaceProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, ["INTERFACE_MODE_DRIFT", "INTERFACE_IMPLEMENTATION_OVERCLAIM"]);
});

test("B01.2 A6 detects registry status, version, capability, authority, and execution drift", () => {
  const input = healthyRegistry();
  input.workflow_capability_status = "Active";
  input.workflow_capability_version = "0.2-active";
  input.capability_reference_eligible = false;
  input.workflow_write_authorization = "WRITE";
  input.workflow_approval_required = false;
  input.verified_execution_state = "REVIEW_ONLY";

  const projection = adaptRegistryProjection(input);
  assert.equal(projection.status, "DRIFTED");
  assert.deepEqual(projection.reason_codes, [
    "REGISTRY_STATUS_DRIFT",
    "REGISTRY_VERSION_DRIFT",
    "CAPABILITY_REFERENCE_MISSING",
    "REGISTRY_AUTHORITY_MISMATCH",
    "REGISTRY_EXECUTION_DRIFT",
  ]);
});

test("B01.2 provenance and freshness admission gates outrank optimistic source claims", () => {
  const noProvenance = healthyScope();
  noProvenance.provenance_envelope_id = null;
  noProvenance.missing_provenance_reason = "fixture intentionally omits provenance";
  assert.deepEqual(adaptScopeRegistryProjection(noProvenance).reason_codes, ["PROVENANCE_MISSING"]);
  assert.equal(adaptScopeRegistryProjection(noProvenance).status, "UNKNOWN");

  const freshnessUnknown = healthyHandoff();
  freshnessUnknown.freshness_proven = false;
  assert.deepEqual(adaptHandoffProjection(freshnessUnknown).reason_codes, ["FRESHNESS_UNPROVEN"]);
  assert.equal(adaptHandoffProjection(freshnessUnknown).status, "UNKNOWN");
});

test("B01.2 source unavailability fails closed and records explicit missing provenance text", () => {
  const input = healthyRuntime();
  input.source_available = false;
  input.provenance_envelope_id = null;
  input.missing_provenance_reason = "runtime provider unavailable";

  const projection = adaptRuntimeProjection(input);
  assert.equal(projection.status, "UNAVAILABLE");
  assert.deepEqual(projection.reason_codes, ["SOURCE_UNAVAILABLE"]);
  assert.equal(projection.missing_provenance_reason, "runtime provider unavailable");
});

test("B01.2 adapters are read-only and do not mutate observation input", () => {
  const input = healthyScope();
  const before = structuredClone(input);
  adaptScopeRegistryProjection(input);
  assert.deepEqual(input, before);
});

test("B01.2 malformed adapter input fails with one stable error code", () => {
  const input = healthyScope() as unknown as Record<string, unknown>;
  input.freshness_anchor = "";

  assert.throws(
    () => adaptScopeRegistryProjection(input as unknown as ScopeRegistryObservation),
    (error) => {
      assert.ok(error instanceof CanonicalProjectionAdapterInputError);
      assert.equal(error.code, "CANONICAL_PROJECTION_ADAPTER_INPUT_INVALID");
      assert.match(error.message, /freshness_anchor is required/);
      return true;
    },
  );
});
