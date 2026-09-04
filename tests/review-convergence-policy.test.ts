import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReviewConvergence, type ReviewConvergenceInput } from "../server/coding-harness/review-convergence.ts";

function base(overrides: Partial<ReviewConvergenceInput> = {}): ReviewConvergenceInput {
  return {
    riskTier: "STANDARD",
    hardGateState: "PASS",
    fullReviewCompleted: true,
    currentHeadReviewed: true,
    latestReviewKind: "FULL",
    headChangedSinceFullReview: false,
    repairOnlyDelta: false,
    scopeExpanded: false,
    repairRounds: 0,
    findings: [],
    ownerMergeAuthorized: true,
    ...overrides,
  };
}

test("hard task-native failure blocks regardless of advisory review", () => {
  assert.equal(evaluateReviewConvergence(base({ hardGateState: "FAIL" })).decision, "BLOCKED_HARD_GATE");
});

test("standard-risk change gets one initial broad review", () => {
  const result = evaluateReviewConvergence(base({ fullReviewCompleted: false, currentHeadReviewed: false, latestReviewKind: "NONE" }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(result.reviewScope, "FULL");
});

test("confirmed in-scope P2 requires repair within budget", () => {
  const result = evaluateReviewConvergence(base({ findings: [{ id: "F-1", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "REPAIR_REQUIRED");
});

test("bounded repair delta requires scoped rereview, not full-review reset", () => {
  const result = evaluateReviewConvergence(base({ headChangedSinceFullReview: true, repairOnlyDelta: true, currentHeadReviewed: false, latestReviewKind: "FULL", repairRounds: 1 }));
  assert.equal(result.decision, "REQUIRE_SCOPED_REREVIEW");
  assert.equal(result.reviewScope, "SCOPED_REPAIR");
});

test("clean scoped repair review preserves earlier broad review evidence", () => {
  const result = evaluateReviewConvergence(base({ headChangedSinceFullReview: true, repairOnlyDelta: true, currentHeadReviewed: true, latestReviewKind: "SCOPED_REPAIR", repairRounds: 1 }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
});

test("out-of-scope advisory is deferred instead of widening the PR", () => {
  const result = evaluateReviewConvergence(base({ findings: [{ id: "F-2", severity: "P2", scope: "OUT_OF_SCOPE", findingClass: "MAINTAINABILITY", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "MERGE_ELIGIBLE");
  assert.deepEqual(result.deferredFindingIds, ["F-2"]);
});

test("critical authority/security findings stay blocking even when labeled out-of-scope", () => {
  const result = evaluateReviewConvergence(base({ findings: [{ id: "F-3", severity: "P2", scope: "OUT_OF_SCOPE", findingClass: "AUTHORITY", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "REPAIR_REQUIRED");
});

test("repair breaker stops non-convergent review loops", () => {
  const result = evaluateReviewConvergence(base({ repairRounds: 2, findings: [{ id: "F-4", severity: "P2", scope: "IN_SCOPE", findingClass: "CORRECTNESS", confirmed: true, resolved: false }] }));
  assert.equal(result.decision, "ADJUDICATE_STOP");
});

test("scope expansion invalidates scoped-review inheritance", () => {
  const result = evaluateReviewConvergence(base({ scopeExpanded: true, headChangedSinceFullReview: true, repairOnlyDelta: true, latestReviewKind: "SCOPED_REPAIR" }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
});

test("owner merge authorization remains separate from verification", () => {
  const result = evaluateReviewConvergence(base({ ownerMergeAuthorized: false }));
  assert.equal(result.decision, "OWNER_AUTHORIZATION_REQUIRED");
});

test("sensitive head changes retain full-review strictness but remain breaker-bounded", () => {
  const result = evaluateReviewConvergence(base({ riskTier: "SENSITIVE", headChangedSinceFullReview: true, repairOnlyDelta: true, currentHeadReviewed: false, latestReviewKind: "SCOPED_REPAIR", repairRounds: 1 }));
  assert.equal(result.decision, "REQUIRE_FULL_REVIEW");
  assert.equal(result.repairRoundLimit, 3);
});
