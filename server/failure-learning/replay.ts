export type FailureLearningEvent = {
  event_id: string;
  sequence: number;
  event_type: string;
  occurred_at: string;
  source_ref: string;
  source_digest: string;
  features: string[];
  summary: Record<string, unknown>;
};

export type FailureLearningEpisode = {
  episode_id: string;
  repository_id: string;
  external_pr_number: number;
  split: "TRAIN" | "DEV" | "HOLDOUT";
  state: "REGISTERED" | "REPLAYING" | "COMPLETE";
  terminal_label:
    | "MERGED_STABLE"
    | "MERGED_THEN_REVERTED"
    | "MERGED_THEN_FIXED"
    | "SUPERSEDED"
    | "CLOSED_UNMERGED"
    | "ABANDONED_OR_WORKFLOW"
    | "INCONCLUSIVE"
    | null;
};

export type HypothesisResolution = {
  supported_mechanism_codes: string[];
  contradicted_mechanism_codes: string[];
  supported_fix_classes: string[];
  evidence_state: "RESOLVED" | "UNRESOLVED";
};

export const assertOrderedEvents = (events: FailureLearningEvent[]) => {
  let previous = 0;
  for (const event of events) {
    if (!Number.isInteger(event.sequence) || event.sequence <= previous) {
      throw new TypeError("Failure-learning event sequence must be strictly increasing.");
    }
    previous = event.sequence;
  }
};

export const buildReplayWindow = (
  episode: FailureLearningEpisode,
  events: FailureLearningEvent[],
  evidenceCutoffSequence: number,
) => {
  if (!Number.isInteger(evidenceCutoffSequence) || evidenceCutoffSequence < 0) {
    throw new TypeError("evidenceCutoffSequence must be a non-negative integer.");
  }
  assertOrderedEvents(events);
  const visibleEvents = events.filter((event) => event.sequence <= evidenceCutoffSequence);
  const hiddenEventCount = events.length - visibleEvents.length;
  return {
    contract: "FailureLearningReplay/0.1",
    episode: {
      episode_id: episode.episode_id,
      repository_id: episode.repository_id,
      external_pr_number: episode.external_pr_number,
      split: episode.split,
      state: episode.state,
      terminal_label: episode.state === "COMPLETE" && hiddenEventCount === 0
        ? episode.terminal_label
        : null,
    },
    evidence_cutoff_sequence: evidenceCutoffSequence,
    visible_events: visibleEvents,
    hidden_event_count: hiddenEventCount,
    future_evidence_visible: false,
    authority_effect: "NONE",
  } as const;
};

export const scoreFailureHypothesis = (
  mechanismCode: string,
  predictedFixClass: string | null,
  resolution: HypothesisResolution,
) => {
  if (resolution.evidence_state === "UNRESOLVED") {
    return { verdict: "INCONCLUSIVE" as const, mechanism_match: false, fix_class_match: false };
  }
  const mechanismMatch = resolution.supported_mechanism_codes.includes(mechanismCode);
  const contradicted = resolution.contradicted_mechanism_codes.includes(mechanismCode);
  const fixClassMatch = predictedFixClass === null
    || resolution.supported_fix_classes.includes(predictedFixClass);
  if (contradicted) {
    return { verdict: "REJECTED" as const, mechanism_match: false, fix_class_match: fixClassMatch };
  }
  if (mechanismMatch) {
    return { verdict: "SUPPORTED" as const, mechanism_match: true, fix_class_match: fixClassMatch };
  }
  return { verdict: "INCONCLUSIVE" as const, mechanism_match: false, fix_class_match: fixClassMatch };
};

export const lessonIsEligible = (
  sourceEpisodeId: string,
  targetEpisodeId: string,
  eligibleAfter: string,
  targetCutoffAt: string,
) => sourceEpisodeId !== targetEpisodeId && eligibleAfter <= targetCutoffAt;
