import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReviewConvergence, type ReviewConvergenceInput } from "../server/coding-harness/review-convergence.ts";

const H1 = "1111111111111111111111111111111111111111";
const H2 = "2222222222222222222222222222222222222222";
const H3 = "3333333333333333333333333333333333333333";

function base(overrides: Partial<ReviewConvergenceInput> = {}): ReviewConvergenceInput {
  return {
    riskTier: "STANDARD",
    candidateHeadSha: H1,
    hardGateState: "PASS",
    hardGateEvidenceHeadSha: H1,
    fullReviewHeadSha: H1,
    reviewedHeadSha: H1,
    latestReviewKind: "FULL",
    deltaClassificationBaseSha: H1,
    deltaClassificationHeadSha: H1,
    repairOnlyDelta: false,
    scopeExpanded: false,
    repairRounds: 0,
    findings: [],
    ownerAuthorizedHeadSha: H1,
    ...overrides,
  };
}

test("hard task-native failure blocks regardless of advisory review", () => {
  assert.equal(evaluateReviewConvergence(base({ hardGateState: "FAIL" })).decision, "BLOCKED_HARD_GATE");
});

test("stale hard-gate PASS is rejected when evidence head differs from candidate", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H1, reviewedHeadSha: H2, ownerAuthorizedHeadSha: H2 }));
  assert.equal(result.decision, "BLOCKED_HARD_GATE");
  assert.ok(result.reasonCodes.includes("HARD_GATE_EVIDENCE_STALE"));
});

test("standard-risk change gets one initial broad review", () => {
  const result = evaluateReviewConvergence(base({ fullReviewHeadSha: null, reviewedHeadSha: null, latestReviewKind: "NONE", deltaClassificationBaseSha: null, deltaClassificationHeadSha: null, ownerAuthorizedHeadSha: null }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(result.reviewScope, "FULL");
});

test("confirmed in-scope P2 requires repair within budget", () => {
  const result = evaluateReviewConvergence(base({ findings: [{ id: "F-1", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "REPAIR_REQUIRED");
});

test("repaired STANDARD head is reviewed before inherited findings drive another repair", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H1, deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, ownerAuthorizedHeadSha: null, repairOnlyDelta: true, repairRounds: 1, findings: [{ id: "F-1", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "REQUIRE_SCOPED_REREVIEW");
});

test("breaker is evaluated only after the current repaired head has been reviewed", () => {
  const stale = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H1, deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, ownerAuthorizedHeadSha: null, repairOnlyDelta: true, repairRounds: 2, findings: [{ id: "F-4", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(stale.decision, "REQUIRE_SCOPED_REREVIEW");
  const current = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, ownerAuthorizedHeadSha: null, repairOnlyDelta: true, repairRounds: 2, findings: [{ id: "F-4", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(current.decision, "ADJUDICATE_STOP");
});

test("clean scoped repair review preserves earlier broad review evidence", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: true, repairRounds: 1, ownerAuthorizedHeadSha: H2 }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
});

test("STANDARD non-repair head rejects scoped review and requires current full review", () => {
  const scoped = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: false, ownerAuthorizedHeadSha: H2 }));
  assert.equal(scoped.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(scoped.reviewScope, "FULL");
  assert.ok(scoped.reasonCodes.includes("HEAD_CHANGED_OUTSIDE_REPAIR_DELTA"));

  const full = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, fullReviewHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "FULL", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: false, ownerAuthorizedHeadSha: H2 }));
  assert.equal(full.decision, "MERGE_ELIGIBLE");
});

test("delta classification is bound to the exact retained full-review base and candidate head", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H3, hardGateEvidenceHeadSha: H3, reviewedHeadSha: H3, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: true, ownerAuthorizedHeadSha: H3 }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.ok(result.reasonCodes.includes("DELTA_CLASSIFICATION_STALE"));
});

test("current full review remains valid after a later scoped review on the same immutable head", () => {
  const result = evaluateReviewConvergence(base({ riskTier: "SENSITIVE", candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, fullReviewHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: true, ownerAuthorizedHeadSha: H2 }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
});

test("out-of-scope advisory is deferred instead of widening the PR", () => {
  const result = evaluateReviewConvergence(base({ findings: [{ id: "F-2", severity: "P2", scope: "OUT_OF_SCOPE", findingClass: "MAINTAINABILITY", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
  assert.deepEqual(result.deferredFindingIds, ["F-2"]);
});

test("critical authority finding stays blocking even when labeled out-of-scope", () => {
  const result = evaluateReviewConvergence(base({ riskTier: "SENSITIVE", findings: [{ id: "F-3", severity: "P2", scope: "OUT_OF_SCOPE", findingClass: "AUTHORITY", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "REPAIR_REQUIRED");
});

test("resolved critical finding elevates STANDARD repair to SENSITIVE full-review obligation", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "SCOPED_REPAIR", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: true, ownerAuthorizedHeadSha: H2, findings: [{ id: "F-C", severity: "P1", scope: "IN_SCOPE", findingClass: "AUTHORITY", confirmed: true, resolved: true }] }));
  assert.equal(result.effectiveRiskTier, "SENSITIVE");
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(result.repairRoundLimit, 3);
});

test("current full review discharges scope expansion", () => {
  const result = evaluateReviewConvergence(base({ scopeExpanded: true, reviewedHeadSha: H1, latestReviewKind: "FULL" }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
});

test("scope expansion without current full review requires one", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, scopeExpanded: true, deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, reviewedHeadSha: H1, ownerAuthorizedHeadSha: H2 }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.ok(result.reasonCodes.includes("SCOPE_EXPANDED_FULL_REVIEW_REQUIRED"));
});

test("owner merge authorization is bound to candidate head", () => {
  const result = evaluateReviewConvergence(base({ candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, fullReviewHeadSha: H2, reviewedHeadSha: H2, latestReviewKind: "FULL", deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, ownerAuthorizedHeadSha: H1 }));
  assert.equal(result.decision, "OWNER_AUTHORIZATION_REQUIRED");
  assert.ok(result.reasonCodes.includes("OWNER_AUTHORIZATION_STALE"));
});

test("sensitive head changes retain full-review strictness", () => {
  const result = evaluateReviewConvergence(base({ riskTier: "SENSITIVE", candidateHeadSha: H2, hardGateEvidenceHeadSha: H2, reviewedHeadSha: H1, deltaClassificationBaseSha: H1, deltaClassificationHeadSha: H2, repairOnlyDelta: true, ownerAuthorizedHeadSha: null, repairRounds: 1 }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(result.repairRoundLimit, 3);
});

test("malformed SHA inputs fail closed at the policy boundary", () => {
  assert.throws(() => evaluateReviewConvergence(base({ candidateHeadSha: "not-a-sha" })), /candidateHeadSha/);
});
