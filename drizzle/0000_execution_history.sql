CREATE TABLE `workflow_executions` (
	`execution_id` text PRIMARY KEY NOT NULL,
	`scope_key` text NOT NULL,
	`capability_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`trace_id` text,
	`requested_by` text,
	`parent_execution_id` text,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`current_stage` text,
	`input_json` text NOT NULL,
	`output_json` text,
	`error_json` text,
	`result_class` text,
	`authority_owner` text NOT NULL,
	`authority_domain` text NOT NULL,
	`authority_state` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_executions_identity_idx` ON `workflow_executions` (`execution_id`,`scope_key`,`capability_id`);
--> statement-breakpoint
CREATE INDEX `workflow_executions_scope_created_idx` ON `workflow_executions` (`scope_key`,`created_at`);
--> statement-breakpoint
CREATE INDEX `workflow_executions_capability_created_idx` ON `workflow_executions` (`capability_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `workflow_execution_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`scope_key` text NOT NULL,
	`capability_id` text NOT NULL,
	`workflow_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text NOT NULL,
	`stage` text,
	`sequence` integer NOT NULL,
	`emitted_at` text NOT NULL,
	`data_json` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_execution_events_sequence_idx` ON `workflow_execution_events` (`execution_id`,`sequence`);
--> statement-breakpoint
CREATE INDEX `workflow_execution_events_identity_idx` ON `workflow_execution_events` (`execution_id`,`scope_key`,`capability_id`);
--> statement-breakpoint
CREATE TABLE `workflow_execution_links` (
	`link_id` text PRIMARY KEY NOT NULL,
	`execution_id` text NOT NULL,
	`scope_key` text NOT NULL,
	`capability_id` text NOT NULL,
	`link_type` text NOT NULL,
	`target_id` text NOT NULL,
	`source_system` text NOT NULL,
	`authority_owner` text NOT NULL,
	`authority_domain` text NOT NULL,
	`authority_state` text NOT NULL,
	`created_at` text NOT NULL,
	`metadata_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_execution_links_identity_idx` ON `workflow_execution_links` (`execution_id`,`scope_key`,`capability_id`);
--> statement-breakpoint
CREATE INDEX `workflow_execution_links_type_idx` ON `workflow_execution_links` (`link_type`,`target_id`);
