import { createHash } from "node:crypto";
import type { FailureLearningEpisode, FailureLearningEvent } from "./replay.ts";

export type FailureLearningHypothesisFixture = {
  hypothesis_id: string;
  evidence_cutoff_sequence: number;
  mechanism_code: string;
  predicted_fix_class: string | null;
  verdict: "SUPPORTED" | "REJECTED" | "INCONCLUSIVE";
  resolution_event_sequence: number;
};

export type FailureLearningLessonFixture = {
  lesson_id: string;
  lesson_type: "NEGATIVE" | "PROCEDURAL" | "SEMANTIC";
  mechanism_code: string;
  eligible_after_sequence: number;
  state: "CANDIDATE_ONLY";
};

export type FailureLearningEpisodeFixture = {
  schema_name: "FailureLearningEpisodeFixture";
  schema_version: "0.1";
  episode: FailureLearningEpisode & {
    opened_at: string;
    completed_at: string;
  };
  events: FailureLearningEvent[];
  hypotheses: FailureLearningHypothesisFixture[];
  lessons: FailureLearningLessonFixture[];
  checkpoint: {
    checkpoint_id: string;
    dataset_version: string;
    failure_observed: boolean;
    failure_features: string[];
  };
  raw_review_content_embedded: false;
  authority_effect: "NONE";
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const digestEpisodeFixture = (fixture: FailureLearningEpisodeFixture) =>
  `sha256:${createHash("sha256").update(stable(fixture)).digest("hex")}`;

export const validateEpisodeFixture = (fixture: FailureLearningEpisodeFixture) => {
  if (fixture.raw_review_content_embedded !== false) {
    throw new TypeError("Raw third-party review content must not be embedded in an episode fixture.");
  }
  if (fixture.authority_effect !== "NONE") {
    throw new TypeError("Episode fixtures cannot grant authority.");
  }
  if (fixture.episode.state !== "COMPLETE") {
    throw new TypeError("Materialized training fixtures must be COMPLETE.");
  }

  let previousSequence = 0;
  let previousTime = "";
  const seenEventIds = new Set<string>();
  for (const event of fixture.events) {
    if (!Number.isInteger(event.sequence) || event.sequence !== previousSequence + 1) {
      throw new TypeError("Episode event sequence must be contiguous and start at 1.");
    }
    if (seenEventIds.has(event.event_id)) throw new TypeError("Episode event IDs must be unique.");
    if (previousTime && event.occurred_at < previousTime) {
      throw new TypeError("Episode events must be nondecreasing in occurrence time.");
    }
    if (!event.source_digest.startsWith("sha256:")) {
      throw new TypeError("Every event requires a SHA-256 source digest.");
    }
    seenEventIds.add(event.event_id);
    previousSequence = event.sequence;
    previousTime = event.occurred_at;
  }

  if (fixture.events.length === 0) throw new TypeError("Episode fixture requires evidence events.");

  const hypothesisIds = new Set<string>();
  for (const hypothesis of fixture.hypotheses) {
    if (hypothesisIds.has(hypothesis.hypothesis_id)) {
      throw new TypeError("Hypothesis IDs must be unique.");
    }
    if (
      hypothesis.evidence_cutoff_sequence < 0
      || hypothesis.evidence_cutoff_sequence >= hypothesis.resolution_event_sequence
      || hypothesis.resolution_event_sequence > fixture.events.length
    ) {
      throw new TypeError("Hypotheses must be sealed before their resolving evidence.");
    }
    hypothesisIds.add(hypothesis.hypothesis_id);
  }

  const lessonIds = new Set<string>();
  for (const lesson of fixture.lessons) {
    if (lessonIds.has(lesson.lesson_id)) throw new TypeError("Lesson IDs must be unique.");
    if (
      lesson.eligible_after_sequence < 1
      || lesson.eligible_after_sequence > fixture.events.length
    ) {
      throw new TypeError("Lesson eligibility must point to observed evidence.");
    }
    if (lesson.state !== "CANDIDATE_ONLY") {
      throw new TypeError("Episode-derived lessons cannot self-promote.");
    }
    lessonIds.add(lesson.lesson_id);
  }

  return {
    contract: "FailureLearningEpisodeValidation/0.1",
    episode_id: fixture.episode.episode_id,
    event_count: fixture.events.length,
    hypothesis_count: fixture.hypotheses.length,
    lesson_count: fixture.lessons.length,
    digest: digestEpisodeFixture(fixture),
    materializable: true,
    authority_effect: "NONE",
  } as const;
};


export const buildEpisodeMaterializationPlan = (fixture: FailureLearningEpisodeFixture) => {
  const validation = validateEpisodeFixture(fixture);
  const eventBySequence = new Map(fixture.events.map((event) => [event.sequence, event]));
  const sourceDigest = validation.digest;

  return {
    contract: "FailureLearningMaterializationPlan/0.1",
    validation,
    episode: {
      episode_id: fixture.episode.episode_id,
      repository_id: fixture.episode.repository_id,
      external_pr_number: fixture.episode.external_pr_number,
      split: fixture.episode.split,
      state: fixture.episode.state,
      terminal_label: fixture.episode.terminal_label,
      opened_at: fixture.episode.opened_at,
      completed_at: fixture.episode.completed_at,
      event_count: fixture.events.length,
      source_digest: sourceDigest,
      created_at: fixture.episode.completed_at,
    },
    events: fixture.events.map((event) => ({
      ...event,
      episode_id: fixture.episode.episode_id,
      features_json: JSON.stringify(event.features),
      summary_json: JSON.stringify(event.summary),
    })),
    hypotheses: fixture.hypotheses.map((hypothesis) => ({
      hypothesis_id: hypothesis.hypothesis_id,
      episode_id: fixture.episode.episode_id,
      evidence_cutoff_sequence: hypothesis.evidence_cutoff_sequence,
      mechanism_code: hypothesis.mechanism_code,
      predicted_fix_class: hypothesis.predicted_fix_class,
      claim_json: JSON.stringify({
        source: "FROZEN_EPISODE_FIXTURE",
        mechanism_code: hypothesis.mechanism_code,
        predicted_fix_class: hypothesis.predicted_fix_class,
      }),
      verdict: hypothesis.verdict,
      score_json: JSON.stringify({
        temporal_cutoff_respected: true,
        verdict: hypothesis.verdict,
      }),
      created_at: eventBySequence.get(Math.max(1, hypothesis.evidence_cutoff_sequence))?.occurred_at
        ?? fixture.episode.opened_at,
      resolved_at: eventBySequence.get(hypothesis.resolution_event_sequence)?.occurred_at
        ?? fixture.episode.completed_at,
      resolution_event_sequence: hypothesis.resolution_event_sequence,
    })),
    lessons: fixture.lessons.map((lesson) => {
      const eligibleEvent = eventBySequence.get(lesson.eligible_after_sequence);
      if (!eligibleEvent) throw new TypeError("Lesson eligibility event is missing.");
      return {
        lesson_id: lesson.lesson_id,
        source_episode_id: fixture.episode.episode_id,
        lesson_type: lesson.lesson_type,
        mechanism_code: lesson.mechanism_code,
        lesson_json: JSON.stringify({
          source: "FROZEN_EPISODE_FIXTURE",
          mechanism_code: lesson.mechanism_code,
        }),
        eligible_after: eligibleEvent.occurred_at,
        state: lesson.state,
        created_at: fixture.episode.completed_at,
      };
    }),
    checkpoint: {
      checkpoint_id: fixture.checkpoint.checkpoint_id,
      dataset_version: fixture.checkpoint.dataset_version,
      completed_episode_id: fixture.episode.episode_id,
      episode_count: 1,
      hypothesis_count: fixture.hypotheses.length,
      prevention_metrics: {
        prevention_claimed: false,
        training_episode_only: true,
        supported_hypotheses: fixture.hypotheses.filter((item) => item.verdict === "SUPPORTED").length,
        rejected_hypotheses: fixture.hypotheses.filter((item) => item.verdict === "REJECTED").length,
        inconclusive_hypotheses: fixture.hypotheses.filter((item) => item.verdict === "INCONCLUSIVE").length,
      },
      failure_features: fixture.checkpoint.failure_features,
      failure_observed: fixture.checkpoint.failure_observed,
      created_at: fixture.episode.completed_at,
    },
    authority_effect: "NONE",
  } as const;
};
