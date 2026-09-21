import assert from "node:assert/strict";
import test from "node:test";
import {
  assessFailureLearningPromotion,
  buildFailureLearningPromotionEnvelope,
} from "../server/failure-learning/promotion.ts";

test("failure-learning promotion remains TRAINING before evidence is sufficient", () => {
  const result = assessFailureLearningPromotion({
    clean_evaluation_count: 1,
    positive_transfer_count: 0,
    neutral_transfer_count: 1,
    harmful_minor_count: 0,
    harmful_major_count: 0,
    unresolved_boundary_count: 0,
    replay_verified: true,
    mason_decision_id: null,
  });
  assert.equal(result.state, "TRAINING");
  assert.ok(result.reason_codes.includes("INSUFFICIENT_CLEAN_EVALUATIONS"));
  assert.ok(result.reason_codes.includes("MASON_DECISION_REQUIRED"));
  assert.equal(result.authority_effect, "NONE");
});

test("sufficient evidence can become PROMOTABLE but still has no write authority", () => {
  const result = assessFailureLearningPromotion({
    clean_evaluation_count: 4,
    positive_transfer_count: 3,
    neutral_transfer_count: 1,
    harmful_minor_count: 0,
    harmful_major_count: 0,
    unresolved_boundary_count: 0,
    replay_verified: true,
    mason_decision_id: "mason:test:01",
  });
  assert.equal(result.state, "PROMOTABLE");
  assert.deepEqual(result.reason_codes, []);
  assert.equal(result.authority_effect, "NONE");
});

test("promotion envelope is copy-only and carries no database write authority", () => {
  const result = buildFailureLearningPromotionEnvelope({
    promotion_id: "promotion:test:01",
    decision_id: "mason:test:01",
    source_pattern_ids: ["pattern:test:01"],
    source_database_head_digest: "sha256:source",
    evidence_digest: "sha256:evidence",
    scope: { repository: "example/repo" },
    knowledge: { mechanism: "EXAMPLE" },
    created_at: "2026-09-21T00:00:00Z",
  });
  assert.equal(result.source.database, "FAILURE_DB");
  assert.equal(result.target.database, "DB");
  assert.equal(result.target.materialization, "COPY_WITH_PROVENANCE");
  assert.equal(result.write_authority, "NONE");
});
