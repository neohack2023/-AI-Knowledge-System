import type { D1DatabaseLike } from "../workflows/d1-execution-history-store.ts";
import {
  buildReplayWindow,
  type FailureLearningEpisode,
  type FailureLearningEvent,
} from "./replay.ts";
import {
  createFailureRiskModel,
  FAILURE_RISK_MODEL_ID,
  FAILURE_RISK_MODEL_KIND,
  FAILURE_RISK_FEATURE_SCHEMA,
  predictFailureRisk,
  updateFailureRiskModel,
  type FailureRiskModel,
} from "./model.ts";

export type FailureLearningBackendState = {
  backend: "D1";
  state: "DURABLE_AVAILABLE" | "DURABLE_UNAVAILABLE";
  reason_code: string | null;
};

const requiredTables = [
  "failure_learning_repositories",
  "failure_learning_episodes",
  "failure_learning_events",
  "failure_learning_hypotheses",
  "failure_learning_lessons",
  "failure_learning_evaluations",
  "failure_learning_models",
  "failure_learning_predictions",
  "failure_learning_checkpoints",
] as const;

type EpisodeRow = {
  episode_id: string;
  repository_id: string;
  external_pr_number: number;
  split: FailureLearningEpisode["split"];
  state: FailureLearningEpisode["state"];
  terminal_label: FailureLearningEpisode["terminal_label"];
  event_count: number;
};

type EventRow = {
  event_id: string;
  sequence: number;
  event_type: string;
  occurred_at: string;
  source_ref: string;
  source_digest: string;
  features_json: string;
  summary_json: string;
};

type LessonRow = {
  lesson_id: string;
  source_episode_id: string;
  lesson_type: string;
  mechanism_code: string;
  lesson_json: string;
  eligible_after: string;
  state: string;
};

type ModelRow = {
  model_id: string;
  model_kind: string;
  feature_schema_version: string;
  state: "SHADOW_ONLY" | "UNTRAINED";
  weights_json: string;
  bias_micros: number;
  trained_episode_count: number;
  trained_through_episode_id: string | null;
};

const parseObject = (raw: string, field: string) => {
  const value = JSON.parse(raw) as unknown;
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError(`${field} must contain a JSON object.`);
  }
  return value as Record<string, unknown>;
};

const parseStringArray = (raw: string, field: string) => {
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new TypeError(`${field} must contain a JSON string array.`);
  }
  return value;
};

const episodeFromRow = (row: EpisodeRow): FailureLearningEpisode => ({
  episode_id: row.episode_id,
  repository_id: row.repository_id,
  external_pr_number: row.external_pr_number,
  split: row.split,
  state: row.state,
  terminal_label: row.terminal_label,
});

const eventFromRow = (row: EventRow): FailureLearningEvent => ({
  event_id: row.event_id,
  sequence: row.sequence,
  event_type: row.event_type,
  occurred_at: row.occurred_at,
  source_ref: row.source_ref,
  source_digest: row.source_digest,
  features: parseStringArray(row.features_json, "features_json"),
  summary: parseObject(row.summary_json, "summary_json"),
});

const modelFromRow = (row: ModelRow): FailureRiskModel => {
  const weights = JSON.parse(row.weights_json) as unknown;
  if (!Array.isArray(weights) || !weights.every((weight) => typeof weight === "number")) {
    throw new TypeError("weights_json must contain a number array.");
  }
  if (
    row.model_kind !== FAILURE_RISK_MODEL_KIND
    || row.feature_schema_version !== FAILURE_RISK_FEATURE_SCHEMA
  ) {
    throw new TypeError("Stored failure-risk model is incompatible with the active model contract.");
  }
  return {
    model_id: row.model_id,
    model_kind: FAILURE_RISK_MODEL_KIND,
    feature_schema_version: FAILURE_RISK_FEATURE_SCHEMA,
    state: row.state,
    weights,
    bias: row.bias_micros / 1_000_000,
    trained_episode_count: row.trained_episode_count,
    trained_through_episode_id: row.trained_through_episode_id,
  };
};

