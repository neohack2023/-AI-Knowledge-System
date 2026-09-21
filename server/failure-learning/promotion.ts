export type FailureLearningPromotionState = "TRAINING" | "PROMOTABLE" | "PROMOTED";

export type FailureLearningPromotionEvidence = {
  clean_evaluation_count: number;
  positive_transfer_count: number;
  neutral_transfer_count: number;
  harmful_minor_count: number;
  harmful_major_count: number;
  unresolved_boundary_count: number;
  replay_verified: boolean;
  mason_decision_id: string | null;
};

export type FailureLearningPromotionAssessment = {
  contract: "FailureLearningPromotionAssessment/0.1";
  state: Exclude<FailureLearningPromotionState, "PROMOTED">;
  reason_codes: string[];
  authority_effect: "NONE";
};

export function assessFailureLearningPromotion(
  evidence: FailureLearningPromotionEvidence,
): FailureLearningPromotionAssessment {
  const reasons: string[] = [];
  if (!evidence.replay_verified) reasons.push("REPLAY_NOT_VERIFIED");
  if (!evidence.mason_decision_id) reasons.push("MASON_DECISION_REQUIRED");
  if (evidence.clean_evaluation_count < 3) reasons.push("INSUFFICIENT_CLEAN_EVALUATIONS");
  if (evidence.positive_transfer_count < 2) reasons.push("INSUFFICIENT_POSITIVE_TRANSFER");
  if (evidence.harmful_major_count > 0) reasons.push("MAJOR_HARM_PRESENT");
  if (evidence.unresolved_boundary_count > 0) reasons.push("UNRESOLVED_APPLICABILITY_BOUNDARY");

  return {
    contract: "FailureLearningPromotionAssessment/0.1",
    state: reasons.length ? "TRAINING" : "PROMOTABLE",
    reason_codes: reasons,
    authority_effect: "NONE",
  };
}

export type FailureLearningPromotionEnvelopeInput = {
  promotion_id: string;
  decision_id: string;
  source_pattern_ids: string[];
  source_database_head_digest: string;
  evidence_digest: string;
  scope: Record<string, unknown>;
  knowledge: Record<string, unknown>;
  created_at: string;
};

export function buildFailureLearningPromotionEnvelope(input: FailureLearningPromotionEnvelopeInput) {
  return {
    contract: "FailureLearningPromotionEnvelope/0.1",
    promotion_id: input.promotion_id,
    source: {
      database: "FAILURE_DB",
      pattern_ids: [...input.source_pattern_ids],
      database_head_digest: input.source_database_head_digest,
      evidence_digest: input.evidence_digest,
    },
    decision: {
      mason_decision_id: input.decision_id,
      state: "PROMOTABLE",
    },
    target: {
      database: "DB",
      materialization: "COPY_WITH_PROVENANCE",
    },
    scope: input.scope,
    knowledge: input.knowledge,
    created_at: input.created_at,
    write_authority: "NONE",
    authority_effect: "NONE",
  } as const;
}
