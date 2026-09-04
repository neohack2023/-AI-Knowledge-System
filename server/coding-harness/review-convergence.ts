export type ReviewRiskTier = "LOW" | "STANDARD" | "SENSITIVE";
export type HardGateState = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN";
export type ReviewKind = "NONE" | "FULL" | "SCOPED_REPAIR";
export type FindingSeverity = "P0" | "P1" | "P2" | "P3";
export type FindingScope = "IN_SCOPE" | "OUT_OF_SCOPE";
export type FindingClass =
  | "AUTHORITY"
  | "SECURITY"
  | "DATA_LOSS"
  | "CONTRACT"
  | "CORRECTNESS"
  | "PORTABILITY"
  | "MAINTAINABILITY";

export interface AdvisoryFinding {
  id: string;
  severity: FindingSeverity;
  scope: FindingScope;
  findingClass: FindingClass;
  confirmed: boolean;
  resolved: boolean;
}

export interface ReviewConvergenceInput {
  riskTier: ReviewRiskTier;
  candidateHeadSha: string;
  hardGateState: HardGateState;
  hardGateEvidenceHeadSha: string | null;
  fullReviewHeadSha: string | null;
  reviewedHeadSha: string | null;
  latestReviewKind: ReviewKind;
  deltaClassificationBaseSha: string | null;
  deltaClassificationHeadSha: string | null;
  repairOnlyDelta: boolean;
  scopeExpanded: boolean;
  repairRounds: number;
  maxRepairRounds?: number;
  findings: AdvisoryFinding[];
  ownerAuthorizedHeadSha: string | null;
}

export type ReviewConvergenceDecision =
  | "BLOCKED_HARD_GATE"
  | "REQUIRE_FULL_REVIEW"
  | "REPAIR_REQUIRED"
  | "REQUIRE_SCOPED_REREVIEW"
  | "ADJUDICATE_STOP"
  | "OWNER_AUTHORIZATION_REQUIRED"
  | "MERGE_ELIGIBLE";

export interface ReviewConvergenceResult {
  decision: ReviewConvergenceDecision;
  reviewScope: ReviewKind;
  effectiveRiskTier: ReviewRiskTier;
  blockingFindingIds: string[];
  deferredFindingIds: string[];
  reasonCodes: string[];
  repairRoundLimit: number;
}

const DEFAULT_REPAIR_LIMIT: Record<ReviewRiskTier, number> = {
  LOW: 1,
  STANDARD: 2,
  SENSITIVE: 3,
};

const CRITICAL_CLASSES = new Set<FindingClass>([
  "AUTHORITY",
  "SECURITY",
  "DATA_LOSS",
  "CONTRACT",
]);

const gitSha = /^[0-9a-f]{40}$/i;

function requireSha(value: string | null, field: string, allowNull: boolean): void {
  if (value === null && allowNull) return;
  if (typeof value !== "string" || !gitSha.test(value)) {
    throw new TypeError(`${field} must be ${allowNull ? "null or " : ""}an exact 40-character Git SHA`);
  }
}

function isBlockingFinding(finding: AdvisoryFinding): boolean {
  if (!finding.confirmed || finding.resolved) return false;
  if (CRITICAL_CLASSES.has(finding.findingClass)) return true;
  if (finding.scope === "OUT_OF_SCOPE") return false;
  return finding.severity === "P0" || finding.severity === "P1" || finding.severity === "P2";
}

function isDeferredFinding(finding: AdvisoryFinding): boolean {
  if (!finding.confirmed || finding.resolved) return false;
  if (isBlockingFinding(finding)) return false;
  return finding.scope === "OUT_OF_SCOPE" || finding.severity === "P3";
}

function effectiveRiskTier(input: ReviewConvergenceInput): ReviewRiskTier {
  if (input.riskTier === "SENSITIVE") return "SENSITIVE";
  if (input.findings.some((finding) => finding.confirmed && CRITICAL_CLASSES.has(finding.findingClass))) {
    return "SENSITIVE";
  }
  return input.riskTier;
}

