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
import { assembleSpatialWebPacket } from "../server/spatial-web/packet-assembler.ts";
import {
  validateEngineProfile,
  validateExperimentRecord,
  validateResearchIndex,
  validateSpatialMemoryCard,
} from "../server/spatial-web/validator.ts";

const trigger = {
  trigger_type: "SOURCE_SUPERSEDED" as const,
  condition: "Re-evaluate when the supporting source is superseded.",
  review_after: null,
};

const researchRecord = (): ResearchIndexRecord => ({
  research_id: "swr-renderer-selection-fixture",
  title: "Renderer selection fixture",
  summary: "Synthetic research-only record.",
  research_track: "ENGINE_COMPARISONS",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  applicable_project_scopes: ["project:example-spatial-app"],
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  disclosure: {
    l0: "Compare eligible rendering stacks after classifying the application.",
    l1_ref: "fixture://spatial/research/l1",
    l2_refs: ["fixture://spatial/research/evidence-a"],
  },
  source_refs: [{
    source_system: "FIXTURE",
    source_id: "synthetic-source-a",
    source_version: "0.2.0",
    source_fingerprint: "sha256:fixture-source-a",
    source_url: null,
    retrieved_at: "2026-08-02T04:50:00Z",
  }],
  version_context: {
    engine: null,
    engine_version: null,
    browser: null,
    browser_version: null,
    web_api: null,
    web_api_version: null,
    backend: null,
  },
  review_triggers: [trigger],
  related_asset_refs: ["asset:synthetic-model-a"],
  promotion_state: "NOT_EVALUATED",
  promoted_memory_id: null,
});

const engineProfile = (): EngineProfileRecord => ({
  profile_id: "swep-example-engine",
  engine_name: "ExampleEngine",
  engine_version_range: "1.x-fixture",
  profile_version: "0.2.0",
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  stack_type: "ENGINE",
  capability_claims: [{
    claim: "Provides a synthetic renderer pathway.",
    evidence_state: "UNVERIFIED",
    evidence_refs: ["fixture://spatial/engine/claim-a"],
  }],
  compatibility: {
    rendering_backends: ["WebGL2-fixture"],
    browser_targets: ["ExampleBrowser"],
    device_classes: ["desktop-fixture"],
    fallbacks: [],
    known_constraints: ["Synthetic profile only."],
  },
  selection_signals: {
    favorable_when: ["Project requirements match the synthetic capabilities."],
    unfavorable_when: ["Project scope is unresolved."],
    requires_project_decision: true,
  },
  evidence_refs: ["fixture://spatial/engine/profile-source"],
  review_triggers: [trigger],
});

const experimentRecord = (): ExperimentRecord => ({
  experiment_id: "swx-frame-time-fixture",
  hypothesis: "A synthetic instancing setup reduces fixture draw submissions.",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  project_scope: "project:example-spatial-app",
  execution_mode: "SIMULATION",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "ACTION_RESULT",
  environment: {
    timestamp: "2026-08-02T04:50:00Z",
    browser: "ExampleBrowser",
    browser_version: "100.0-fixture",
    operating_system: "ExampleOS",
    device_class: "desktop-fixture",
    gpu: "ExampleGPU",
    driver: "fixture-driver",
    backend: "WebGL2-fixture",
    engine: "ExampleEngine",
    engine_version: "1.0.0-fixture",
    application_commit: "fixture-commit",
  },
  controlled_inputs: { scene_entities: 1000 },
  procedure: ["Run the deterministic synthetic scene."],
  observations: [{
    metric_or_event: "draw_submission_count",
    value: 10,
    unit: "fixture-count",
    epistemic_type: "ACTION_RESULT",
  }],
  outcome: "SUPPORTED",
  limitations: ["Synthetic fixture only."],
  artifact_refs: ["execution:synthetic-scene", "execution:synthetic-log"],
  execution_receipt_id: "execution:receipt:swx-frame-time-fixture",
  follow_up: ["Repeat through a separately authorized real experiment."],
  promotion_state: "NOT_EVALUATED",
});

