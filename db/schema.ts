import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workflowExecutions = sqliteTable("workflow_executions", {
  executionId: text("execution_id").primaryKey(),
  scopeKey: text("scope_key").notNull(),
  capabilityId: text("capability_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  traceId: text("trace_id"),
  requestedBy: text("requested_by"),
  parentExecutionId: text("parent_execution_id"),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  currentStage: text("current_stage"),
  inputJson: text("input_json").notNull(),
  outputJson: text("output_json"),
  errorJson: text("error_json"),
  resultClass: text("result_class"),
  authorityOwner: text("authority_owner").notNull(),
  authorityDomain: text("authority_domain").notNull(),
  authorityState: text("authority_state").notNull(),
}, (table) => [
  uniqueIndex("workflow_executions_identity_idx")
    .on(table.executionId, table.scopeKey, table.capabilityId),
  index("workflow_executions_scope_created_idx")
    .on(table.scopeKey, table.createdAt),
  index("workflow_executions_capability_created_idx")
    .on(table.capabilityId, table.createdAt),
]);

export const workflowExecutionEvents = sqliteTable("workflow_execution_events", {
  eventId: text("event_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  scopeKey: text("scope_key").notNull(),
  capabilityId: text("capability_id").notNull(),
  workflowId: text("workflow_id").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull(),
  stage: text("stage"),
  sequence: integer("sequence").notNull(),
  emittedAt: text("emitted_at").notNull(),
  dataJson: text("data_json"),
}, (table) => [
  uniqueIndex("workflow_execution_events_sequence_idx")
    .on(table.executionId, table.sequence),
  index("workflow_execution_events_identity_idx")
    .on(table.executionId, table.scopeKey, table.capabilityId),
]);

export const workflowExecutionLinks = sqliteTable("workflow_execution_links", {
  linkId: text("link_id").primaryKey(),
  executionId: text("execution_id").notNull(),
  scopeKey: text("scope_key").notNull(),
  capabilityId: text("capability_id").notNull(),
  linkType: text("link_type").notNull(),
  targetId: text("target_id").notNull(),
  sourceSystem: text("source_system").notNull(),
  authorityOwner: text("authority_owner").notNull(),
  authorityDomain: text("authority_domain").notNull(),
  authorityState: text("authority_state").notNull(),
  createdAt: text("created_at").notNull(),
  metadataJson: text("metadata_json").notNull(),
}, (table) => [
  index("workflow_execution_links_identity_idx")
    .on(table.executionId, table.scopeKey, table.capabilityId),
  index("workflow_execution_links_type_idx")
    .on(table.linkType, table.targetId),
]);

export const failureLearningRepositories = sqliteTable("failure_learning_repositories", {
  repositoryId: text("repository_id").primaryKey(),
  fullName: text("full_name").notNull(),
  githubId: text("github_id").notNull(),
  binding: text("binding").notNull(),
  defaultBranch: text("default_branch").notNull(),
  contextPacketRef: text("context_packet_ref"),
  authorityState: text("authority_state").notNull(),
  registeredAt: text("registered_at").notNull(),
}, (table) => [
  uniqueIndex("failure_learning_repositories_full_name_idx").on(table.fullName),
  uniqueIndex("failure_learning_repositories_github_id_idx").on(table.githubId),
]);

export const failureLearningEpisodes = sqliteTable("failure_learning_episodes", {
  episodeId: text("episode_id").primaryKey(),
  repositoryId: text("repository_id").notNull(),
  externalPrNumber: integer("external_pr_number").notNull(),
  split: text("split").notNull(),
  state: text("state").notNull(),
  terminalLabel: text("terminal_label"),
  openedAt: text("opened_at"),
  completedAt: text("completed_at"),
  eventCount: integer("event_count").notNull().default(0),
  sourceDigest: text("source_digest"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("failure_learning_episode_repo_pr_idx").on(table.repositoryId, table.externalPrNumber),
  index("failure_learning_episode_state_idx").on(table.state, table.createdAt),
  index("failure_learning_episode_split_idx").on(table.split, table.createdAt),
]);

export const failureLearningEvents = sqliteTable("failure_learning_events", {
  eventId: text("event_id").primaryKey(),
  episodeId: text("episode_id").notNull(),
  sequence: integer("sequence").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  sourceRef: text("source_ref").notNull(),
  sourceDigest: text("source_digest").notNull(),
  featuresJson: text("features_json").notNull(),
  summaryJson: text("summary_json").notNull(),
}, (table) => [
  uniqueIndex("failure_learning_event_sequence_idx").on(table.episodeId, table.sequence),
  index("failure_learning_event_type_idx").on(table.eventType, table.occurredAt),
]);

export const failureLearningHypotheses = sqliteTable("failure_learning_hypotheses", {
  hypothesisId: text("hypothesis_id").primaryKey(),
  episodeId: text("episode_id").notNull(),
  evidenceCutoffSequence: integer("evidence_cutoff_sequence").notNull(),
  mechanismCode: text("mechanism_code").notNull(),
  predictedFixClass: text("predicted_fix_class"),
  claimJson: text("claim_json").notNull(),
  verdict: text("verdict").notNull(),
  scoreJson: text("score_json"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolutionEventSequence: integer("resolution_event_sequence"),
}, (table) => [
  index("failure_learning_hypothesis_episode_idx").on(table.episodeId, table.evidenceCutoffSequence),
  index("failure_learning_hypothesis_mechanism_idx").on(table.mechanismCode, table.verdict),
]);

export const failureLearningLessons = sqliteTable("failure_learning_lessons", {
  lessonId: text("lesson_id").primaryKey(),
  sourceEpisodeId: text("source_episode_id").notNull(),
  lessonType: text("lesson_type").notNull(),
  mechanismCode: text("mechanism_code").notNull(),
  lessonJson: text("lesson_json").notNull(),
  eligibleAfter: text("eligible_after").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("failure_learning_lesson_mechanism_idx").on(table.mechanismCode, table.state),
  index("failure_learning_lesson_eligibility_idx").on(table.eligibleAfter, table.state),
]);

export const failureLearningEvaluations = sqliteTable("failure_learning_evaluations", {
  evaluationId: text("evaluation_id").primaryKey(),
  targetEpisodeId: text("target_episode_id").notNull(),
  mode: text("mode").notNull(),
  modelVersion: text("model_version"),
  evidenceCutoffSequence: integer("evidence_cutoff_sequence").notNull(),
  retrievedLessonIdsJson: text("retrieved_lesson_ids_json").notNull(),
  predictionJson: text("prediction_json").notNull(),
  outcomeJson: text("outcome_json"),
  metricsJson: text("metrics_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("failure_learning_eval_episode_mode_idx").on(table.targetEpisodeId, table.mode),
  index("failure_learning_eval_created_idx").on(table.createdAt),
]);

export const failureLearningModels = sqliteTable("failure_learning_models", {
  modelId: text("model_id").primaryKey(),
  modelKind: text("model_kind").notNull(),
  featureSchemaVersion: text("feature_schema_version").notNull(),
  state: text("state").notNull(),
  weightsJson: text("weights_json").notNull(),
  bias: integer("bias_micros").notNull().default(0),
  trainedEpisodeCount: integer("trained_episode_count").notNull().default(0),
  trainedThroughEpisodeId: text("trained_through_episode_id"),
  updatedAt: text("updated_at").notNull(),
});

export const failureLearningPredictions = sqliteTable("failure_learning_predictions", {
  predictionId: text("prediction_id").primaryKey(),
  episodeId: text("episode_id").notNull(),
  modelId: text("model_id").notNull(),
  modelVersion: text("model_version").notNull(),
  evidenceCutoffSequence: integer("evidence_cutoff_sequence").notNull(),
  featureDigest: text("feature_digest").notNull(),
  riskMicros: integer("risk_micros").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("failure_learning_prediction_episode_idx").on(table.episodeId, table.evidenceCutoffSequence),
  index("failure_learning_prediction_model_idx").on(table.modelId, table.createdAt),
]);

export const failureLearningCheckpoints = sqliteTable("failure_learning_checkpoints", {
  checkpointId: text("checkpoint_id").primaryKey(),
  datasetVersion: text("dataset_version").notNull(),
  completedEpisodeId: text("completed_episode_id").notNull(),
  episodeCount: integer("episode_count").notNull(),
  hypothesisCount: integer("hypothesis_count").notNull(),
  modelId: text("model_id"),
  modelDigest: text("model_digest"),
  preventionMetricsJson: text("prevention_metrics_json").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("failure_learning_checkpoint_created_idx").on(table.createdAt),
]);