export class D1FailureLearningStore {
  private state: FailureLearningBackendState = {
    backend: "D1",
    state: "DURABLE_UNAVAILABLE",
    reason_code: "FAILURE_LEARNING_SCHEMA_UNAVAILABLE",
  };

  constructor(private readonly db: D1DatabaseLike) {}

  async initialize() {
    try {
      for (const table of requiredTables) {
        await this.db.prepare(`SELECT 1 AS ready FROM ${table} LIMIT 0`).all();
      }
      this.state = { backend: "D1", state: "DURABLE_AVAILABLE", reason_code: null };
    } catch {
      this.state = {
        backend: "D1",
        state: "DURABLE_UNAVAILABLE",
        reason_code: "FAILURE_LEARNING_SCHEMA_UNAVAILABLE",
      };
    }
    return this;
  }

  getBackendState() {
    return { ...this.state };
  }

  private requireAvailable() {
    if (this.state.state !== "DURABLE_AVAILABLE") {
      throw new Error(this.state.reason_code ?? "FAILURE_LEARNING_UNAVAILABLE");
    }
  }

  async status() {
    if (this.state.state !== "DURABLE_AVAILABLE") {
      return {
        contract: "FailureLearningStatus/0.1",
        backend: this.getBackendState(),
        authority_effect: "NONE",
      };
    }
    const count = async (table: string) => {
      const row = await this.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
      return Number(row?.count ?? 0);
    };
    const latest = await this.db
      .prepare("SELECT checkpoint_id, dataset_version, completed_episode_id, episode_count, hypothesis_count, model_id, model_digest, prevention_metrics_json, created_at FROM failure_learning_checkpoints ORDER BY created_at DESC LIMIT 1")
      .first<Record<string, unknown>>();
    return {
      contract: "FailureLearningStatus/0.1",
      backend: this.getBackendState(),
      counts: {
        repositories: await count("failure_learning_repositories"),
        episodes: await count("failure_learning_episodes"),
        events: await count("failure_learning_events"),
        hypotheses: await count("failure_learning_hypotheses"),
        lessons: await count("failure_learning_lessons"),
        evaluations: await count("failure_learning_evaluations"),
        predictions: await count("failure_learning_predictions"),
        checkpoints: await count("failure_learning_checkpoints"),
      },
      latest_checkpoint: latest ?? null,
      authority_effect: "NONE",
    };
  }

  async replay(episodeId: string, evidenceCutoffSequence: number) {
    this.requireAvailable();
    const episodeRow = await this.db
      .prepare("SELECT episode_id, repository_id, external_pr_number, split, state, terminal_label, event_count FROM failure_learning_episodes WHERE episode_id = ? LIMIT 1")
      .bind(episodeId)
      .first<EpisodeRow>();
    if (!episodeRow) throw new Error("FAILURE_LEARNING_EPISODE_NOT_FOUND");

    const eventResult = await this.db
      .prepare("SELECT event_id, sequence, event_type, occurred_at, source_ref, source_digest, features_json, summary_json FROM failure_learning_events WHERE episode_id = ? ORDER BY sequence ASC")
      .bind(episodeId)
      .all<EventRow>();
    const events = (eventResult.results ?? []).map(eventFromRow);
    const replay = buildReplayWindow(episodeFromRow(episodeRow), events, evidenceCutoffSequence);
    const cutoffEvent = [...events].reverse().find((event) => event.sequence <= evidenceCutoffSequence);
    const eligibleLessons = cutoffEvent
      ? await this.db
        .prepare("SELECT lesson_id, source_episode_id, lesson_type, mechanism_code, lesson_json, eligible_after, state FROM failure_learning_lessons WHERE source_episode_id != ? AND state = 'CANDIDATE_ONLY' AND eligible_after <= ? ORDER BY eligible_after DESC, lesson_id ASC LIMIT 32")
        .bind(episodeId, cutoffEvent.occurred_at)
        .all<LessonRow>()
      : { results: [] as LessonRow[] };

    return {
      ...replay,
      eligible_lessons: (eligibleLessons.results ?? []).map((lesson) => ({
        lesson_id: lesson.lesson_id,
        source_episode_id: lesson.source_episode_id,
        lesson_type: lesson.lesson_type,
        mechanism_code: lesson.mechanism_code,
        lesson: parseObject(lesson.lesson_json, "lesson_json"),
        eligible_after: lesson.eligible_after,
        state: lesson.state,
      })),
      raw_future_evidence: null,
    };
  }

