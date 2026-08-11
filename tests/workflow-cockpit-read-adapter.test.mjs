import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("cockpit-read-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/workflow-executions";

const call = async (body) => {
  const response = await worker.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env, ctx);
  return { response, body: await response.json() };
};

const executeDiagnostic = async (input = {}) => call({
  action: "execute",
  workflow_id: "internal-runtime-diagnostic",
  scope_key: "global-working-memory",
  mode: "LIVE",
  input,
});

const cockpitRead = async (executionId, afterSequence = 0, init = {}) => {
  const url = `${endpoint}?view=cockpit&execution_id=${executionId}&after_sequence=${afterSequence}`;
  return worker.fetch(new Request(url, init), env, ctx);
};

test("cockpit read projects a completed kernel snapshot into normalized live UI events", async () => {
  const completed = await executeDiagnostic({ connector_projection_probe: true });
  assert.equal(completed.response.status, 201);
  const executionId = completed.body.execution.execution_id;

  const response = await cockpitRead(executionId);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-aios-event-contract"), "CockpitLiveExecutionReadEnvelope/0.1");
  const envelope = await response.json();

  assert.equal(envelope.schema_name, "CockpitLiveExecutionReadEnvelope");
  assert.equal(envelope.schema_version, "0.1");
  assert.equal(envelope.transport, "LIVE_SERVER_POLL");
  assert.equal(envelope.execution.execution_id, executionId);
  assert.equal(envelope.execution.mode, "LIVE");
  assert.equal(envelope.execution.status, "COMPLETED");
  assert.equal(envelope.execution.display_status, "COMPLETED");
  assert.equal(envelope.cursor.terminal, true);
  assert.equal(envelope.cursor.poll_after_ms, 0);
  assert.equal(envelope.cursor.last_sequence, completed.body.events.length);

  assert.deepEqual(
    envelope.events.map((event) => event.id),
    completed.body.events.map((event) => event.event_id),
  );
  assert.ok(envelope.events.some((event) => event.status === "ACTIVE"));
  assert.ok(envelope.events.some((event) => event.node_id === "retrieval"));
  assert.ok(envelope.events.some((event) => event.node_id === "verification"));
  assert.ok(envelope.events.some((event) => event.node_id === "receipt"));
  const nextAction = envelope.events.find((event) => event.event_type === "next_action.generated");
  assert.equal(nextAction.node_id, "next-action");
  assert.equal(nextAction.next_action_envelope.execution_id, executionId);

  for (const event of envelope.events) {
    assert.equal(event.execution_id, executionId);
    assert.equal(event.scope_key, "global-working-memory");
    assert.match(event.capability, /^workflow:/);
    assert.ok(event.source);
    assert.ok(event.authority);
    assert.ok(event.provenance);
  }

  assert.deepEqual(envelope.authority_context.connector_projections, {
    notion: {
      authority: "MIGRATED_PROJECT_MEMORY",
      access: "NOT_ACCESSED_BY_EXECUTION",
      write_authorization: "NONE",
    },
    drive: {
      authority: "RUNTIME_CONTROL_PLANE_MIRROR",
      access: "NOT_ACCESSED_BY_EXECUTION",
      write_authorization: "NONE",
    },
    github: {
      authority: "REPOSITORY_EXECUTION_TRUTH",
      access: "IMPLEMENTATION_BOUND_ONLY",
      write_authorization: "NONE",
    },
  });
  assert.equal(envelope.provenance.envelope_count, completed.body.provenance_envelopes.length);
});

test("cockpit cursor returns only events after the exclusive sequence", async () => {
  const completed = await executeDiagnostic();
  const executionId = completed.body.execution.execution_id;
  const full = await (await cockpitRead(executionId)).json();
  const partial = await (await cockpitRead(executionId, 3)).json();

  assert.equal(partial.cursor.after_sequence, 3);
  assert.equal(partial.cursor.last_sequence, full.cursor.last_sequence);
  assert.deepEqual(partial.events, full.events.slice(3));
});

test("paused server state is presented as WAITING without changing kernel truth", async () => {
  const created = await call({
    action: "create",
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
  });
  const executionId = created.body.execution.execution_id;
  await call({ action: "start", execution_id: executionId });
  await call({ action: "pause", execution_id: executionId });

  const envelope = await (await cockpitRead(executionId)).json();
  assert.equal(envelope.execution.status, "PAUSED");
  assert.equal(envelope.execution.display_status, "WAITING");
  assert.equal(envelope.events.at(-1).event_type, "workflow.execution.paused");
  assert.equal(envelope.events.at(-1).status, "WAITING");
  assert.equal(envelope.cursor.terminal, false);
  assert.equal(envelope.cursor.poll_after_ms, 500);
});

test("SSE transport emits the same normalized event contract and honors Last-Event-ID", async () => {
  const completed = await executeDiagnostic();
  const executionId = completed.body.execution.execution_id;
  const response = await worker.fetch(new Request(
    `${endpoint}?view=cockpit&execution_id=${executionId}&transport=sse`,
    { headers: { accept: "text/event-stream", "last-event-id": "2" } },
  ), env, ctx);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/event-stream/);
  assert.equal(response.headers.get("x-aios-event-contract"), "CockpitLiveExecutionReadEnvelope/0.1");
  const body = await response.text();
  const ids = body.split("\n").filter((line) => line.startsWith("id: ")).map((line) => Number(line.slice(4)));
  const events = body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
  assert.equal(ids[0], 3);
  assert.equal(events.length, completed.body.events.length - 2);
  assert.equal(events[0].id, completed.body.events[2].event_id);
  assert.equal(events.at(-1).status, "COMPLETED");
});

test("an open SSE read observes kernel events appended by later control requests", async () => {
  const created = await call({
    action: "create",
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
  });
  const executionId = created.body.execution.execution_id;
  const response = await worker.fetch(new Request(
    `${endpoint}?view=cockpit&execution_id=${executionId}&transport=sse`,
    { headers: { accept: "text/event-stream" } },
  ), env, ctx);
  const streamedBody = response.text();

  await call({ action: "start", execution_id: executionId });
  await call({ action: "advance", execution_id: executionId });
  await call({ action: "advance", execution_id: executionId });

  const body = await streamedBody;
  const events = body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
  assert.equal(events[0].event_type, "workflow.execution.created");
  assert.ok(events.some((event) => event.event_type === "diagnostic.computation.completed"));
  assert.ok(events.some((event) => event.event_type === "next_action.generated"));
  assert.equal(events.at(-1).status, "COMPLETED");
});

test("raw snapshot GET remains backward compatible and malformed cursors fail closed", async () => {
  const completed = await executeDiagnostic();
  const executionId = completed.body.execution.execution_id;
  const rawResponse = await worker.fetch(new Request(`${endpoint}?execution_id=${executionId}`), env, ctx);
  const raw = await rawResponse.json();
  assert.ok(raw.execution);
  assert.ok(raw.events[0].event_id);
  assert.equal(raw.schema_name, undefined);

  const invalid = await worker.fetch(new Request(
    `${endpoint}?view=cockpit&execution_id=${executionId}&after_sequence=-1`,
  ), env, ctx);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_REQUEST");
});
