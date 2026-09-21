import { createHash } from "node:crypto";
import {
  type HoldoutCandidate,
  type HoldoutEvidenceCutoff,
  type HoldoutSelection,
  selectBlindHoldout,
  validateHoldoutEvidenceCutoff,
} from "./holdout.ts";

export type StructuralCandidateInput = {
  repository_id: string;
  external_pr_number: number;
  opened_at: string;
  discussion_count: number;
  review_count: number;
  changed_file_count: number;
  contamination_state: HoldoutCandidate["contamination_state"];
};

export type IntakePolicy = {
  min_discussion_count: number;
  min_review_count: number;
  max_changed_file_count: number;
};

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const buildBlindCandidatePool = (
  inputs: StructuralCandidateInput[],
  privateSalt: string,
  policy: IntakePolicy,
) => {
  if (!privateSalt) throw new TypeError("privateSalt is required.");
  const admitted = inputs
    .filter((input) =>
      input.discussion_count >= policy.min_discussion_count
      && input.review_count >= policy.min_review_count
      && input.changed_file_count >= 1
      && input.changed_file_count <= policy.max_changed_file_count
    )
    .map<HoldoutCandidate>((input) => ({
      opaque_candidate_id: `holdout:${digest(
        `${privateSalt}\0${input.repository_id}\0${input.external_pr_number}`
      )}`,
      repository_id: input.repository_id,
      external_pr_number: input.external_pr_number,
      opened_at: input.opened_at,
      contamination_state: input.contamination_state,
    }));

  return {
    contract: "FailureLearningCandidatePool/0.1",
    admitted,
    rejected_count: inputs.length - admitted.length,
    authority_effect: "NONE" as const,
  };
};

export const selectBlindCandidate = (
  pool: ReturnType<typeof buildBlindCandidatePool>,
  selectionSeed: string,
  selectedAt: string,
): HoldoutSelection =>
  selectBlindHoldout(pool.admitted, selectionSeed, selectedAt);

export const freezeInitialCommitCutoff = (input: {
  selected_candidate_id: string;
  commit_sha: string;
  immutable_diff_digest: string;
  contamination_state: HoldoutCandidate["contamination_state"];
}): HoldoutEvidenceCutoff => ({
  selected_candidate_id: input.selected_candidate_id,
  cutoff_kind: "IMMUTABLE_INITIAL_COMMIT",
  immutable_source_ref: `git-commit:${input.commit_sha}`,
  source_digest: input.immutable_diff_digest,
  future_evidence_visible: false,
  contamination_state: input.contamination_state,
  authority_effect: "NONE",
});

export const freezeMutablePrDescriptionCutoff = (input: {
  selected_candidate_id: string;
}): HoldoutEvidenceCutoff => ({
  selected_candidate_id: input.selected_candidate_id,
  cutoff_kind: "MUTABLE_PR_DESCRIPTION",
  immutable_source_ref: null,
  source_digest: null,
  future_evidence_visible: false,
  contamination_state: "TAINTED_MUTABLE_PR_METADATA",
  authority_effect: "NONE",
});

export const assertCleanPreventionCutoff = (cutoff: HoldoutEvidenceCutoff) => {
  const result = validateHoldoutEvidenceCutoff(cutoff);
  if (!result.clean_for_prevention_claim) {
    throw new Error(result.reason_code ?? "UNCLEAN_HOLDOUT_CUTOFF");
  }
  return result;
};

export type PairedPreventionPrediction = {
  mode: "LESSONS_OFF" | "LESSONS_ON";
  selected_candidate_id: string;
  source_digest: string;
  mechanism_code: string;
  fix_class: string;
  validation_targets: string[];
  activated_lesson_ids: string[];
  created_before_reveal: true;
};

export const validatePairedPredictions = (
  cutoff: HoldoutEvidenceCutoff,
  predictions: PairedPreventionPrediction[],
) => {
  assertCleanPreventionCutoff(cutoff);
  if (predictions.length !== 2) {
    throw new TypeError("Exactly two paired predictions are required.");
  }
  const modes = new Set(predictions.map((prediction) => prediction.mode));
  if (!modes.has("LESSONS_OFF") || !modes.has("LESSONS_ON")) {
    throw new TypeError("Paired run requires LESSONS_OFF and LESSONS_ON.");
  }
  for (const prediction of predictions) {
    if (prediction.selected_candidate_id !== cutoff.selected_candidate_id) {
      throw new TypeError("Prediction candidate mismatch.");
    }
    if (prediction.source_digest !== cutoff.source_digest) {
      throw new TypeError("Prediction source digest mismatch.");
    }
    if (prediction.created_before_reveal !== true) {
      throw new TypeError("Predictions must be sealed before reveal.");
    }
    if (prediction.mode === "LESSONS_OFF" && prediction.activated_lesson_ids.length !== 0) {
      throw new TypeError("LESSONS_OFF cannot activate lessons.");
    }
  }
  return {
    contract: "FailureLearningPairedPredictionValidation/0.1",
    valid: true,
    authority_effect: "NONE" as const,
  };
};
