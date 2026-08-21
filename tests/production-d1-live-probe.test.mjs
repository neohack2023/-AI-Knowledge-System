import assert from "node:assert/strict";
import test from "node:test";

const ORIGIN = "https://ai-knowledge-system.neohack.chatgpt.site";
const EXECUTIONS_URL = `${ORIGIN}/api/workflow-executions`;

const readJson = async (response) => {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
};

const summarizeHeaders = (response) => ({
  history: response.headers.get("x-aios-execution-history"),
  backend: response.headers.get("x-aios-execution-history-backend"),
  reason: response.headers.get("x-aios-execution-history-reason"),
  cfRay: response.headers.get("cf-ray"),
  server: response.headers.get("server"),
});

test("production Sites D1 is live and persists one real LIVE execution", { timeout: 45_000 }, async () => {
  const probeId = `p0-2-prod-d1-${process.env.GITHUB_RUN_ID ?? Date.now()}`;

  const inventoryResponse = await fetch(`${EXECUTIONS_URL}?probe=${encodeURIComponent(probeId)}`, {
    cache: "no-store",
    headers: { "cache-control": "no-store" },
  });
  const inventoryBody = await readJson(inventoryResponse);
  console.log("AIOS_PROD_D1_INVENTORY", JSON.stringify({
    probeId,
    status: inventoryResponse.status,
    headers: summarizeHeaders(inventoryResponse),
    body: inventoryBody.json ?? inventoryBody.text,
  }));

  assert.equal(inventoryResponse.status, 200, `production inventory GET failed: ${inventoryBody.text}`);
  assert.equal(
    inventoryResponse.headers.get("x-aios-execution-history"),
    "DURABLE_AVAILABLE",
    `live Site is not reporting durable history: ${inventoryBody.text}`,
  );
  assert.equal(inventoryBody.json?.persistence, "D1_DURABLE", `live Site is not reporting D1_DURABLE: ${inventoryBody.text}`);
  assert.equal(inventoryBody.json?.execution_history?.state, "DURABLE_AVAILABLE");

  const executeResponse = await fetch(EXECUTIONS_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      action: "execute",
      workflow_id: "internal-runtime-diagnostic",
      scope_key: "global-working-memory",
      mode: "LIVE",
      input: {
        probe_id: probeId,
        purpose: "P0-2 B02.2 production D1 verification",
      },
    }),
  });
  const executeBody = await readJson(executeResponse);
  console.log("AIOS_PROD_D1_EXECUTE", JSON.stringify({
    probeId,
    status: executeResponse.status,
    headers: summarizeHeaders(executeResponse),
    body: executeBody.json ?? executeBody.text,
  }));

  assert.equal(executeResponse.status, 201, `production LIVE execution failed: ${executeBody.text}`);
  assert.equal(executeResponse.headers.get("x-aios-execution-history"), "DURABLE_AVAILABLE");
  const executionId = executeBody.json?.execution?.execution_id;
  assert.equal(typeof executionId, "string", `execution_id missing: ${executeBody.text}`);
  assert.ok(executionId.length > 0, "execution_id was empty");

  const readbackResponse = await fetch(`${EXECUTIONS_URL}?execution_id=${encodeURIComponent(executionId)}&probe=${encodeURIComponent(probeId)}-readback`, {
    cache: "no-store",
    headers: {
      "cache-control": "no-store",
      "x-aios-verification-probe": probeId,
    },
  });
  const readbackBody = await readJson(readbackResponse);
  console.log("AIOS_PROD_D1_READBACK", JSON.stringify({
    probeId,
    executionId,
    status: readbackResponse.status,
    headers: summarizeHeaders(readbackResponse),
    body: readbackBody.json ?? readbackBody.text,
  }));

  assert.equal(readbackResponse.status, 200, `production execution readback failed: ${readbackBody.text}`);
  assert.equal(readbackResponse.headers.get("x-aios-execution-history"), "DURABLE_AVAILABLE");
  assert.equal(readbackBody.json?.execution?.execution_id, executionId);
  assert.equal(readbackBody.json?.execution?.scope_key, "global-working-memory");
  assert.equal(readbackBody.json?.execution?.mode, "LIVE");
  assert.equal(readbackBody.json?.execution?.status, "COMPLETED");

  console.log("AIOS_PROD_D1_PROBE_PASS", JSON.stringify({ probeId, executionId }));
});
