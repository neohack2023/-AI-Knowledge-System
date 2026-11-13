import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { WorkflowExecutionKernel } from "../server/workflows/kernel.ts";
import { DurableWorkflowRuntime } from "../server/workflows/durable-runtime.ts";
import { D1ExecutionHistoryStore } from "../server/workflows/d1-execution-history-store.ts";
import { listDurableExecutionHistory } from "../server/workflows/execution-history-store.ts";

// Actual workerd-backed D1 SQLite. No production credentials, remote database,
// repository clone, shared state path, or fake prepared statements.
const scope = "global-working-memory";
const workflowId = "internal-runtime-diagnostic";
const capability = "cap:internal-runtime-diagnostic";
const makeFixture = async ({ migrate = true } = {}) => {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("READY"); } };',
    // Pinned workerd@1.20260515.1 supports up to 2026-05-22.
    compatibilityDate: "2026-05-22",
    d1Databases: { DB: "aios-isolated-evaluation" },
  });
  try {
    const db = await mf.getD1Database("DB");
    if (migrate) {
      const migration = await readFile(new URL("../drizzle/0000_execution_history.sql", import.meta.url), "utf8");
      const statements = migration.split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean);
      await db.batch(statements.map((statement) => db.prepare(statement)));
    }
    return { mf, db };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
};
const makeRuntime = async (db: Awaited<ReturnType<typeof makeFixture>>["db"]) => {
  const store = await new D1ExecutionHistoryStore(db).initialize();
  const runtime = new DurableWorkflowRuntime(
    new WorkflowExecutionKernel(), store,
    (id) => id === workflowId ? capability : null,
  );
  return { store, runtime };
};
const execute = async (runtime: DurableWorkflowRuntime, input: Record<string, unknown>) => {
  const created = await runtime.createExecution({
    workflow_id: workflowId, scope_key: scope, mode: "LIVE", input,
  });
  return runtime.runToCompletion(created.execution.execution_id);
};

test("real D1: execute, persist SQL rows, and independently hydrate another kernel", async () => {
  const { mf, db } = await makeFixture();
  try {
    const { store, runtime } = await makeRuntime(db);
    assert.equal(store.getBackendState().state, "DURABLE_AVAILABLE");
    const done = await execute(runtime, { probe: "real-sqlite", alpha: 1 });
    assert.equal(done.execution.status, "COMPLETED");
    assert.equal(done.execution.output?.diagnostic, "PASS");
    assert.equal(done.provenance_envelopes.length, 2);
    const id = done.execution.execution_id;
    const row = await db.prepare("SELECT status, input_json FROM workflow_executions WHERE execution_id = ?").bind(id).first();
    assert.equal(row?.status, "COMPLETED");
    assert.equal(JSON.parse(String(row?.input_json)).probe, "real-sqlite");
    const events = await db.prepare("SELECT sequence, event_type FROM workflow_execution_events WHERE execution_id = ? ORDER BY sequence").bind(id).all();
    assert.deepEqual(events.results?.map((r) => r.sequence), done.events.map((e) => e.sequence));
    const links = await db.prepare("SELECT link_id FROM workflow_execution_links WHERE execution_id = ?").bind(id).all();
    assert.equal(links.results?.length, done.provenance_envelopes.length + 1);
    const second = await makeRuntime(db);
    const restored = await second.runtime.getExecution(id);
    assert.deepEqual(restored, done);
    const history = await listDurableExecutionHistory(second.store, { scope_key: scope, limit: 10 });
    assert.equal(history.some((h) => h.execution_id === id && h.status === "COMPLETED"), true);
  } finally {
    await mf.dispose();
  }
});

test("real D1: missing SQL migration is an explicit unavailable environment", async () => {
  const { mf, db } = await makeFixture({ migrate: false });
  try {
    const { store } = await makeRuntime(db);
    assert.equal(store.getBackendState().state, "DURABLE_UNAVAILABLE");
    assert.equal(store.getBackendState().reason_code, "D1_SCHEMA_UNAVAILABLE");
    assert.equal(store.getBackendState().reason_detail, "SQLITE_MISSING_OBJECT");
  } finally {
    await mf.dispose();
  }
});

test("real D1: injected SQL write failure rolls back rows and does not promote kernel state", async () => {
  const { mf, db } = await makeFixture();
  try {
    const { runtime } = await makeRuntime(db);
    const created = await runtime.createExecution({
      workflow_id: workflowId, scope_key: scope, mode: "LIVE", input: { fault: "db-trigger" },
    });
    const id = created.execution.execution_id;
    await db.exec("CREATE TRIGGER aios_eval_abort BEFORE UPDATE ON workflow_executions BEGIN SELECT RAISE(ABORT, 'AIOS_EVAL_INJECTED_FAILURE'); END;");
    await assert.rejects(() => runtime.start(id));
    await db.exec("DROP TRIGGER aios_eval_abort;");
    const recovered = await makeRuntime(db);
    const persisted = await recovered.runtime.getExecution(id);
    assert.equal(persisted.execution.status, "QUEUED");
    assert.equal(persisted.events.length, 1);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM workflow_execution_events WHERE execution_id = ?").bind(id).first();
    assert.equal(count?.n, 1);
    const restarted = await recovered.runtime.runToCompletion(id);
    assert.equal(restarted.execution.status, "COMPLETED");
  } finally {
    await mf.dispose();
  }
});
