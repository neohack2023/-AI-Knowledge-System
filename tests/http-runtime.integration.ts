import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

// Network-level verification of the actual compiled Vinext application routes.
// Each test owns an ephemeral loopback HTTP server and local workerd-backed D1.
const workerRoot = fileURLToPath(new URL("../dist/server/", import.meta.url));
const entry = fileURLToPath(new URL("../dist/server/index.js", import.meta.url));
const migration = new URL("../drizzle/0000_execution_history.sql", import.meta.url);
const scope = "global-working-memory";

async function listModules(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) found.push(...await listModules(full));
    else if (item.isFile() && item.name.endsWith(".js")) found.push(full);
  }
  return found;
}

async function fixture(migrate = true) {
  const all = await listModules(workerRoot);
  // Vinext uses computed dynamic imports. Miniflare's automatic module crawler
  // cannot discover them; explicitly register the generated JS modules instead.
  const modules = [entry, ...all.filter((path) => path !== entry)]
    .map((path) => ({ type: "ESModule" as const, path }));
  const mf = new Miniflare({
    modules, modulesRoot: workerRoot,
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "aios-http-evaluation-local-only" },
    host: "127.0.0.1", port: 0, cf: false, cache: false,
  });
  try {
    const db = await mf.getD1Database("DB");
    if (migrate) {
      const sql = await readFile(migration, "utf8");
      await db.batch(sql.split("--> statement-breakpoint")
        .map((part) => part.trim()).filter(Boolean)
        .map((statement) => db.prepare(statement)));
    }
    const base = await mf.ready;
    return { mf, db, base };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}

const requestJson = async (base: URL, pathname: string, payload?: unknown) => {
  const response = await fetch(new URL(pathname, base), {
    ...(payload === undefined ? {} : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  return { response, body };
};

test("real HTTP: compiled Worker executes LIVE and exposes SQL-backed independent readback", async () => {
  const { mf, db, base } = await fixture();
  try {
    const status = await requestJson(base, "/api/workflow-executions");
    assert.equal(status.response.status, 200);
    assert.equal(status.body.execution_history.state, "DURABLE_AVAILABLE");

    const executed = await requestJson(base, "/api/workflow-executions", {
      action: "execute", workflow_id: "internal-runtime-diagnostic",
      scope_key: scope, mode: "LIVE",
      input: { probe: "http-socket", sample: 17 },
    });
    assert.equal(executed.response.status, 201);
    assert.equal(executed.body.execution.status, "COMPLETED");
    assert.equal(executed.body.execution.output.diagnostic, "PASS");
    const id = executed.body.execution.execution_id;

    // The assertions below bypass the app/API and read real D1 SQL rows.
    const stored = await db.prepare(
      "SELECT status, input_json FROM workflow_executions WHERE execution_id = ?"
    ).bind(id).first();
    assert.equal(stored?.status, "COMPLETED");
    assert.deepEqual(JSON.parse(String(stored?.input_json)), { probe: "http-socket", sample: 17 });
    const eventRows = await db.prepare(
      "SELECT sequence, event_type FROM workflow_execution_events WHERE execution_id = ? ORDER BY sequence"
    ).bind(id).all();
    assert.deepEqual(eventRows.results?.map((e) => e.sequence), executed.body.events.map((e: { sequence: number }) => e.sequence));
    const links = await db.prepare(
      "SELECT link_id FROM workflow_execution_links WHERE execution_id = ?"
    ).bind(id).all();
    assert.equal(links.results?.length, executed.body.provenance_envelopes.length + 1);

    const reread = await requestJson(base, "/api/workflow-executions?execution_id=" + encodeURIComponent(id));
    assert.equal(reread.response.status, 200);
    assert.equal(reread.body.execution.execution_id, id);
    assert.equal(reread.body.execution.status, "COMPLETED");
    const history = await requestJson(base, "/api/execution-history?scope_key=" + scope);
    assert.equal(history.response.status, 200);
    assert.equal(history.body.persistence, "D1_DURABLE");
    assert.ok(history.body.executions.some((e: { execution_id: string }) => e.execution_id === id));
  } finally { await mf.dispose(); }
});

test("real HTTP: scope isolation and invalid inputs fail without an execution record", async () => {
  const { mf, db, base } = await fixture();
  try {
    const denied = await requestJson(base, "/api/execution-history?scope_key=unregistered-scope");
    assert.equal(denied.response.status, 403);
    assert.equal(denied.body.error.code, "EXECUTION_HISTORY_SCOPE_FORBIDDEN");
    const wrongScope = await requestJson(base, "/api/aios-bridge", {
      action: "search", query: "kernel", scope_key: "unregistered-scope",
    });
    assert.equal(wrongScope.response.status, 409);
    assert.equal(wrongScope.body.error.code, "BRIDGE_SCOPE_UNAVAILABLE");
    const invalid = await requestJson(base, "/api/workflow-executions", {
      action: "execute", workflow_id: "internal-runtime-diagnostic",
      scope_key: scope, mode: "SIMULATION",
    });
    assert.equal(invalid.response.status, 409);
    const count = await db.prepare("SELECT COUNT(*) AS n FROM workflow_executions").first();
    assert.equal(count?.n, 0);
  } finally { await mf.dispose(); }
});

test("real HTTP: failing SQL UPDATE keeps execution QUEUED; removal restores forward progress", async () => {
  const { mf, db, base } = await fixture();
  try {
    const created = await requestJson(base, "/api/workflow-executions", {
      action: "create", workflow_id: "internal-runtime-diagnostic",
      scope_key: scope, mode: "LIVE", input: { fault: "sql-update-trigger" },
    });
    assert.equal(created.response.status, 201);
    const id = created.body.execution.execution_id;
    await db.exec("CREATE TRIGGER aios_http_abort BEFORE UPDATE ON workflow_executions BEGIN SELECT RAISE(ABORT, 'AIOS_TEST_UPDATE_ABORT'); END;");
    const failed = await requestJson(base, "/api/workflow-executions", {
      action: "start", execution_id: id,
    });
    assert.equal(failed.response.status, 503);
    assert.equal(failed.body.error.code, "DURABLE_HISTORY_WRITE_FAILED");
    const row = await db.prepare("SELECT status FROM workflow_executions WHERE execution_id = ?").bind(id).first();
    assert.equal(row?.status, "QUEUED");
    const events = await db.prepare("SELECT COUNT(*) AS n FROM workflow_execution_events WHERE execution_id = ?").bind(id).first();
    assert.equal(events?.n, 1);
    await db.exec("DROP TRIGGER aios_http_abort;");
    const resumed = await requestJson(base, "/api/workflow-executions", {
      action: "start", execution_id: id,
    });
    assert.equal(resumed.response.status, 200);
    assert.equal(resumed.body.execution.status, "RUNNING");
  } finally { await mf.dispose(); }
});

test("real HTTP: absent D1 migration exposes unavailable state, never a durable success", async () => {
  const { mf, base } = await fixture(false);
  try {
    const response = await requestJson(base, "/api/workflow-executions");
    assert.equal(response.response.status, 200);
    assert.equal(response.body.execution_history.state, "DURABLE_UNAVAILABLE");
    assert.equal(response.body.persistence, "PROCESS_LOCAL_DEGRADED");
    const history = await requestJson(base, "/api/execution-history");
    assert.equal(history.response.status, 503);
    assert.equal(history.body.persistence, "PROCESS_LOCAL_DEGRADED");
  } finally { await mf.dispose(); }
});
