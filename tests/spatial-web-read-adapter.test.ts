import assert from "node:assert/strict";
import test from "node:test";

import {
  SPATIAL_WEB_MEMORY_DESTINATION,
  SPATIAL_WEB_SCOPE_KEY,
  type EngineProfileRecord,
  type ExperimentRecord,
  type MasonPromotionReceipt,
  type ResearchIndexRecord,
  type SpatialMemoryCardRecord,
} from "../server/spatial-web/contracts.ts";
import {
  spatialReadOperations,
  SpatialReadAdapterContractError,
  type ReadSourceEnvelope,
  type SpatialAdapterSnapshot,
  type SpatialReadAdapterDescriptor,
  type SpatialReadRecordKind,
} from "../server/spatial-web/read-adapter-contracts.ts";
import { SpatialReadValidationService } from "../server/spatial-web/read-service.ts";
import { ImmutableSpatialSnapshotReadAdapter } from "../server/spatial-web/snapshot-read-adapter.ts";

const fingerprint = `sha256:${"a".repeat(64)}`;
const receiptFingerprint = `sha256:${"b".repeat(64)}`;
const capturedAt = "2026-08-02T05:15:00Z";

const descriptor = (): SpatialReadAdapterDescriptor => ({
  adapter_id: "spatial-read:foundation-03-fixture",
  adapter_version: "0.3.0",
  mode: "IMMUTABLE_SNAPSHOT",
  transport: "PROCESS_LOCAL",
  operations: [...spatialReadOperations],
  source_systems: ["FIXTURE"],
  side_effects: false,
  network_access: false,
  mutation_access: false,
  promotion_access: false,
  execution_access: false,
  secret_access: false,
});

const trigger = {
  trigger_type: "SOURCE_SUPERSEDED" as const,
  condition: "Re-evaluate when the supporting source is superseded.",
  review_after: null,
};

const researchRecord = (): ResearchIndexRecord => ({
  research_id: "swr-read-adapter-fixture",
  title: "Read adapter fixture",
  summary: "Synthetic research record for the immutable read boundary.",
  research_track: "SECURITY_AND_PRIVACY",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  applicable_project_scopes: ["project:spatial-read-fixture"],
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  disclosure: {
    l0: "Use immutable source envelopes for read-only retrieval.",
    l1_ref: "fixture://foundation-03/research/l1",
    l2_refs: ["repo://foundation-03/research/evidence"],
  },
  source_refs: [{
    source_system: "FIXTURE",
    source_id: "foundation-03-source",
    source_version: "0.3.0",
    source_fingerprint: fingerprint,
    source_url: null,
    retrieved_at: capturedAt,
  }],
  review_triggers: [trigger],
  related_asset_refs: ["asset:foundation-03-fixture"],
  promotion_state: "NOT_EVALUATED",
  promoted_memory_id: null,
});

const engineProfile = (): EngineProfileRecord => ({
  profile_id: "swep-read-adapter-engine",
  engine_name: "ReadAdapterEngine",
  engine_version_range: "0.3.x-fixture",
  profile_version: "0.3.0",
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  stack_type: "ENGINE",
  capability_claims: [{
    claim: "Provides a synthetic engine record for adapter tests.",
    evidence_state: "UNVERIFIED",
    evidence_refs: ["fixture://foundation-03/engine/claim"],
  }],
  compatibility: {
    rendering_backends: ["WebGPU-fixture"],
    browser_targets: ["ExampleBrowser"],
    device_classes: ["desktop-fixture"],
    fallbacks: ["WebGL2-fixture"],
    known_constraints: ["Synthetic fixture only."],
  },
  selection_signals: {
    favorable_when: ["The test requests the registered fixture engine."],
    unfavorable_when: ["Project scope is unresolved."],
    requires_project_decision: true,
  },
  evidence_refs: ["fixture://foundation-03/engine/profile"],
  review_triggers: [trigger],
  global_preferred: false,
});

const experimentRecord = (): ExperimentRecord => ({
  experiment_id: "swx-read-adapter-fixture",
  hypothesis: "Immutable retrieval preserves the registered experiment record.",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  project_scope: "project:spatial-read-fixture",
  execution_mode: "SIMULATION",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "ACTION_RESULT",
  environment: {
    timestamp: capturedAt,
    browser: "ExampleBrowser",
    browser_version: "100-fixture",
    operating_system: "ExampleOS",
    device_class: "desktop-fixture",
    gpu: "ExampleGPU",
    driver: "fixture-driver",
    backend: "WebGPU-fixture",
    engine: "ReadAdapterEngine",
    engine_version: "0.3.0-fixture",
    application_commit: "fixture-commit",
  },
  controlled_inputs: { fixture: true },
  procedure: ["Read the immutable experiment envelope."],
  observations: [{
    metric_or_event: "record_preserved",
    value: true,
    unit: null,
    epistemic_type: "VERIFICATION",
  }],
  outcome: "SUPPORTED",
  limitations: ["Synthetic fixture only."],
  artifact_refs: ["execution:foundation-03-fixture"],
  execution_receipt_id: "execution:receipt:foundation-03-fixture",
  follow_up: [],
  promotion_state: "NOT_EVALUATED",
});

