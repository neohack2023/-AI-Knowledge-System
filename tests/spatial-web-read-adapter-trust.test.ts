import assert from "node:assert/strict";
import test from "node:test";

import {
  SPATIAL_WEB_SCOPE_KEY,
  type ResearchIndexRecord,
} from "../server/spatial-web/contracts.ts";
import {
  spatialReadOperations,
  SpatialReadAdapterContractError,
  type ReadSourceEnvelope,
  type SpatialAdapterSnapshot,
} from "../server/spatial-web/read-adapter-contracts.ts";
import { SpatialReadValidationService } from "../server/spatial-web/read-service.ts";
import { ImmutableSpatialSnapshotReadAdapter } from "../server/spatial-web/snapshot-read-adapter.ts";

const fingerprint = `sha256:${"c".repeat(64)}`;

const research = (): ResearchIndexRecord => ({
  research_id: "swr-read-source-trust-fixture",
  title: "Declared source trust fixture",
  research_track: "SECURITY_AND_PRIVACY",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  lifecycle_state: "RESEARCH_PENDING",
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  disclosure: {
    l0: "Only declared source systems may populate the snapshot.",
    l1_ref: "fixture://foundation-03/trust/l1",
    l2_refs: ["repo://foundation-03/trust/evidence"],
  },
  source_refs: [{
    source_system: "FIXTURE",
    source_id: "foundation-03-trust-source",
    source_fingerprint: fingerprint,
    source_url: null,
    retrieved_at: "2026-08-02T05:18:00Z",
  }],
  review_triggers: [{
    trigger_type: "SOURCE_SUPERSEDED",
    condition: "Re-evaluate when the source changes.",
    review_after: null,
  }],
  related_asset_refs: [],
  promotion_state: "NOT_EVALUATED",
  promoted_memory_id: null,
});

const envelope = (sourceSystem = "FIXTURE"): ReadSourceEnvelope<ResearchIndexRecord> => ({
  record_kind: "RESEARCH_INDEX",
  record_id: "swr-read-source-trust-fixture",
  scope_key: SPATIAL_WEB_SCOPE_KEY,
  source_system: sourceSystem,
  source_locator: "fixture://foundation-03/trust/source",
  source_version: "0.3.0",
  source_fingerprint: fingerprint,
  captured_at: "2026-08-02T05:18:00Z",
  immutable: true,
  authority_state: "NON_AUTHORITATIVE",
  epistemic_type: "CLAIM",
  record: research(),
});

const snapshot = (researchEnvelope = envelope()): SpatialAdapterSnapshot => ({
  descriptor: {
    adapter_id: "spatial-read:foundation-03-trust-fixture",
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
  },
  research_records: [researchEnvelope],
  engine_profiles: [],
  experiment_records: [],
  mason_receipts: [],
});

test("snapshot rejects envelopes from undeclared source systems", () => {
  assert.throws(
    () => new ImmutableSpatialSnapshotReadAdapter(snapshot(envelope("UNDECLARED_PROVIDER"))),
    (error: unknown) => error instanceof SpatialReadAdapterContractError
      && error.code === "INVALID_ADAPTER_DESCRIPTOR",
  );
});

test("snapshot rejects envelope authority or epistemic metadata that conflicts with the record", () => {
  const mismatched = envelope();
  mismatched.authority_state = "AUTHORITATIVE";
  assert.throws(
    () => new ImmutableSpatialSnapshotReadAdapter(snapshot(mismatched)),
    (error: unknown) => error instanceof SpatialReadAdapterContractError
      && error.code === "ENVELOPE_KIND_MISMATCH",
  );
});

test("packet assembly rejects L2 references not reachable from validated records", async () => {
  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(snapshot()));
  const result = await service.assembleValidatedPacket({
    packet_request: {
      scope_key: SPATIAL_WEB_SCOPE_KEY,
      project_scope: "project:foundation-03-trust-fixture",
      application_class: "browser-spatial-fixture",
      l2_reasons: ["CLAIM_DISPUTED"],
      requested_evidence_refs: ["repo://unvalidated/evidence"],
    },
    research_ids: ["swr-read-source-trust-fixture"],
  });

  assert.equal(result.status, "REJECTED");
  if (result.status !== "REJECTED") return;
  assert.ok(result.issues.some((issue) => issue.code === "UNVALIDATED_EVIDENCE_REFERENCE"));
});

test("packet assembly opens validated L2 evidence from accepted records", async () => {
  const service = new SpatialReadValidationService(new ImmutableSpatialSnapshotReadAdapter(snapshot()));
  const result = await service.assembleValidatedPacket({
    packet_request: {
      scope_key: SPATIAL_WEB_SCOPE_KEY,
      project_scope: "project:foundation-03-trust-fixture",
      application_class: "browser-spatial-fixture",
      l2_reasons: ["CLAIM_DISPUTED"],
      requested_evidence_refs: ["repo://foundation-03/trust/evidence"],
    },
    research_ids: ["swr-read-source-trust-fixture"],
  });

  assert.equal(result.status, "VALIDATED");
  if (result.status !== "VALIDATED") return;
  assert.deepEqual(result.packet.opened_l2_evidence, ["repo://foundation-03/trust/evidence"]);
});
