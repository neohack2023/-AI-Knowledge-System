import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("bridge-live-read", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const bridge = "http://localhost/api/aios-bridge";

const post = async (payload) => {
  const response = await worker.fetch(new Request(bridge, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), env, ctx);
  return { response, body: await response.json() };
};

test("context search returns fetch-equivalent text in one bounded read while default search stays compact", async () => {
  const compact = await post({ action: "search", query: "workflow", limit: 2 });
  const context = await post({ action: "search", query: "workflow", limit: 2, include_text: true });
  assert.equal(context.response.status, 200);
  assert.equal(compact.response.status, 200);
  assert.ok(context.body.results.length > 0);
  assert.ok(context.body.results.length <= 2);
  assert.deepEqual(context.body.results.map(({ id }) => id), compact.body.results.map(({ id }) => id));
  for (const item of compact.body.results) assert.equal(Object.hasOwn(item, "text"), false);
  for (const item of context.body.results) {
    const fetched = await post({ action: "fetch", id: item.id });
    assert.equal(item.text, fetched.body.text);
    assert.equal(item.url, fetched.body.url);
    assert.equal(item.metadata.authority, fetched.body.metadata.authority);
    assert.equal(item.scope_key, fetched.body.metadata.scope_key);
    assert.equal(item.coverage, fetched.body.metadata.coverage);
    assert.equal(item.write_authorization, "NONE");
  }
});

test("context search preserves scope rejection, no-match behavior and strict opt-in", async () => {
  const wrongScope = await post({ action: "search", query: "workflow", include_text: true, scope_key: "unregistered-fixture" });
  assert.equal(wrongScope.response.status, 409);
  const missing = await post({ action: "search", query: "zzzznomatchfixture", include_text: true });
  assert.deepEqual(missing.body.results, []);
  const malformed = await post({ action: "search", query: "workflow", include_text: "true" });
  assert.equal(malformed.response.status, 400);
  assert.equal(malformed.body.error.code, "INVALID_INCLUDE_TEXT");
});

test("repository search and fetch do not consult the durable execution runtime", async () => {
  const key = "__aiKnowledgeDurableWorkflowRuntimePromise";
  const previous = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    get() { throw new Error("Execution storage must not gate repository reads"); },
  });
  try {
    const result = await post({ action: "search", query: "workflow", include_text: true, limit: 1 });
    assert.equal(result.response.status, 200);
    const fetched = await post({ action: "fetch", id: result.body.results[0].id });
    assert.equal(fetched.response.status, 200);
  } finally {
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete globalThis[key];
  }
});

test("bridge exposes exact execution and execution-bound provenance as read-only projections", async () => {
  const executed = await post({
    action: "execute_safe_workflow",
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    input: { source: "bridge-live-read-test" },
  });
  assert.equal(executed.response.status, 201);
  const executionId = executed.body.snapshot.execution.execution_id;
  const envelopeId = executed.body.snapshot.provenance_envelopes[0].envelope_id;

  const readExecution = await post({ action: "read_execution", execution_id: executionId });
  assert.equal(readExecution.response.status, 200);
  assert.equal(readExecution.body.contract, "AIOSChatBridge/0.2");
  assert.equal(readExecution.body.authority, "WORKFLOW_EXECUTION_KERNEL");
  assert.equal(readExecution.body.write_authorization, "NONE");
  assert.equal(readExecution.body.snapshot.execution.execution_id, executionId);
  assert.equal(readExecution.body.snapshot.execution.status, "COMPLETED");

  const readProvenance = await post({
    action: "read_execution_provenance",
    execution_id: executionId,
    provenance_envelope_id: envelopeId,
  });
  assert.equal(readProvenance.response.status, 200);
  assert.equal(readProvenance.body.write_authorization, "NONE");
  assert.equal(readProvenance.body.provenance.envelope_id, envelopeId);
  assert.equal(readProvenance.body.provenance.used_by_execution_id, executionId);
  assert.equal(readProvenance.body.provenance.validity, "VALID");
});

test("bridge provenance read fails closed for unknown execution evidence", async () => {
  const result = await post({
    action: "read_execution_provenance",
    execution_id: crypto.randomUUID(),
    provenance_envelope_id: crypto.randomUUID(),
  });
  assert.equal(result.response.status, 404);
  assert.equal(result.body.error.code, "EXECUTION_NOT_FOUND");
});
