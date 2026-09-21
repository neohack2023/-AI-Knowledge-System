CREATE TABLE `failure_learning_repositories` (
  `repository_id` text PRIMARY KEY NOT NULL,
  `full_name` text NOT NULL,
  `github_id` text NOT NULL,
  `binding` text NOT NULL,
  `default_branch` text NOT NULL,
  `context_packet_ref` text,
  `authority_state` text NOT NULL,
  `registered_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_learning_repositories_full_name_idx` ON `failure_learning_repositories` (`full_name`);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_learning_repositories_github_id_idx` ON `failure_learning_repositories` (`github_id`);
--> statement-breakpoint
CREATE TABLE `failure_learning_episodes` (
  `episode_id` text PRIMARY KEY NOT NULL,
  `repository_id` text NOT NULL,
  `external_pr_number` integer NOT NULL,
  `split` text NOT NULL,
  `state` text NOT NULL,
  `terminal_label` text,
  `opened_at` text,
  `completed_at` text,
  `event_count` integer DEFAULT 0 NOT NULL,
  `source_digest` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_learning_episode_repo_pr_idx` ON `failure_learning_episodes` (`repository_id`,`external_pr_number`);
--> statement-breakpoint
CREATE INDEX `failure_learning_episode_state_idx` ON `failure_learning_episodes` (`state`,`created_at`);
--> statement-breakpoint
CREATE INDEX `failure_learning_episode_split_idx` ON `failure_learning_episodes` (`split`,`created_at`);
--> statement-breakpoint
CREATE TABLE `failure_learning_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `episode_id` text NOT NULL,
  `sequence` integer NOT NULL,
  `event_type` text NOT NULL,
  `occurred_at` text NOT NULL,
  `source_ref` text NOT NULL,
  `source_digest` text NOT NULL,
  `features_json` text NOT NULL,
  `summary_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `failure_learning_event_sequence_idx` ON `failure_learning_events` (`episode_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `failure_learning_event_type_idx` ON `failure_learning_events` (`event_type`,`occurred_at`);
--> statement-breakpoint
CREATE TABLE `failure_learning_hypotheses` (
  `hypothesis_id` text PRIMARY KEY NOT NULL,
  `episode_id` text NOT NULL,
  `evidence_cutoff_sequence` integer NOT NULL,
  `mechanism_code` text NOT NULL,
  `predicted_fix_class` text,
  `claim_json` text NOT NULL,
  `verdict` text NOT NULL,
  `score_json` text,
  `created_at` text NOT NULL,
  `resolved_at` text,
  `resolution_event_sequence` integer
);
--> statement-breakpoint
CREATE INDEX `failure_learning_hypothesis_episode_idx` ON `failure_learning_hypotheses` (`episode_id`,`evidence_cutoff_sequence`);
--> statement-breakpoint
CREATE INDEX `failure_learning_hypothesis_mechanism_idx` ON `failure_learning_hypotheses` (`mechanism_code`,`verdict`);
--> statement-breakpoint
CREATE TABLE `failure_learning_lessons` (
  `lesson_id` text PRIMARY KEY NOT NULL,
  `source_episode_id` text NOT NULL,
  `lesson_type` text NOT NULL,
  `mechanism_code` text NOT NULL,
  `lesson_json` text NOT NULL,
  `eligible_after` text NOT NULL,
  `state` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `failure_learning_lesson_mechanism_idx` ON `failure_learning_lessons` (`mechanism_code`,`state`);
--> statement-breakpoint
CREATE INDEX `failure_learning_lesson_eligibility_idx` ON `failure_learning_lessons` (`eligible_after`,`state`);
--> statement-breakpoint
CREATE TABLE `failure_learning_evaluations` (
  `evaluation_id` text PRIMARY KEY NOT NULL,
  `target_episode_id` text NOT NULL,
  `mode` text NOT NULL,
  `model_version` text,
  `evidence_cutoff_sequence` integer NOT NULL,
  `retrieved_lesson_ids_json` text NOT NULL,
  `prediction_json` text NOT NULL,
  `outcome_json` text,
  `metrics_json` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `failure_learning_eval_episode_mode_idx` ON `failure_learning_evaluations` (`target_episode_id`,`mode`);
--> statement-breakpoint
CREATE INDEX `failure_learning_eval_created_idx` ON `failure_learning_evaluations` (`created_at`);
--> statement-breakpoint
CREATE TABLE `failure_learning_models` (
  `model_id` text PRIMARY KEY NOT NULL,
  `model_kind` text NOT NULL,
  `feature_schema_version` text NOT NULL,
  `state` text NOT NULL,
  `weights_json` text NOT NULL,
  `bias_micros` integer DEFAULT 0 NOT NULL,
  `trained_episode_count` integer DEFAULT 0 NOT NULL,
  `trained_through_episode_id` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `failure_learning_predictions` (
  `prediction_id` text PRIMARY KEY NOT NULL,
  `episode_id` text NOT NULL,
  `model_id` text NOT NULL,
  `model_version` text NOT NULL,
  `evidence_cutoff_sequence` integer NOT NULL,
  `feature_digest` text NOT NULL,
  `risk_micros` integer NOT NULL,
  `state` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `failure_learning_prediction_episode_idx` ON `failure_learning_predictions` (`episode_id`,`evidence_cutoff_sequence`);
--> statement-breakpoint
CREATE INDEX `failure_learning_prediction_model_idx` ON `failure_learning_predictions` (`model_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `failure_learning_checkpoints` (
  `checkpoint_id` text PRIMARY KEY NOT NULL,
  `dataset_version` text NOT NULL,
  `completed_episode_id` text NOT NULL,
  `episode_count` integer NOT NULL,
  `hypothesis_count` integer NOT NULL,
  `model_id` text,
  `model_digest` text,
  `prevention_metrics_json` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `failure_learning_checkpoint_created_idx` ON `failure_learning_checkpoints` (`created_at`);
