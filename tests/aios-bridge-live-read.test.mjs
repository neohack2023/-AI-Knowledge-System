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