const memoryRecord = (): SpatialMemoryCardRecord => ({
  memory_id: "swm-resource-lifecycle-fixture",
  title: "Synthetic GPU resource lifecycle rule",
  memory_class: "PERFORMANCE_DOCTRINE",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  authority_state: "AUTHORITATIVE",
  epistemic_type: "DURABLE_FACT",
  applicability: {
    engines: ["ExampleEngine"],
    backends: ["WebGL2-fixture"],
    project_classes: ["fixture"],
    trigger_conditions: ["A project replaces an owned scene branch."],
    exclusions: ["Shared resources still referenced elsewhere."],
  },
  rule: {
    statement: "Release application-owned GPU resources when their lifecycle ends.",
    conditions: ["Ownership is verified."],
    exceptions: ["The resource remains shared by an active scene."],
    failure_symptoms: ["Retained GPU memory after route replacement."],
    recommended_action: "Dispose only resources owned by the retiring lifecycle boundary.",
  },
  evidence_refs: ["research:swr-resource-lifecycle-fixture"],
  confidence: 0.9,
  promotion_receipt_id: "mason-receipt:spatial-web-fixture-001",
  promotion_receipt_binding: {
    mason_episode_id: "mason-episode:spatial-web-fixture-001",
    write_plan_id: "mason-write-plan:spatial-web-fixture-001",
    authorization_id: "mason-authorization:spatial-web-fixture-001",
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    destination: SPATIAL_WEB_MEMORY_DESTINATION,
    promotion_target_id: "swm-resource-lifecycle-fixture",
    receipt_fingerprint: "sha256:synthetic-mason-receipt",
  },
  supersedes: null,
  review_triggers: [trigger],
  l0_summary: "Release owned GPU resources at the end of their lifecycle.",
  l1_operational_ref: "memory:spatial-web/resource-lifecycle-fixture",
  l2_evidence_refs: ["research:swr-resource-lifecycle-fixture"],
});

const verifiedReceipt = (): MasonPromotionReceipt => ({
  receipt_id: "mason-receipt:spatial-web-fixture-001",
  verified: true,
  write_authorized: true,
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  destination: SPATIAL_WEB_MEMORY_DESTINATION,
  promotion_target_id: "swm-resource-lifecycle-fixture",
  mason_episode_id: "mason-episode:spatial-web-fixture-001",
  write_plan_id: "mason-write-plan:spatial-web-fixture-001",
  authorization_id: "mason-authorization:spatial-web-fixture-001",
  receipt_fingerprint: "sha256:synthetic-mason-receipt",
  source_research_ids: ["swr-resource-lifecycle-fixture"],
});

const codes = (result: { errors: Array<{ code: string }> }) => result.errors.map((entry) => entry.code);

test("positive research, engine, experiment, and independently verified memory fixtures pass", () => {
  assert.equal(validateResearchIndex(researchRecord()).valid, true);
  assert.equal(validateEngineProfile(engineProfile()).valid, true);
  assert.equal(validateExperimentRecord(experimentRecord()).valid, true);
  assert.equal(
    validateSpatialMemoryCard(memoryRecord(), (receiptId) => receiptId === verifiedReceipt().receipt_id ? verifiedReceipt() : null).valid,
    true,
  );
});

test("version-sensitive research fails closed without review triggers", () => {
  const record = researchRecord();
  record.version_context = {
    engine: "ExampleEngine",
    engine_version: "2.0.0-fixture",
    browser: "ExampleBrowser",
    browser_version: "101.0-fixture",
    web_api: "WebGPU",
    web_api_version: "fixture-snapshot",
    backend: "WebGPU-fixture",
  };
  record.review_triggers = [];

  const result = validateResearchIndex(record);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes("VERSIONED_CLAIM_REQUIRES_REVIEW_TRIGGER"));
});

test("reference fields reject data URIs, blob URLs, and raw base64 payloads", () => {
  const research = researchRecord();
  research.related_asset_refs = ["data:model/gltf-binary;base64,AAAA", "blob:https://example.invalid/id"];
  const researchResult = validateResearchIndex(research);
  assert.equal(researchResult.valid, false);
  assert.ok(codes(researchResult).includes("EMBEDDED_ASSET_FORBIDDEN"));

  const experiment = experimentRecord();
  experiment.artifact_refs = ["A".repeat(128)];
  const experimentResult = validateExperimentRecord(experiment);
  assert.equal(experimentResult.valid, false);
  assert.ok(codes(experimentResult).includes("EMBEDDED_ASSET_FORBIDDEN"));
});

