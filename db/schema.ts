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