export function evaluateReviewConvergence(input: ReviewConvergenceInput): ReviewConvergenceResult {
  requireSha(input.candidateHeadSha, "candidateHeadSha", false);
  requireSha(input.hardGateEvidenceHeadSha, "hardGateEvidenceHeadSha", true);
  requireSha(input.fullReviewHeadSha, "fullReviewHeadSha", true);
  requireSha(input.reviewedHeadSha, "reviewedHeadSha", true);
  requireSha(input.deltaClassificationBaseSha, "deltaClassificationBaseSha", true);
  requireSha(input.deltaClassificationHeadSha, "deltaClassificationHeadSha", true);
  requireSha(input.ownerAuthorizedHeadSha, "ownerAuthorizedHeadSha", true);

  if (!Number.isInteger(input.repairRounds) || input.repairRounds < 0) {
    throw new TypeError("repairRounds must be a non-negative integer");
  }

  const effectiveTier = effectiveRiskTier(input);
  const repairRoundLimit = input.maxRepairRounds ?? DEFAULT_REPAIR_LIMIT[effectiveTier];
  if (!Number.isInteger(repairRoundLimit) || repairRoundLimit < 1) {
    throw new TypeError("maxRepairRounds must be a positive integer");
  }

  const blockingFindingIds = input.findings.filter(isBlockingFinding).map((finding) => finding.id);
  const deferredFindingIds = input.findings.filter(isDeferredFinding).map((finding) => finding.id);
  const reasonCodes: string[] = [];
  const currentHeadReviewed = input.reviewedHeadSha === input.candidateHeadSha;
  const currentFullReview = input.fullReviewHeadSha === input.candidateHeadSha;
  const currentScopedReview = currentHeadReviewed && input.latestReviewKind === "SCOPED_REPAIR";
  const hasHistoricalFullReview = input.fullReviewHeadSha !== null;
  const currentHeadHasReviewEvidence = currentFullReview || currentHeadReviewed;
  const deltaClassificationCurrent =
    hasHistoricalFullReview &&
    input.deltaClassificationBaseSha === input.fullReviewHeadSha &&
    input.deltaClassificationHeadSha === input.candidateHeadSha;

  if (input.hardGateState !== "PASS") {
    reasonCodes.push(`HARD_GATE_${input.hardGateState}`);
    return { decision: "BLOCKED_HARD_GATE", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }
  if (input.hardGateEvidenceHeadSha !== input.candidateHeadSha) {
    reasonCodes.push("HARD_GATE_EVIDENCE_STALE");
    return { decision: "BLOCKED_HARD_GATE", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (!hasHistoricalFullReview && effectiveTier !== "LOW") {
    reasonCodes.push("INITIAL_FULL_REVIEW_REQUIRED");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // A STANDARD candidate may use delta classification to reduce review scope only when the
  // classification is bound to the retained broad-review baseline and the exact candidate head.
  if (effectiveTier === "STANDARD" && hasHistoricalFullReview && !currentFullReview && !deltaClassificationCurrent) {
    const unbound = input.deltaClassificationBaseSha === null || input.deltaClassificationHeadSha === null;
    reasonCodes.push(unbound ? "DELTA_CLASSIFICATION_UNBOUND" : "DELTA_CLASSIFICATION_STALE");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // Scope expansion and sensitive boundaries require a full review of the exact current head.
  // fullReviewHeadSha is cumulative evidence for that immutable head and cannot be erased by a
  // later narrower review on the same commit.
  if (input.scopeExpanded && !currentFullReview) {
    reasonCodes.push("SCOPE_EXPANDED_FULL_REVIEW_REQUIRED");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // Review the repaired/current head before acting again on findings inherited from an older head.
  if (!currentHeadHasReviewEvidence && effectiveTier !== "LOW") {
    if (effectiveTier === "SENSITIVE") {
      reasonCodes.push("SENSITIVE_CURRENT_HEAD_FULL_REVIEW_REQUIRED");
      return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
    }
    if (!input.repairOnlyDelta) {
      reasonCodes.push("HEAD_CHANGED_OUTSIDE_REPAIR_DELTA");
      return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
    }
    reasonCodes.push("REPAIR_DELTA_REVIEW_REQUIRED");
    return { decision: "REQUIRE_SCOPED_REREVIEW", reviewScope: "SCOPED_REPAIR", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // A sensitive candidate can only proceed from a current full review, never a scoped repair review.
  if (effectiveTier === "SENSITIVE" && !currentFullReview) {
    reasonCodes.push("SENSITIVE_CURRENT_HEAD_FULL_REVIEW_REQUIRED");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // A STANDARD candidate changed outside a repair-only delta can only proceed from a current full review.
  if (effectiveTier === "STANDARD" && !input.repairOnlyDelta && !currentFullReview) {
    reasonCodes.push("HEAD_CHANGED_OUTSIDE_REPAIR_DELTA");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  // A STANDARD repair-only current head may proceed from a scoped review if a broad review exists in lineage.
  if (effectiveTier === "STANDARD" && input.repairOnlyDelta && !currentFullReview && !currentScopedReview) {
    reasonCodes.push("REPAIR_DELTA_REVIEW_REQUIRED");
    return { decision: "REQUIRE_SCOPED_REREVIEW", reviewScope: "SCOPED_REPAIR", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (blockingFindingIds.length > 0) {
    if (input.repairRounds >= repairRoundLimit) {
      reasonCodes.push("REPAIR_ROUND_LIMIT_REACHED");
      return { decision: "ADJUDICATE_STOP", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
    }
    reasonCodes.push("CONFIRMED_BLOCKING_FINDINGS");
    return { decision: "REPAIR_REQUIRED", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (input.ownerAuthorizedHeadSha !== input.candidateHeadSha) {
    reasonCodes.push(input.ownerAuthorizedHeadSha === null ? "OWNER_MERGE_AUTHORIZATION_REQUIRED" : "OWNER_AUTHORIZATION_STALE");
    return { decision: "OWNER_AUTHORIZATION_REQUIRED", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (deferredFindingIds.length > 0) reasonCodes.push("NONBLOCKING_FINDINGS_DEFERRED");
  reasonCodes.push("CONVERGED");
  return { decision: "MERGE_ELIGIBLE", reviewScope: "NONE", effectiveRiskTier: effectiveTier, blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
}
