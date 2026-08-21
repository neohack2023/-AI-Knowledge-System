import {
  assertDurableExecutionHistoryBundle,
  assertExecutionHistoryModeConsistency,
  executionHistorySchema,
  type DurableExecutionEvent,
  type DurableExecutionHistoryBundle,
  type DurableExecutionLink,
  type DurableExecutionRecord,
  type ExecutionHistoryBackendState,
  type ExecutionHistoryIdentity,
  type JsonObject,
} from "../../shared/execution-history.ts";
import {
  ExecutionHistoryConflictError,
  assertExecutionHistoryListQuery,
  type ExecutionHistoryListQuery,
  type ExecutionHistoryStore,
} from "./execution-history-store.ts";

export type D1PreparedStatementLike = {
  bind: (...values: unknown[]) => D1PreparedStatementLike;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatementLike;
  batch: (statements: D1PreparedStatementLike[]) => Promise<unknown[]>;
  exec: (query: string) => Promise<unknown>;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS workflow_executions (
  execution_id TEXT PRIMARY KEY NOT NULL,
  scope_key TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  trace_id TEXT,
  requested_by TEXT,
  parent_execution_id TEXT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  current_stage TEXT,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error_json TEXT,
  result_class TEXT,
  authority_owner TEXT NOT NULL,
  authority_domain TEXT NOT NULL,
  authority_state TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_executions_identity_idx
  ON workflow_executions (execution_id, scope_key, capability_id);
CREATE INDEX IF NOT EXISTS workflow_executions_scope_created_idx
  ON workflow_executions (scope_key, created_at);
CREATE INDEX IF NOT EXISTS workflow_executions_capability_created_idx
  ON workflow_executions (capability_id, created_at);

CREATE TABLE IF NOT EXISTS workflow_execution_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  execution_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT,
  sequence INTEGER NOT NULL,
  emitted_at TEXT NOT NULL,
  data_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_execution_events_sequence_idx
  ON workflow_execution_events (execution_id, sequence);
CREATE INDEX IF NOT EXISTS workflow_execution_events_identity_idx
  ON workflow_execution_events (execution_id, scope_key, capability_id);

CREATE TABLE IF NOT EXISTS workflow_execution_links (
  link_id TEXT PRIMARY KEY NOT NULL,
  execution_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  link_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  authority_owner TEXT NOT NULL,
  authority_domain TEXT NOT NULL,
  authority_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS workflow_execution_links_identity_idx
  ON workflow_execution_links (execution_id, scope_key, capability_id);
CREATE INDEX IF NOT EXISTS workflow_execution_links_type_idx
  ON workflow_execution_links (link_type, target_id);
`;

export const executionHistorySchemaSql = SCHEMA_SQL;

type ExecutionRow = {
  execution_id: string;
  scope_key: string;
  capability_id: string;
  workflow_id: string;
  trace_id: string | null;
  requested_by: string | null;
  parent_execution_id: string | null;
  mode: DurableExecutionRecord["mode"];
  status: DurableExecutionRecord["status"];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_stage: string | null;
  input_json: string;
  output_json: string | null;
  error_json: string | null;
  result_class: string | null;
  authority_owner: string;
  authority_domain: string;
  authority_state: DurableExecutionRecord["authority_state"];
};

type EventRow = {
  event_id: string;
  execution_id: string;
  scope_key: string;
  capability_id: string;
  workflow_id: string;
  event_type: string;
  status: DurableExecutionEvent["status"];
  stage: string | null;
  sequence: number;
  emitted_at: string;
  data_json: string | null;
};

type EventHeadRow = { event_id: string; sequence: number };

type LinkRow = {
  link_id: string;
  execution_id: string;
  scope_key: string;
  capability_id: string;
  link_type: DurableExecutionLink["link_type"];
  target_id: string;
  source_system: DurableExecutionLink["source_system"];
  authority_owner: string;
  authority_domain: string;
  authority_state: DurableExecutionLink["authority_state"];
  created_at: string;
  metadata_json: string;
};

const parseJsonObject = (raw: string, field: string): JsonObject => {
  const value = JSON.parse(raw) as unknown;
  if (value === null || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError(`${field} must contain a JSON object.`);
  }
  return value as JsonObject;
};

const parseNullableJsonObject = (raw: string | null, field: string) =>
  raw === null ? null : parseJsonObject(raw, field);

export const executionRecordFromRow = (row: ExecutionRow): DurableExecutionRecord => ({
  schema_name: executionHistorySchema.name,
  schema_version: executionHistorySchema.version,
  execution_id: row.execution_id,
  scope_key: row.scope_key,
  capability_id: row.capability_id,
  workflow_id: row.workflow_id,
  trace_id: row.trace_id,
  requested_by: row.requested_by,
  parent_execution_id: row.parent_execution_id,
  mode: row.mode,
  status: row.status,
  created_at: row.created_at,
  started_at: row.started_at,
  completed_at: row.completed_at,
  current_stage: row.current_stage,
  input: parseJsonObject(row.input_json, "input_json"),
  output: parseNullableJsonObject(row.output_json, "output_json"),
  error: parseNullableJsonObject(row.error_json, "error_json") as DurableExecutionRecord["error"],
  result_class: row.result_class,
  authority_owner: row.authority_owner,
  authority_domain: row.authority_domain,
  authority_state: row.authority_state,
});

const eventFromRow = (row: EventRow): DurableExecutionEvent => ({
  execution_id: row.execution_id,
  scope_key: row.scope_key,
  capability_id: row.capability_id,
  event_id: row.event_id,
  workflow_id: row.workflow_id,
  event_type: row.event_type,
  status: row.status,
  stage: row.stage,
  sequence: row.sequence,
  emitted_at: row.emitted_at,
  data: parseNullableJsonObject(row.data_json, "data_json"),
});

const linkFromRow = (row: LinkRow): DurableExecutionLink => ({
  execution_id: row.execution_id,
  scope_key: row.scope_key,
  capability_id: row.capability_id,
  link_id: row.link_id,
  link_type: row.link_type,
  target_id: row.target_id,
  source_system: row.source_system,
  authority_owner: row.authority_owner,
  authority_domain: row.authority_domain,
  authority_state: row.authority_state,
  created_at: row.created_at,
  metadata: parseJsonObject(row.metadata_json, "metadata_json"),
});

const executionValues = (record: DurableExecutionRecord) => [
  record.execution_id,
  record.scope_key,
  record.capability_id,
  record.workflow_id,
  record.trace_id,
  record.requested_by,
  record.parent_execution_id,
  record.mode,
  record.status,
  record.created_at,
  record.started_at,
  record.completed_at,
  record.current_stage,
  JSON.stringify(record.input),
  record.output === null ? null : JSON.stringify(record.output),
  record.error === null ? null : JSON.stringify(record.error),
  record.result_class,
  record.authority_owner,
  record.authority_domain,
  record.authority_state,
];

const eventValues = (event: DurableExecutionEvent) => [
  event.event_id,
  event.execution_id,
  event.scope_key,
  event.capability_id,
  event.workflow_id,
  event.event_type,
  event.status,
  event.stage,
  event.sequence,
  event.emitted_at,
  event.data === null ? null : JSON.stringify(event.data),
];

const linkValues = (link: DurableExecutionLink) => [
  link.link_id,
  link.execution_id,
  link.scope_key,
  link.capability_id,
  link.link_type,
  link.target_id,
  link.source_system,
  link.authority_owner,
  link.authority_domain,
  link.authority_state,
  link.created_at,
  JSON.stringify(link.metadata),
];

const UPSERT_EXECUTION_SQL = `
INSERT INTO workflow_executions (
  execution_id, scope_key, capability_id, workflow_id, trace_id, requested_by,
  parent_execution_id, mode, status, created_at, started_at, completed_at,
  current_stage, input_json, output_json, error_json, result_class,
  authority_owner, authority_domain, authority_state
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(execution_id) DO UPDATE SET
  scope_key=excluded.scope_key,
  capability_id=excluded.capability_id,
  workflow_id=excluded.workflow_id,
  trace_id=excluded.trace_id,
  requested_by=excluded.requested_by,
  parent_execution_id=excluded.parent_execution_id,
  mode=excluded.mode,
  status=excluded.status,
  created_at=excluded.created_at,
  started_at=excluded.started_at,
  completed_at=excluded.completed_at,
  current_stage=excluded.current_stage,
  input_json=excluded.input_json,
  output_json=excluded.output_json,
  error_json=excluded.error_json,
  result_class=excluded.result_class,
  authority_owner=excluded.authority_owner,
  authority_domain=excluded.authority_domain,
  authority_state=excluded.authority_state
`;

const INSERT_EVENT_SQL = `
INSERT INTO workflow_execution_events (
  event_id, execution_id, scope_key, capability_id, workflow_id, event_type,
  status, stage, sequence, emitted_at, data_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const UPSERT_LINK_SQL = `
INSERT INTO workflow_execution_links (
  link_id, execution_id, scope_key, capability_id, link_type, target_id,
  source_system, authority_owner, authority_domain, authority_state,
  created_at, metadata_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(link_id) DO UPDATE SET
  execution_id=excluded.execution_id,
  scope_key=excluded.scope_key,
  capability_id=excluded.capability_id,
  link_type=excluded.link_type,
  target_id=excluded.target_id,
  source_system=excluded.source_system,
  authority_owner=excluded.authority_owner,
  authority_domain=excluded.authority_domain,
  authority_state=excluded.authority_state,
  created_at=excluded.created_at,
  metadata_json=excluded.metadata_json
`;

const isSequenceConflict = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message)
    && /workflow_execution_events/i.test(message)
    && /(sequence|execution_id)/i.test(message);
};

export class D1ExecutionHistoryStore implements ExecutionHistoryStore {
  readonly backend = "D1" as const;
  private state: ExecutionHistoryBackendState = {
    backend: "D1",
    state: "DURABLE_UNAVAILABLE",
    reason_code: "D1_SCHEMA_UNAVAILABLE",
  };

  constructor(private readonly db: D1DatabaseLike) {}

  async initialize() {
    try {
      await this.db.exec(SCHEMA_SQL);
      this.state = { backend: "D1", state: "DURABLE_AVAILABLE", reason_code: null };
    } catch {
      this.state = { backend: "D1", state: "DURABLE_UNAVAILABLE", reason_code: "D1_SCHEMA_UNAVAILABLE" };
    }
    return this;
  }

  getBackendState(): ExecutionHistoryBackendState {
    return { ...this.state };
  }

  async persist(bundle: DurableExecutionHistoryBundle): Promise<void> {
    await this.persistMany([bundle]);
  }

  async persistMany(bundles: DurableExecutionHistoryBundle[]): Promise<void> {
    if (this.state.state !== "DURABLE_AVAILABLE") {
      throw new Error(`D1 durable execution history is unavailable (${this.state.reason_code ?? "UNKNOWN"}).`);
    }

    const previousSequences = new Map<string, number>();
    try {
      for (const bundle of bundles) {
        assertDurableExecutionHistoryBundle(bundle);
        const existing = await this.readExecutionRecord(bundle.execution.execution_id);
        const head = await this.readEventHead(bundle.execution.execution_id);
        if (existing) {
          assertExecutionHistoryModeConsistency(existing, bundle.execution);
          const sequence = head?.sequence ?? 0;
          const matchingPrefix = sequence === 0
            || bundle.events[sequence - 1]?.event_id === head?.event_id;
          if (!matchingPrefix || bundle.events.length <= sequence) {
            throw new ExecutionHistoryConflictError();
          }
          previousSequences.set(bundle.execution.execution_id, sequence);
        } else {
          if (head) throw new ExecutionHistoryConflictError("Event history exists without its parent execution record.");
          previousSequences.set(bundle.execution.execution_id, 0);
        }
      }

      const statements: D1PreparedStatementLike[] = [];
      for (const bundle of bundles) {
        const previousSequence = previousSequences.get(bundle.execution.execution_id) ?? 0;
        statements.push(this.db.prepare(UPSERT_EXECUTION_SQL).bind(...executionValues(bundle.execution)));
        bundle.links.forEach((link) => {
          statements.push(this.db.prepare(UPSERT_LINK_SQL).bind(...linkValues(link)));
        });
        bundle.events
          .filter((event) => event.sequence > previousSequence)
          .forEach((event) => {
            statements.push(this.db.prepare(INSERT_EVENT_SQL).bind(...eventValues(event)));
          });
      }

      await this.db.batch(statements);
    } catch (error) {
      if (error instanceof ExecutionHistoryConflictError) throw error;
      if (isSequenceConflict(error)) {
        throw new ExecutionHistoryConflictError();
      }
      this.state = { backend: "D1", state: "DURABLE_UNAVAILABLE", reason_code: "D1_WRITE_FAILED" };
      throw error;
    }
  }

  async get(identity: ExecutionHistoryIdentity): Promise<DurableExecutionHistoryBundle | null> {
    const bundle = await this.getByExecutionId(identity.execution_id);
    if (!bundle) return null;
    if (
      bundle.execution.scope_key !== identity.scope_key
      || bundle.execution.capability_id !== identity.capability_id
    ) return null;
    return bundle;
  }

  async getByExecutionId(executionId: string): Promise<DurableExecutionHistoryBundle | null> {
    if (!executionId.trim()) throw new TypeError("execution_id must be a non-empty string.");
    try {
      const execution = await this.readExecutionRecord(executionId);
      if (!execution) return null;
      const eventsResult = await this.db
        .prepare("SELECT * FROM workflow_execution_events WHERE execution_id = ? ORDER BY sequence ASC")
        .bind(executionId)
        .all<EventRow>();
      const linksResult = await this.db
        .prepare("SELECT * FROM workflow_execution_links WHERE execution_id = ? ORDER BY created_at ASC, link_id ASC")
        .bind(executionId)
        .all<LinkRow>();
      const bundle: DurableExecutionHistoryBundle = {
        execution,
        events: (eventsResult.results ?? []).map(eventFromRow),
        links: (linksResult.results ?? []).map(linkFromRow),
      };
      assertDurableExecutionHistoryBundle(bundle);
      return bundle;
    } catch (error) {
      this.state = { backend: "D1", state: "DURABLE_UNAVAILABLE", reason_code: "D1_READ_FAILED" };
      throw error;
    }
  }

  async list(query: ExecutionHistoryListQuery): Promise<DurableExecutionRecord[]> {
    assertExecutionHistoryListQuery(query);
    try {
      const clauses = ["scope_key = ?"];
      const values: unknown[] = [query.scope_key];
      if (query.capability_id) {
        clauses.push("capability_id = ?");
        values.push(query.capability_id);
      }
      if (query.mode) {
        clauses.push("mode = ?");
        values.push(query.mode);
      }
      values.push(query.limit ?? 100);
      const sql = `SELECT * FROM workflow_executions WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC, execution_id DESC LIMIT ?`;
      const result = await this.db.prepare(sql).bind(...values).all<ExecutionRow>();
      return (result.results ?? []).map(executionRecordFromRow);
    } catch (error) {
      this.state = { backend: "D1", state: "DURABLE_UNAVAILABLE", reason_code: "D1_READ_FAILED" };
      throw error;
    }
  }

  private async readExecutionRecord(executionId: string) {
    const row = await this.db
      .prepare("SELECT * FROM workflow_executions WHERE execution_id = ? LIMIT 1")
      .bind(executionId)
      .first<ExecutionRow>();
    return row ? executionRecordFromRow(row) : null;
  }

  private async readEventHead(executionId: string) {
    return this.db
      .prepare("SELECT event_id, sequence FROM workflow_execution_events WHERE execution_id = ? ORDER BY sequence DESC LIMIT 1")
      .bind(executionId)
      .first<EventHeadRow>();
  }
}
