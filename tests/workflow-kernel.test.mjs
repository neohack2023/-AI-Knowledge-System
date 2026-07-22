import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("kernel-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/workflow-executions";
const traceEndpoint = "http://localhost/api/observability-traces";

const request = async (body) => {
  const response = await worker.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "oai-authenticated-user-email": "kernel-test@example.com" },
    body: JSON.stringify(body),
  }), env, ctx);
  return { response, body: await response.json() };
};

test("server generates ID and retains execution independently of React", async () => {
  const created = await request({
    action: "create", execution_id: "client-forged-id", workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory", mode: "LIVE", input: { proof: true },
  });
  assert.equal(created.response.status, 201);
  assert.notEqual(created.body.execution.execution_id, "client-forged-id");
  assert.match(created.body.execution.execution_id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.body.execution.requested_by, "kernel-test@example.com");
  assert.equal(created.body.trace.system_active, true);
  assert.equal(created.body.trace.intent.status, "NOT_OBSERVED");
  assert.equal(created.body.trace.scope_resolution.status, "REQUESTED_ONLY");

  const fetched = await worker.fetch(new Request(`${endpoint}?execution_id=${created.body.execution.execution_id}`), env, ctx);
  const snapshot = await fetched.json();
  assert.equal(snapshot.execution.execution_id, created.body.execution.execution_id);
  assert.equal(snapshot.execution.status, "QUEUED");
  assert.equal(snapshot.trace.execution_id, created.body.execution.execution_id);
});

test("internal diagnostic executes real server-side computation and records truthful read provenance", async () => {
  const result = await request({
    action: "execute", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory",
    mode: "LIVE", input: { beta: 2, alpha: 1 },
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.execution.status, "COMPLETED");
  assert.equal(result.body.execution.output.executed_on, "server");
  assert.equal(result.body.execution.output.diagnostic, "PASS");
  assert.match(result.body.execution.output.input_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.body.execution.output.external_systems_accessed, []);
  assert.ok(result.body.events.some((event) => event.event_type === "diagnostic.computation.completed"));

  assert.equal(result.body.trace.status, "COMPLETED");
  assert.equal(result.body.trace.intent.status, "NOT_OBSERVED");
  assert.equal(result.body.trace.scope_resolution.status, "REQUESTED_ONLY");
  assert.equal(result.body.trace.source_reads.length, 1);
  assert.equal(result.body.trace.source_reads[0].system, "TRANSIENT_CONTEXT");
  assert.equal(result.body.trace.source_reads[0].authority_role, "TRANSIENT");
  assert.equal(result.body.trace.source_reads[0].resource, "workflow_execution.input");
  assert.equal(result.body.trace.metrics.source_reads_by_system.TRANSIENT_CONTEXT, 1);
  assert.equal(result.body.trace.metrics.packet_count, 0);
  assert.equal(result.body.trace.metrics.preference_applied_count, 0);
  assert.ok(result.body.trace.events.some((event) => event.event_type === "source.read"));

  const traceResponse = await worker.fetch(
    new Request(`${traceEndpoint}?execution_id=${result.body.execution.execution_id}`),
    env,
    ctx,
  );
  const tracePayload = await traceResponse.json();
  assert.equal(traceResponse.status, 200);
  assert.equal(tracePayload.trace.trace_id, result.body.trace.trace_id);
  assert.equal(tracePayload.observability.read_only, true);
  assert.equal(tracePayload.observability.persistence, "PROCESS_LOCAL");
  assert.equal(tracePayload.observability.source_read_and_authority_are_distinct, true);
});

test("unknown LIVE workflow fails safely without simulation fallback", async () => {
  const result = await request({
    action: "create", workflow_id: "unknown-workflow", scope_key: "global-working-memory", mode: "LIVE",
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.execution.status, "FAILED");
  assert.equal(result.body.execution.error.code, "LIVE_HANDLER_UNAVAILABLE");
  assert.equal(result.body.execution.mode, "LIVE");
  assert.equal(result.body.trace.status, "FAILED");
  assert.equal(result.body.trace.source_reads.length, 0);
});

test("cancel changes the server-owned execution state", async () => {
  const created = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "LIVE",
  });
  const cancelled = await request({ action: "cancel", execution_id: created.body.execution.execution_id });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.execution.status, "CANCELLED");
  assert.ok(cancelled.body.execution.completed_at);
  assert.equal(cancelled.body.events.at(-1).event_type, "workflow.execution.cancelled");
  assert.equal(cancelled.body.trace.status, "CANCELLED");
});

test("start, advance, pause, resume, complete, and fail enforce server transitions", async () => {
  const created = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "LIVE",
    input: { transition: "proof" },
  });
  const id = created.body.execution.execution_id;
  const started = await request({ action: "start", execution_id: id });
  assert.equal(started.body.execution.status, "RUNNING");
  assert.equal(started.body.execution.current_stage, "compute");

  const paused = await request({ action: "pause", execution_id: id });
  assert.equal(paused.body.execution.status, "PAUSED");
  const resumed = await request({ action: "resume", execution_id: id });
  assert.equal(resumed.body.execution.status, "RUNNING");
  const advanced = await request({ action: "advance", execution_id: id });
  assert.equal(advanced.body.execution.current_stage, "finalize");
  assert.match(advanced.body.execution.output.input_sha256, /^[0-9a-f]{64}$/);

  const completed = await request({ action: "complete", execution_id: id, output: { manually_completed: true } });
  assert.equal(completed.body.execution.status, "COMPLETED");
  assert.deepEqual(completed.body.execution.output, { manually_completed: true });
  assert.equal(completed.body.trace.status, "COMPLETED");

  const second = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "LIVE",
  });
  const failed = await request({
    action: "fail", execution_id: second.body.execution.execution_id,
    error: { code: "TEST_FAILURE", message: "Expected controlled failure." },
  });
  assert.equal(failed.body.execution.status, "FAILED");
  assert.equal(failed.body.execution.error.code, "TEST_FAILURE");
  assert.equal(failed.body.trace.status, "FAILED");
});

test("simulation remains separate from the server kernel", async () => {
  const result = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "SIMULATION",
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, "SIMULATION_TRANSPORT_SEPARATE");
});
