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
  hardGateState: HardGateState;
  fullReviewCompleted: boolean;
  currentHeadReviewed: boolean;
  latestReviewKind: ReviewKind;
  headChangedSinceFullReview: boolean;
  repairOnlyDelta: boolean;
  scopeExpanded: boolean;
  repairRounds: number;
  maxRepairRounds?: number;
  findings: AdvisoryFinding[];
  ownerMergeAuthorized: boolean;
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

export function evaluateReviewConvergence(input: ReviewConvergenceInput): ReviewConvergenceResult {
  if (!Number.isInteger(input.repairRounds) || input.repairRounds < 0) {
    throw new TypeError("repairRounds must be a non-negative integer");
  }

  const repairRoundLimit = input.maxRepairRounds ?? DEFAULT_REPAIR_LIMIT[input.riskTier];
  if (!Number.isInteger(repairRoundLimit) || repairRoundLimit < 1) {
    throw new TypeError("maxRepairRounds must be a positive integer");
  }

  const blockingFindingIds = input.findings.filter(isBlockingFinding).map((finding) => finding.id);
  const deferredFindingIds = input.findings.filter(isDeferredFinding).map((finding) => finding.id);
  const reasonCodes: string[] = [];

  if (input.hardGateState !== "PASS") {
    reasonCodes.push(`HARD_GATE_${input.hardGateState}`);
    return { decision: "BLOCKED_HARD_GATE", reviewScope: "NONE", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (input.scopeExpanded) {
    reasonCodes.push("SCOPE_EXPANDED_FULL_REVIEW_REQUIRED");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (!input.fullReviewCompleted && input.riskTier !== "LOW") {
    reasonCodes.push("INITIAL_FULL_REVIEW_REQUIRED");
    return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (blockingFindingIds.length > 0) {
    if (input.repairRounds >= repairRoundLimit) {
      reasonCodes.push("REPAIR_ROUND_LIMIT_REACHED");
      return { decision: "ADJUDICATE_STOP", reviewScope: "NONE", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
    }
    reasonCodes.push("CONFIRMED_BLOCKING_FINDINGS");
    return { decision: "REPAIR_REQUIRED", reviewScope: "NONE", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (input.headChangedSinceFullReview && input.riskTier !== "LOW") {
    if (input.riskTier === "SENSITIVE") {
      if (!(input.latestReviewKind === "FULL" && input.currentHeadReviewed)) {
        reasonCodes.push("SENSITIVE_HEAD_CHANGE_FULL_REVIEW_REQUIRED");
        return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
      }
    } else {
      if (!input.repairOnlyDelta) {
        reasonCodes.push("HEAD_CHANGED_OUTSIDE_REPAIR_DELTA");
        return { decision: "REQUIRE_FULL_REVIEW", reviewScope: "FULL", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
      }
      if (!(input.latestReviewKind === "SCOPED_REPAIR" && input.currentHeadReviewed)) {
        reasonCodes.push("REPAIR_DELTA_REVIEW_REQUIRED");
        return { decision: "REQUIRE_SCOPED_REREVIEW", reviewScope: "SCOPED_REPAIR", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
      }
    }
  }

  if (!input.ownerMergeAuthorized) {
    reasonCodes.push("OWNER_MERGE_AUTHORIZATION_REQUIRED");
    return { decision: "OWNER_AUTHORIZATION_REQUIRED", reviewScope: "NONE", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
  }

  if (deferredFindingIds.length > 0) reasonCodes.push("NONBLOCKING_FINDINGS_DEFERRED");
  reasonCodes.push("CONVERGED");
  return { decision: "MERGE_ELIGIBLE", reviewScope: "NONE", blockingFindingIds, deferredFindingIds, reasonCodes, repairRoundLimit };
}