const masonReceipt = (): MasonPromotionReceipt => ({
  receipt_id: "mason-receipt:foundation-03-fixture",
  verified: true,
  write_authorized: true,
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  destination: SPATIAL_WEB_MEMORY_DESTINATION,
  promotion_target_id: "swm-read-adapter-fixture",
  mason_episode_id: "mason-episode:foundation-03-fixture",
  write_plan_id: "mason-write-plan:foundation-03-fixture",
  authorization_id: "mason-authorization:foundation-03-fixture",
  receipt_fingerprint: receiptFingerprint,
  source_research_ids: ["swr-read-adapter-fixture"],
});

const memoryCandidate = (): SpatialMemoryCardRecord => ({
  memory_id: "swm-read-adapter-fixture",
  title: "Read adapter fixture memory",
  memory_class: "SECURITY_PRIVACY_RULE",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  authority_state: "AUTHORITATIVE",
  epistemic_type: "DURABLE_FACT",
  applicability: {
    engines: ["ReadAdapterEngine"],
    backends: ["WebGPU-fixture"],
    project_classes: ["fixture"],
    trigger_conditions: ["A separately authorized promotion is under validation."],
    exclusions: [],
  },
  rule: {
    statement: "Resolve promotion evidence through an exact read-only receipt lookup.",
    conditions: ["The adapter returns the exact requested receipt."],
    exceptions: [],
    failure_symptoms: ["Receipt mismatch or missing record."],
    recommended_action: "Fail closed.",
  },
  evidence_refs: ["research:swr-read-adapter-fixture"],
  confidence: 0.9,
  promotion_receipt_id: "mason-receipt:foundation-03-fixture",
  promotion_receipt_binding: {
    mason_episode_id: "mason-episode:foundation-03-fixture",
    write_plan_id: "mason-write-plan:foundation-03-fixture",
    authorization_id: "mason-authorization:foundation-03-fixture",
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    destination: SPATIAL_WEB_MEMORY_DESTINATION,
    promotion_target_id: "swm-read-adapter-fixture",
    receipt_fingerprint: receiptFingerprint,
  },
  supersedes: null,
  review_triggers: [trigger],
  l0_summary: "Use exact read-only receipt resolution.",
  l1_operational_ref: "memory:spatial-web/read-adapter-fixture",
  l2_evidence_refs: ["research:swr-read-adapter-fixture"],
});

const envelope = <T>(
  recordKind: SpatialReadRecordKind,
  recordId: string,
  record: T,
  authorityState: "AUTHORITATIVE" | "NON_AUTHORITATIVE",
  epistemicType: "CLAIM" | "ACTION_RESULT" | "VERIFICATION",
): ReadSourceEnvelope<T> => ({
  record_kind: recordKind,
  record_id: recordId,
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  source_system: "FIXTURE",
  source_locator: `fixture://foundation-03/${recordId}`,
  source_version: "0.3.0",
  source_fingerprint: fingerprint,
  captured_at: capturedAt,
  immutable: true,
  authority_state: authorityState,
  epistemic_type: epistemicType,
  record,
});

const snapshot = (): SpatialAdapterSnapshot => ({
  descriptor: descriptor(),
  research_records: [envelope("RESEARCH_INDEX", "swr-read-adapter-fixture", researchRecord(), "NON_AUTHORITATIVE", "CLAIM")],
  engine_profiles: [envelope("ENGINE_PROFILE", "swep-read-adapter-engine", engineProfile(), "NON_AUTHORITATIVE", "CLAIM")],
  experiment_records: [envelope("EXPERIMENT_RECORD", "swx-read-adapter-fixture", experimentRecord(), "NON_AUTHORITATIVE", "ACTION_RESULT")],
  mason_receipts: [envelope("MASON_PROMOTION_RECEIPT", "mason-receipt:foundation-03-fixture", masonReceipt(), "AUTHORITATIVE", "VERIFICATION")],
});

test("snapshot adapter declares read-only capabilities and exposes no mutation methods", () => {
  const adapter = new ImmutableSpatialSnapshotReadAdapter(snapshot());
  assert.deepEqual(adapter.descriptor.operations, spatialReadOperations);
  assert.equal(adapter.descriptor.side_effects, false);
  assert.equal(adapter.descriptor.network_access, false);
  assert.equal(adapter.descriptor.mutation_access, false);
  assert.equal(adapter.descriptor.promotion_access, false);
  assert.equal(adapter.descriptor.execution_access, false);
  assert.equal(adapter.descriptor.secret_access, false);

  const surface = adapter as unknown as Record<string, unknown>;
  for (const method of ["write", "create", "update", "delete", "promote", "execute", "refresh", "connect"]) {
    assert.equal(method in surface, false);
  }
});