test("empty promotion receipt fails with the registered transition codes", () => {
  const record = memoryRecord();
  record.promotion_receipt_id = "";
  const result = validateSpatialMemoryCard(record);

  assert.equal(result.valid, false);
  assert.ok(codes(result).includes("MISSING_MASON_PROMOTION_RECEIPT"));
  assert.ok(codes(result).includes("UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION"));
});

test("a fabricated receipt identifier cannot authorize promotion", () => {
  const result = validateSpatialMemoryCard(memoryRecord(), () => null);
  assert.equal(result.valid, false);
  assert.ok(codes(result).includes("UNVERIFIED_MASON_PROMOTION_RECEIPT"));
  assert.ok(codes(result).includes("UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION"));
});

test("packet assembly is deterministic across input ordering", () => {
  const first = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "browser-configurator",
    named_technologies: ["WebGPU", "ExampleEngine"],
    signals: ["PERFORMANCE", "WEBGPU"],
    l2_reasons: ["CLAIM_DISPUTED"],
    requested_evidence_refs: ["repo://example/evidence-b", "repo://example/evidence-a"],
    sibling_scope_candidates: ["project:udio-algorithms", "project:girls-of-gaming"],
    engine_profiles: [engineProfile()],
  });
  const second = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "browser-configurator",
    named_technologies: ["ExampleEngine", "WebGPU"],
    signals: ["WEBGPU", "PERFORMANCE"],
    l2_reasons: ["CLAIM_DISPUTED"],
    requested_evidence_refs: ["repo://example/evidence-a", "repo://example/evidence-b"],
    sibling_scope_candidates: ["project:girls-of-gaming", "project:udio-algorithms"],
    engine_profiles: [engineProfile()],
  });

  assert.deepEqual(first, second);
  assert.match(first.packet_fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("L0 to L1 to L2 expansion is monotonic and cannot change authority or scope", () => {
  const l0 = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "browser-configurator",
  });
  const l1 = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "browser-configurator",
    signals: ["PERFORMANCE"],
  });
  const l2 = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "browser-configurator",
    signals: ["PERFORMANCE"],
    l2_reasons: ["EXPERIMENT_REPRODUCTION"],
    requested_evidence_refs: ["execution:experiment:swx-frame-time-fixture"],
  });

  assert.equal(l0.disclosure_level, "L0");
  assert.equal(l1.disclosure_level, "L1");
  assert.equal(l2.disclosure_level, "L2");
  assert.deepEqual(l0.selected_l0_records, l1.selected_l0_records);
  assert.deepEqual(l1.selected_l0_records, l2.selected_l0_records);
  assert.deepEqual(l1.selected_l1_records, l2.selected_l1_records);
  assert.equal(l0.resolved_scope_key, l2.resolved_scope_key);
  assert.equal(l0.project_scope, l2.project_scope);
  assert.deepEqual(l0.authority_decisions, l1.authority_decisions);
  assert.deepEqual(l1.authority_decisions, l2.authority_decisions);
});

test("unrequested sibling scopes are rejected rather than injected", () => {
  const packet = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "spatial-observatory",
    sibling_scope_candidates: [
      "project:example-spatial-app",
      SPATIAL_WEB_SCOPE_KEY,
      "udio-algorithms",
      "girls-of-gaming",
    ],
  });

  assert.deepEqual(packet.rejected_sibling_scopes, ["girls-of-gaming", "udio-algorithms"]);
  assert.ok(packet.authority_decisions.includes("UNREQUESTED_SIBLING_SCOPES_REJECTED"));
});

test("L2 evidence does not open without an allowed expansion reason", () => {
  const packet = assembleSpatialWebPacket({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:example-spatial-app",
    application_class: "spatial-observatory",
    requested_evidence_refs: ["repo://example/evidence"],
  });

  assert.equal(packet.disclosure_level, "L0");
  assert.deepEqual(packet.opened_l2_evidence, []);
  assert.ok(packet.unresolved_conflicts.includes("L2_EVIDENCE_REQUEST_REQUIRES_ALLOWED_REASON"));
});
