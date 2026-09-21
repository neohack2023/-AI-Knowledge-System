import { createHash } from "node:crypto";

export type HoldoutContaminationState =
  | "CLEAN"
  | "TAINTED_DISCOVERY"
  | "TAINTED_PRIOR_REVIEW"
  | "TAINTED_MUTABLE_PR_METADATA"
  | "REVEALED_AFTER_CUTOFF";

export type HoldoutCandidate = {
  opaque_candidate_id: string;
  repository_id: string;
  external_pr_number: number;
  opened_at: string;
  contamination_state: HoldoutContaminationState;
};

export type HoldoutSelection = {
  selection_id: string;
  selected_candidate_id: string;
  repository_id: string;
  external_pr_number: number;
  selected_at: string;
  sampler_version: "BLIND_HASH_V0_1";
  contamination_state: HoldoutContaminationState;
  eligible_for_prevention_claim: boolean;
  authority_effect: "NONE";
};

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export const opaqueHoldoutCandidateId = (
  repositoryId: string,
  externalPrNumber: number,
  salt: string,
) => {
  if (!salt) throw new TypeError("A non-empty private sampling salt is required.");
  return `holdout:${hash(`${salt}\0${repositoryId}\0${externalPrNumber}`)}`;
};

export const markHoldoutContaminated = (
  candidate: HoldoutCandidate,
  contaminationState: Exclude<HoldoutContaminationState, "CLEAN">,
): HoldoutCandidate => ({
  ...candidate,
  contamination_state: contaminationState,
});

export const selectBlindHoldout = (
  candidates: HoldoutCandidate[],
  selectionSeed: string,
  selectedAt: string,
): HoldoutSelection => {
  if (!selectionSeed) throw new TypeError("selectionSeed is required.");
  if (candidates.length === 0) throw new TypeError("At least one holdout candidate is required.");

  const unique = new Map<string, HoldoutCandidate>();
  for (const candidate of candidates) {
    if (unique.has(candidate.opaque_candidate_id)) {
      throw new TypeError("Holdout candidate IDs must be unique.");
    }
    unique.set(candidate.opaque_candidate_id, candidate);
  }

  const ranked = [...unique.values()]
    .map((candidate) => ({
      candidate,
      rank: hash(`${selectionSeed}\0${candidate.opaque_candidate_id}`),
    }))
    .sort((left, right) =>
      left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0
    );

  const selected = ranked[0].candidate;
  return {
    selection_id: `selection:${hash(`${selectionSeed}\0${selected.opaque_candidate_id}\0${selectedAt}`)}`,
    selected_candidate_id: selected.opaque_candidate_id,
    repository_id: selected.repository_id,
    external_pr_number: selected.external_pr_number,
    selected_at: selectedAt,
    sampler_version: "BLIND_HASH_V0_1",
    contamination_state: selected.contamination_state,
    eligible_for_prevention_claim: selected.contamination_state === "CLEAN",
    authority_effect: "NONE",
  };
};


export type HoldoutCutoffKind =
  | "IMMUTABLE_INITIAL_COMMIT"
  | "MUTABLE_PR_DESCRIPTION"
  | "MUTABLE_PR_TITLE"
  | "OTHER";

export type HoldoutEvidenceCutoff = {
  selected_candidate_id: string;
  cutoff_kind: HoldoutCutoffKind;
  immutable_source_ref: string | null;
  source_digest: string | null;
  future_evidence_visible: false;
  contamination_state: HoldoutContaminationState;
  authority_effect: "NONE";
};

export const validateHoldoutEvidenceCutoff = (
  cutoff: HoldoutEvidenceCutoff,
) => {
  const clean =
    cutoff.cutoff_kind === "IMMUTABLE_INITIAL_COMMIT"
    && Boolean(cutoff.immutable_source_ref)
    && Boolean(cutoff.source_digest)
    && cutoff.contamination_state === "CLEAN";

  return {
    contract: "FailureLearningHoldoutCutoffValidation/0.1",
    selected_candidate_id: cutoff.selected_candidate_id,
    clean_for_prevention_claim: clean,
    reason_code: clean
      ? null
      : cutoff.cutoff_kind === "MUTABLE_PR_DESCRIPTION"
        || cutoff.cutoff_kind === "MUTABLE_PR_TITLE"
        ? "MUTABLE_PR_METADATA_NOT_OPENING_STATE"
        : "HOLDOUT_CUTOFF_NOT_IMMUTABLY_BOUND",
    authority_effect: "NONE" as const,
  };
};