  async predict(features: string[]) {
    this.requireAvailable();
    const row = await this.db
      .prepare("SELECT model_id, model_kind, feature_schema_version, state, weights_json, bias_micros, trained_episode_count, trained_through_episode_id FROM failure_learning_models WHERE model_id = ? LIMIT 1")
      .bind(FAILURE_RISK_MODEL_ID)
      .first<ModelRow>();
    const model = row ? modelFromRow(row) : createFailureRiskModel();
    return {
      contract: "FailureRiskPrediction/0.1",
      ...predictFailureRisk(model, features),
      specialist_selection_authority: "NONE",
      execution_authority: "NONE",
    };
  }

  async registerRepository(input: {
    repository_id: string;
    full_name: string;
    github_id: string;
    default_branch: string;
    context_packet_ref?: string | null;
    registered_at: string;
  }) {
    this.requireAvailable();
    await this.db.prepare(
      "INSERT INTO failure_learning_repositories (repository_id, full_name, github_id, binding, default_branch, context_packet_ref, authority_state, registered_at) VALUES (?, ?, ?, 'RESEARCH_SOURCE', ?, ?, 'OBSERVATIONAL', ?) ON CONFLICT(repository_id) DO UPDATE SET full_name=excluded.full_name, github_id=excluded.github_id, default_branch=excluded.default_branch, context_packet_ref=excluded.context_packet_ref"
    ).bind(
      input.repository_id,
      input.full_name,
      input.github_id,
      input.default_branch,
      input.context_packet_ref ?? null,
      input.registered_at,
    ).all();
  }

  async upsertEpisode(input: {
    episode_id: string;
    repository_id: string;
    external_pr_number: number;
    split: FailureLearningEpisode["split"];
    state: FailureLearningEpisode["state"];
    terminal_label?: FailureLearningEpisode["terminal_label"];
    opened_at?: string | null;
    completed_at?: string | null;
    source_digest?: string | null;
    created_at: string;
  }) {
    this.requireAvailable();
    await this.db.prepare(
      "INSERT INTO failure_learning_episodes (episode_id, repository_id, external_pr_number, split, state, terminal_label, opened_at, completed_at, event_count, source_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?) ON CONFLICT(episode_id) DO UPDATE SET state=excluded.state, terminal_label=excluded.terminal_label, completed_at=excluded.completed_at, source_digest=excluded.source_digest"
    ).bind(
      input.episode_id,
      input.repository_id,
      input.external_pr_number,
      input.split,
      input.state,
      input.terminal_label ?? null,
      input.opened_at ?? null,
      input.completed_at ?? null,
      input.source_digest ?? null,
      input.created_at,
    ).all();
  }

