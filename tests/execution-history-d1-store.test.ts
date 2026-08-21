import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { DurableExecutionHistoryBundle } from "../shared/execution-history.ts";
import {
  D1ExecutionHistoryStore,
  executionHistorySchemaSql,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from "../server/workflows/d1-execution-history-store.ts";
import { ExecutionHistoryConflictError } from "../server/workflows/execution-history-store.ts";

class FakeStatement implements D1PreparedStatementLike {
  values: unknown[] = [];
  constructor(
    readonly query: string,
    private readonly firstResult: Record<string, unknown> | null = null,
    private readonly allResults: Record<string, unknown>[] = [],
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  async first<T>() { return this.firstResult as T | null; }
  async all<T>() { return { results: this.allResults as T[] }; }
}

class FakeD1 implements D1DatabaseLike {
  execSql: string[] = [];
  batches: FakeStatement[][] = [];
  failExec = false;
  batchError: Error | null = null;
  executionRow: Record<string, unknown> | null = null;
  eventHead: Record<string, unknown> | null = null;

  prepare(query: string) {
    if (query.includes("SELECT * FROM workflow_executions")) {
      return new FakeStatement(query, this.executionRow);
    }
    if (query.includes("SELECT event_id, sequence FROM workflow_execution_events")) {
      return new FakeStatement(query, this.eventHead);
    }
    return new FakeStatement(query);
  }

  async batch(statements: D1PreparedStatementLike[]) {
    this.batches.push(statements as FakeStatement[]);
    if (this.batchError) throw this.batchError;
    return statements.map(() => ({ success: true }));
  }

  async exec(query: string) {
    if (this.failExec) throw new Error("schema unavailable");
    this.execSql.push(query);
    return { count: 0 };
  }
}

const bundle = (executionId: string): DurableExecutionHistoryBundle => ({
  execution: {
    schema_name: "AIOSDurableExecutionHistory",
    schema_version: "0.1",
    execution_id: executionId,
    scope_key: "global-working-memory",
    capability_id: "cap:internal-runtime-diagnostic",
    workflow_id: "internal-runtime-diagnostic",
    trace_id: null,
    requested_by: null,
    parent_execution_id: null,
    mode: "LIVE",
    status: "QUEUED",
    created_at: "2026-08-20T23:30:00.000Z",
    started_at: null,
    completed_at: null,
    current_stage: null,
    input: {},
    output: null,
    error: null,
    result_class: null,
    authority_owner: "WorkflowExecutionKernel",
    authority_domain: "server-runtime-execution-state",
    authority_state: "execution_truth",
  },
  events: [{
    execution_id: executionId,
    scope_key: "global-working-memory",
    capability_id: "cap:internal-runtime-diagnostic",
    event_id: `${executionId}-event-1`,
    workflow_id: "internal-runtime-diagnostic",
    event_type: "workflow.execution.created",
    status: "QUEUED",
    stage: null,
    sequence: 1,
    emitted_at: "2026-08-20T23:30:00.000Z",
    data: null,
  }],
  links: [],
});

const advancedBundle = (executionId: string) => {
  const value = bundle(executionId);
  value.execution.status = "RUNNING";
  value.execution.started_at = "2026-08-20T23:30:01.000Z";
  value.execution.current_stage = "start";
  value.events.push({
    execution_id: executionId,
    scope_key: "global-working-memory",
    capability_id: "cap:internal-runtime-diagnostic",
    event_id: `${executionId}-event-2`,
    workflow_id: "internal-runtime-diagnostic",
    event_type: "workflow.execution.started",
    status: "RUNNING",
    stage: "start",
    sequence: 2,
    emitted_at: "2026-08-20T23:30:01.000Z",
    data: null,
  });
  return value;
};

const executionRow = (value: DurableExecutionHistoryBundle) => ({
  execution_id: value.execution.execution_id,
  scope_key: value.execution.scope_key,
  capability_id: value.execution.capability_id,
  workflow_id: value.execution.workflow_id,
  trace_id: value.execution.trace_id,
  requested_by: value.execution.requested_by,
  parent_execution_id: value.execution.parent_execution_id,
  mode: value.execution.mode,
  status: value.execution.status,
  created_at: value.execution.created_at,
  started_at: value.execution.started_at,
  completed_at: value.execution.completed_at,
  current_stage: value.execution.current_stage,
  input_json: JSON.stringify(value.execution.input),
  output_json: value.execution.output === null ? null : JSON.stringify(value.execution.output),
  error_json: value.execution.error === null ? null : JSON.stringify(value.execution.error),
  result_class: value.execution.result_class,
  authority_owner: value.execution.authority_owner,
  authority_domain: value.execution.authority_domain,
  authority_state: value.execution.authority_state,
});

test("B02.2 D1 schema initializes the three durable execution-history tables", async () => {
  const db = new FakeD1();
  const store = await new D1ExecutionHistoryStore(db).initialize();
  assert.deepEqual(store.getBackendState(), {
    backend: "D1",
    state: "DURABLE_AVAILABLE",
    reason_code: null,
  });
  assert.equal(db.execSql.length, 1);
  for (const table of ["workflow_executions", "workflow_execution_events", "workflow_execution_links"]) {
    assert.match(executionHistorySchemaSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});

test("B02.2 schema initialization failure is fail-visible", async () => {
  const db = new FakeD1();
  db.failExec = true;
  const store = await new D1ExecutionHistoryStore(db).initialize();
  assert.deepEqual(store.getBackendState(), {
    backend: "D1",
    state: "DURABLE_UNAVAILABLE",
    reason_code: "D1_SCHEMA_UNAVAILABLE",
  });
});

test("B02.2 persistMany keeps events append-only inside one D1 transaction boundary", async () => {
  const db = new FakeD1();
  const store = await new D1ExecutionHistoryStore(db).initialize();
  await store.persistMany([bundle("exec-a"), bundle("exec-b")]);
  assert.equal(db.batches.length, 1);
  const statements = db.batches[0];
  assert.equal(statements.filter((statement) => statement.query.includes("INSERT INTO workflow_executions")).length, 2);
  assert.equal(statements.filter((statement) => statement.query.includes("INSERT INTO workflow_execution_events")).length, 2);
  assert.equal(statements.some((statement) => statement.query.includes("DELETE FROM workflow_execution_events")), false);
  assert.equal(statements.some((statement) => statement.query.includes("DELETE FROM workflow_execution_links")), false);
});

test("B02.2 stale durable prefixes are rejected before a D1 overwrite is attempted", async () => {
  const db = new FakeD1();
  const durable = bundle("exec-stale");
  db.executionRow = executionRow(durable);
  db.eventHead = { event_id: "different-event-at-sequence-1", sequence: 1 };
  const store = await new D1ExecutionHistoryStore(db).initialize();

  await assert.rejects(
    () => store.persistMany([advancedBundle("exec-stale")]),
    (error: unknown) => error instanceof ExecutionHistoryConflictError,
  );
  assert.equal(db.batches.length, 0);
  assert.equal(store.getBackendState().state, "DURABLE_AVAILABLE");
});

test("B02.2 concurrent sequence collisions roll back as logical conflicts without poisoning D1 health", async () => {
  const db = new FakeD1();
  const durable = bundle("exec-race");
  db.executionRow = executionRow(durable);
  db.eventHead = { event_id: durable.events[0].event_id, sequence: 1 };
  db.batchError = new Error(
    "UNIQUE constraint failed: workflow_execution_events.execution_id, workflow_execution_events.sequence",
  );
  const store = await new D1ExecutionHistoryStore(db).initialize();

  await assert.rejects(
    () => store.persistMany([advancedBundle("exec-race")]),
    (error: unknown) => error instanceof ExecutionHistoryConflictError,
  );
  assert.equal(db.batches.length, 1);
  assert.deepEqual(store.getBackendState(), {
    backend: "D1",
    state: "DURABLE_AVAILABLE",
    reason_code: null,
  });
});

test("B02.2 GET error handling reads the post-failure durable backend state", async () => {
  const source = await readFile(new URL("../app/api/workflow-executions/route.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /catch \(error\) \{\s*return handleError\(error, durableRuntime\.getBackendState\(\)\);\s*\}/,
  );
});

test("B02.2 Sites hosting manifest requests the managed D1 DB binding", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(manifest.d1, "DB");
});