test("constructor clones and freezes snapshot records", async () => {
  const source = snapshot();
  const adapter = new ImmutableSpatialSnapshotReadAdapter(source);
  source.research_records[0].record.title = "Mutated outside adapter";

  const result = await adapter.readResearchById("swr-read-adapter-fixture");
  assert.equal(result.status, "FOUND");
  if (result.status !== "FOUND") return;
  assert.equal(result.envelope.record.title, "Read adapter fixture");
  assert.equal(Object.isFrozen(result.envelope), true);
  assert.equal(Object.isFrozen(result.envelope.record), true);
  assert.throws(() => {
    result.envelope.record.title = "Mutation attempt";
  }, TypeError);
});

test("missing records return an explicit NOT_FOUND state", async () => {
  const adapter = new ImmutableSpatialSnapshotReadAdapter(snapshot());
  const result = await adapter.readResearchById("swr-does-not-exist");
  assert.deepEqual(result, {
    status: "NOT_FOUND",
    requested_id: "swr-does-not-exist",
    record_kind: "RESEARCH_INDEX",
  });
});

test("validation service rejects a valid record requested under the wrong scope", async () => {
  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(snapshot()));
  const result = await service.readValidatedResearch("swr-read-adapter-fixture", "udio-algorithms");
  assert.equal(result.status, "REJECTED");
  if (result.status !== "REJECTED") return;
  assert.ok(result.issues.some((entry) => entry.code === "ENVELOPE_SCOPE_MISMATCH"));
});

test("validation service rejects retrieved records that fail strict validation", async () => {
  const source = snapshot();
  const invalidResearch = researchRecord();
  invalidResearch.authority_state = "AUTHORITATIVE";
  source.research_records = [envelope("RESEARCH_INDEX", invalidResearch.research_id, invalidResearch, "AUTHORITATIVE", "CLAIM")];

  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(source));
  const result = await service.readValidatedResearch(invalidResearch.research_id, SPATIAL_WEB_SCOPE_KEY);
  assert.equal(result.status, "REJECTED");
  if (result.status !== "REJECTED") return;
  assert.ok(result.issues.some((entry) => entry.code === "RECORD_VALIDATION_FAILED"));
});

test("memory candidate validation uses the exact retrieved receipt only", async () => {
  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(snapshot()));
  const valid = await service.validateMemoryCandidate(memoryCandidate());
  assert.equal(valid.valid, true);

  const wrongId = memoryCandidate();
  wrongId.promotion_receipt_id = "mason-receipt:missing";
  const rejected = await service.validateMemoryCandidate(wrongId);
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some((entry) => entry.code === "UNVERIFIED_MASON_PROMOTION_RECEIPT"));
});

test("validated packet assembly uses only records that passed retrieval and strict validation", async () => {
  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(snapshot()));
  const result = await service.assembleValidatedPacket({
    packet_request: {
      scope_key: SPATIAL_WEB_SCOPE_KEY,
      project_scope: "project:spatial-read-fixture",
      application_class: "browser-spatial-fixture",
      named_technologies: ["ReadAdapterEngine", "WebGPU"],
      signals: ["WEBGPU", "PERFORMANCE"],
    },
    research_ids: ["swr-read-adapter-fixture"],
    engine_profile_ids: ["swep-read-adapter-engine"],
    experiment_ids: ["swx-read-adapter-fixture"],
  });

  assert.equal(result.status, "VALIDATED");
  if (result.status !== "VALIDATED") return;
  assert.equal(result.research_records.length, 1);
  assert.equal(result.engine_profiles.length, 1);
  assert.equal(result.experiment_records.length, 1);
  assert.ok(result.packet.selected_l1_records.includes("engine-profile:swep-read-adapter-engine"));
  assert.match(result.packet.packet_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("duplicate IDs and forbidden capabilities fail at adapter construction", () => {
  const duplicate = snapshot();
  duplicate.research_records = [...duplicate.research_records, duplicate.research_records[0]];
  assert.throws(
    () => new ImmutableSpatialSnapshotReadAdapter(duplicate),
    (error: unknown) => error instanceof SpatialReadAdapterContractError && error.code === "DUPLICATE_RECORD_ID",
  );

  const networked = snapshot();
  networked.descriptor = {
    ...networked.descriptor,
    network_access: true as false,
  };
  assert.throws(
    () => new ImmutableSpatialSnapshotReadAdapter(networked),
    (error: unknown) => error instanceof SpatialReadAdapterContractError && error.code === "FORBIDDEN_ADAPTER_CAPABILITY",
  );
});
