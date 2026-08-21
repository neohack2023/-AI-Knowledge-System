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
  prepare(query: string) { return new FakeStatement(query); }
  async batch(statements: D1PreparedStatementLike[]) {
    this.batches.push(statements as FakeStatement[]);
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
  events: [],
  links: [],
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

test("B02.2 persistMany emits one D1 transactional batch for multiple execution bundles", async () => {
  const db = new FakeD1();
  const store = await new D1ExecutionHistoryStore(db).initialize();
  await store.persistMany([bundle("exec-a"), bundle("exec-b")]);
  assert.equal(db.batches.length, 1);
  const statements = db.batches[0];
  assert.equal(statements.length, 6);
  assert.equal(statements.filter((statement) => statement.query.includes("INSERT INTO workflow_executions")).length, 2);
  assert.equal(statements.filter((statement) => statement.query.includes("DELETE FROM workflow_execution_events")).length, 2);
  assert.equal(statements.filter((statement) => statement.query.includes("DELETE FROM workflow_execution_links")).length, 2);
});

test("B02.2 Sites hosting manifest requests the managed D1 DB binding", async () => {
  const manifest = JSON.parse(await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(manifest.d1, "DB");
});