  async appendEvent(input: FailureLearningEvent & { episode_id: string }) {
    this.requireAvailable();
    const head = await this.db
      .prepare("SELECT sequence FROM failure_learning_events WHERE episode_id = ? ORDER BY sequence DESC LIMIT 1")
      .bind(input.episode_id)
      .first<{ sequence: number }>();
    const expected = (head?.sequence ?? 0) + 1;
    if (input.sequence !== expected) throw new Error(`FAILURE_LEARNING_SEQUENCE_CONFLICT expected=${expected}`);
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO failure_learning_events (event_id, episode_id, sequence, event_type, occurred_at, source_ref, source_digest, features_json, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        input.event_id,
        input.episode_id,
        input.sequence,
        input.event_type,
        input.occurred_at,
        input.source_ref,
        input.source_digest,
        JSON.stringify(input.features),
        JSON.stringify(input.summary),
      ),
      this.db.prepare("UPDATE failure_learning_episodes SET event_count = ? WHERE episode_id = ?")
        .bind(input.sequence, input.episode_id),
    ]);
  }

  async recordHypothesis(input: {
    hypothesis_id: string;
    episode_id: string;
    evidence_cutoff_sequence: number;
    mechanism_code: string;
    predicted_fix_class?: string | null;
    claim: Record<string, unknown>;
    created_at: string;
  }) {
    this.requireAvailable();
    if (input.evidence_cutoff_sequence > 0) {
      const cutoff = await this.db
        .prepare("SELECT event_id FROM failure_learning_events WHERE episode_id = ? AND sequence = ? LIMIT 1")
        .bind(input.episode_id, input.evidence_cutoff_sequence)
        .first<{ event_id: string }>();
      if (!cutoff) throw new Error("FAILURE_LEARNING_CUTOFF_NOT_FOUND");
    }
    await this.db.prepare(
      "INSERT INTO failure_learning_hypotheses (hypothesis_id, episode_id, evidence_cutoff_sequence, mechanism_code, predicted_fix_class, claim_json, verdict, score_json, created_at, resolved_at, resolution_event_sequence) VALUES (?, ?, ?, ?, ?, ?, 'UNTESTED', NULL, ?, NULL, NULL)"
    ).bind(
      input.hypothesis_id,
      input.episode_id,
      input.evidence_cutoff_sequence,
      input.mechanism_code,
      input.predicted_fix_class ?? null,
      JSON.stringify(input.claim),
      input.created_at,
    ).all();
  }

  async recordCheckpointAndTrain(input: {
    checkpoint_id: string;
    dataset_version: string;
    completed_episode_id: string;
    episode_count: number;
    hypothesis_count: number;
    prevention_metrics: Record<string, unknown>;
    failure_features: string[];
    failure_observed: boolean;
    created_at: string;
    model_digest?: string | null;
  }) {
    this.requireAvailable();
    const row = await this.db
      .prepare("SELECT model_id, model_kind, feature_schema_version, state, weights_json, bias_micros, trained_episode_count, trained_through_episode_id FROM failure_learning_models WHERE model_id = ? LIMIT 1")
      .bind(FAILURE_RISK_MODEL_ID)
      .first<ModelRow>();
    const current = row ? modelFromRow(row) : createFailureRiskModel();
    const next = updateFailureRiskModel(
      current,
      input.failure_features,
      input.failure_observed,
      input.completed_episode_id,
    );
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO failure_learning_models (model_id, model_kind, feature_schema_version, state, weights_json, bias_micros, trained_episode_count, trained_through_episode_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(model_id) DO UPDATE SET state=excluded.state, weights_json=excluded.weights_json, bias_micros=excluded.bias_micros, trained_episode_count=excluded.trained_episode_count, trained_through_episode_id=excluded.trained_through_episode_id, updated_at=excluded.updated_at"
      ).bind(
        next.model_id,
        next.model_kind,
        next.feature_schema_version,
        next.state,
        JSON.stringify(next.weights),
        Math.round(next.bias * 1_000_000),
        next.trained_episode_count,
        next.trained_through_episode_id,
        input.created_at,
      ),
      this.db.prepare(
        "INSERT INTO failure_learning_checkpoints (checkpoint_id, dataset_version, completed_episode_id, episode_count, hypothesis_count, model_id, model_digest, prevention_metrics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        input.checkpoint_id,
        input.dataset_version,
        input.completed_episode_id,
        input.episode_count,
        input.hypothesis_count,
        next.model_id,
        input.model_digest ?? null,
        JSON.stringify(input.prevention_metrics),
        input.created_at,
      ),
    ]);
    return next;
  }
}
