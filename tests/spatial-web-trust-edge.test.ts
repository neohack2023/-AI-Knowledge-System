import assert from "node:assert/strict";
import test from "node:test";

import {
  SPATIAL_WEB_MEMORY_DESTINATION,
  SPATIAL_WEB_SCOPE_KEY,
  type MasonPromotionReceipt,
  type ResearchIndexRecord,
  type SpatialMemoryCardRecord,
} from "../server/spatial-web/contracts.ts";
import {
  assembleSpatialWebPacketStrict,
  isAllowedSpatialReference,
  validateResearchIndexStrict,
  validateSpatialMemoryCardStrict,
} from "../server/spatial-web/strict-validator.ts";

const reviewTrigger = {
  trigger_type: "SOURCE_SUPERSEDED" as const,
  condition: "Re-evaluate when supporting evidence is superseded.",
  review_after: null,
};

const researchRecord = (): ResearchIndexRecord => ({
  research_id: "swr-trust-edge-fixture",
  title: "Trust edge fixture",
  research_track: "SECURITY_AND_PRIVACY",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  disclosure: {
    l0: "Validate strict reference schemes.",
    l1_ref: "fixture://trust-edge/l1",
    l2_refs: ["repo://trust-edge/evidence"],
  },
  source_refs: [{ source_system: "FIXTURE", source_id: "trust-edge-source", source_url: null }],
  review_triggers: [reviewTrigger],
  related_asset_refs: ["asset:trust-edge-model"],
  promotion_state: "NOT_EVALUATED",
  promoted_memory_id: null,
});

const memoryRecord = (): SpatialMemoryCardRecord => ({
  memory_id: "swm-trust-edge-fixture",
  title: "Trust edge promoted fixture",
  memory_class: "SECURITY_PRIVACY_RULE",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  authority_state: "AUTHORITATIVE",
  epistemic_type: "DURABLE_FACT",
  applicability: {
    engines: ["ExampleEngine"],
    backends: ["WebGPU-fixture"],
    project_classes: ["fixture"],
    trigger_conditions: ["A receipt-backed memory transition is requested."],
  },
  rule: {
    statement: "Resolve the exact requested receipt before promotion.",
    conditions: [],
    exceptions: [],
  },
  evidence_refs: ["research:swr-trust-edge-fixture"],
  confidence: 0.9,
  promotion_receipt_id: "mason-receipt:requested-001",
  promotion_receipt_binding: {
    mason_episode_id: "mason-episode:trust-edge-001",
    write_plan_id: "mason-write-plan:trust-edge-001",
    authorization_id: "mason-authorization:trust-edge-001",
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    destination: SPATIAL_WEB_MEMORY_DESTINATION,
    promotion_target_id: "swm-trust-edge-fixture",
    receipt_fingerprint: "sha256:trustedge001",
  },
  review_triggers: [reviewTrigger],
  l2_evidence_refs: ["research:swr-trust-edge-fixture"],
});

const mismatchedReceipt = (): MasonPromotionReceipt => ({
  receipt_id: "mason-receipt:different-999",
  verified: true,
  write_authorized: true,
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  destination: SPATIAL_WEB_MEMORY_DESTINATION,
  promotion_target_id: "swm-trust-edge-fixture",
  mason_episode_id: "mason-episode:trust-edge-001",
  write_plan_id: "mason-write-plan:trust-edge-001",
  authorization_id: "mason-authorization:trust-edge-001",
  receipt_fingerprint: "sha256:trustedge001",
  source_research_ids: ["swr-trust-edge-fixture"],
});

const errorCodes = (result: { errors: Array<{ code: string }> }) => result.errors.map((error) => error.code);

test("strict reference policy rejects arbitrary executable and local-file schemes", () => {
  assert.equal(isAllowedSpatialReference("javascript://alert/example"), false);
  assert.equal(isAllowedSpatialReference("file:///tmp/private.glb"), false);
  assert.equal(isAllowedSpatialReference("https://example.com/reference"), true);
  assert.equal(isAllowedSpatialReference("fixture://spatial/reference"), true);

  const record = researchRecord();
  record.related_asset_refs = ["javascript://alert/example"];
  const result = validateResearchIndexStrict(record);
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).includes("INVALID_REFERENCE"));
});

test("resolver cannot authorize with a different receipt than the requested ID", () => {
  const result = validateSpatialMemoryCardStrict(memoryRecord(), () => mismatchedReceipt());
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).includes("UNVERIFIED_MASON_PROMOTION_RECEIPT"));
  assert.ok(errorCodes(result).includes("UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION"));
});

test("strict packet assembly rejects disallowed evidence schemes", () => {
  const packet = assembleSpatialWebPacketStrict({
    scope_key: SPATIAL_WEB_SCOPE_KEY,
    project_scope: "project:trust-edge-fixture",
    application_class: "browser-spatial-fixture",
    l2_reasons: ["CLAIM_DISPUTED"],
    requested_evidence_refs: ["javascript://alert/example"],
  });

  assert.deepEqual(packet.opened_l2_evidence, []);
  assert.ok(packet.unresolved_conflicts.includes("INVALID_L2_REFERENCE_REJECTED"));
});
