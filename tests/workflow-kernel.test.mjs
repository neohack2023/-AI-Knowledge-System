import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("kernel-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/workflow-executions";

const request = async (body) => {
  const response = await worker.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "oai-authenticated-user-email": "kernel-test@example.com" },
    body: JSON.stringify(body),
  }), env, ctx);
  return { response, body: await response.json() };
};

const executeDiagnostic = (input = {}) => request({
  action: "execute",
  workflow_id: "internal-runtime-diagnostic",
  scope_key: "global-working-memory",
  mode: "LIVE",
  input,
});

test("server generates ID and retains execution independently of React", async () => {
  const created = await request({
    action: "create", execution_id: "client-forged-id", workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory", mode: "LIVE", input: { proof: true },
  });
  assert.equal(created.response.status, 201);
  assert.notEqual(created.body.execution.execution_id, "client-forged-id");
  assert.match(created.body.execution.execution_id, /^[0-9a-f-]{36}$/i);
  assert.equal(created.body.execution.requested_by, "kernel-test@example.com");
  assert.equal(created.body.execution.parent_execution_id, null);

  const fetched = await worker.fetch(new Request(`${endpoint}?execution_id=${created.body.execution.execution_id}`), env, ctx);
  const snapshot = await fetched.json();
  assert.equal(snapshot.execution.execution_id, created.body.execution.execution_id);
  assert.equal(snapshot.execution.status, "QUEUED");
});

test("internal diagnostic executes real server-side computation and emits legal next actions", async () => {
  const result = await executeDiagnostic({ beta: 2, alpha: 1 });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.execution.status, "COMPLETED");
  assert.equal(result.body.execution.output.executed_on, "server");
  assert.equal(result.body.execution.output.diagnostic, "PASS");
  assert.match(result.body.execution.output.input_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.body.execution.output.external_systems_accessed, []);
  assert.equal(result.body.execution.result_class, "DIAGNOSTIC_COMPLETE");
  assert.equal(result.body.execution.next_action_envelope.recommended_action, "INSPECT_DIAGNOSTIC");
  assert.deepEqual(
    result.body.execution.next_action_envelope.available_actions.map((action) => action.command),
    ["INSPECT_DIAGNOSTIC", "RERUN_DIAGNOSTIC", "CLOSE_EXECUTION"],
  );
  assert.ok(result.body.events.some((event) => event.event_type === "diagnostic.computation.completed"));
  assert.ok(result.body.events.some((event) => event.event_type === "next_action.generated"));
});

test("safe selected follow-up creates a same-scope child execution", async () => {
  const completed = await executeDiagnostic({ source: "parent" });
  const parentId = completed.body.execution.execution_id;

  const selected = await request({
    action: "select_next_action",
    execution_id: parentId,
    command: "RERUN_DIAGNOSTIC",
  });
  assert.equal(selected.response.status, 200);
  assert.equal(selected.body.execution.selected_next_action.decision, "SELECTED");
  assert.equal(selected.body.execution.selected_next_action.target_workflow_id, "internal-runtime-diagnostic");
  assert.equal(selected.body.events.at(-1).event_type, "next_action.selected");

  const child = await request({
    action: "spawn_next_action",
    execution_id: parentId,
    input: { source: "follow-up" },
  });
  assert.equal(child.response.status, 201);
  assert.equal(child.body.execution.status, "QUEUED");
  assert.equal(child.body.execution.workflow_id, "internal-runtime-diagnostic");
  assert.equal(child.body.execution.scope_key, "global-working-memory");
  assert.equal(child.body.execution.parent_execution_id, parentId);
  assert.equal(child.body.execution.input.source, "follow-up");
  assert.deepEqual(child.body.execution.input.follow_up, {
    parent_execution_id: parentId,
    command: "RERUN_DIAGNOSTIC",
  });

  const parent = await worker.fetch(new Request(`${endpoint}?execution_id=${parentId}`), env, ctx);
  const parentSnapshot = await parent.json();
  assert.equal(parentSnapshot.execution.selected_next_action.child_execution_id, child.body.execution.execution_id);
  assert.equal(parentSnapshot.events.at(-1).event_type, "next_action.execution_created");
});

test("terminal advisory action cannot be spawned as another workflow", async () => {
  const completed = await executeDiagnostic();
  const parentId = completed.body.execution.execution_id;
  const selected = await request({
    action: "select_next_action",
    execution_id: parentId,
    command: "CLOSE_EXECUTION",
  });
  assert.equal(selected.response.status, 200);

  const spawn = await request({ action: "spawn_next_action", execution_id: parentId });
  assert.equal(spawn.response.status, 409);
  assert.equal(spawn.body.error.code, "NEXT_ACTION_NOT_SPAWNABLE");
});

test("unknown or blocked follow-up commands fail closed", async () => {
  const completed = await executeDiagnostic();
  const parentId = completed.body.execution.execution_id;
  const unknown = await request({
    action: "select_next_action",
    execution_id: parentId,
    command: "WRITE_CANON_NOW",
  });
  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.body.error.code, "NEXT_ACTION_NOT_FOUND");
});

test("unknown LIVE workflow fails safely without simulation fallback", async () => {
  const result = await request({
    action: "create", workflow_id: "unknown-workflow", scope_key: "global-working-memory", mode: "LIVE",
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.execution.status, "FAILED");
  assert.equal(result.body.execution.error.code, "LIVE_HANDLER_UNAVAILABLE");
  assert.equal(result.body.execution.mode, "LIVE");
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

  const manuallyCompleted = await request({ action: "complete", execution_id: id, output: { manually_completed: true } });
  assert.equal(manuallyCompleted.body.execution.status, "COMPLETED");
  assert.deepEqual(manuallyCompleted.body.execution.output, { manually_completed: true });
  assert.equal(manuallyCompleted.body.execution.result_class, "DIAGNOSTIC_COMPLETE");
  assert.ok(manuallyCompleted.body.execution.next_action_envelope);

  const second = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "LIVE",
  });
  const failed = await request({
    action: "fail", execution_id: second.body.execution.execution_id,
    error: { code: "TEST_FAILURE", message: "Expected controlled failure." },
  });
  assert.equal(failed.body.execution.status, "FAILED");
  assert.equal(failed.body.execution.error.code, "TEST_FAILURE");
  assert.equal(failed.body.execution.next_action_envelope, null);
});

test("simulation remains separate from the server kernel", async () => {
  const result = await request({
    action: "create", workflow_id: "internal-runtime-diagnostic", scope_key: "global-working-memory", mode: "SIMULATION",
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, "SIMULATION_TRANSPORT_SEPARATE");
});
