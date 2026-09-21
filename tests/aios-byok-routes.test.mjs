import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { DELETE, GET, POST as connect } from "../app/api/ai-connection/route.ts";
import { POST as chat } from "../app/api/llm/chat/route.ts";

const originalFetch = globalThis.fetch;
const originalSecret = process.env.AIOS_SESSION_SECRET;
const apiKey = `sk-test-${"B".repeat(40)}`;

beforeEach(() => { process.env.AIOS_SESSION_SECRET = "synthetic-route-secret-with-at-least-thirty-two-characters"; });
afterEach(() => { globalThis.fetch = originalFetch; if (originalSecret === undefined) delete process.env.AIOS_SESSION_SECRET; else process.env.AIOS_SESSION_SECRET = originalSecret; });

test("connect validates server-side and returns only masked metadata plus an HttpOnly cookie", async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\.openai\.com\/v1\/models\/gpt-5\.6-luna/);
    return new Response("{}", { status: 200 });
  };
  const response = await connect(new Request("https://example.test/api/ai-connection", {
    method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model: "gpt-5.6-luna" }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.connected, true);
  assert.equal(payload.key_suffix, "BBBB");
  assert.equal("api_key" in payload, false);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.ok(!cookie.includes(apiKey));

  const status = await GET(new Request("https://example.test/api/ai-connection", { headers: { cookie } }));
  assert.equal((await status.json()).connected, true);
  const disconnected = await DELETE(new Request("https://example.test/api/ai-connection", { method: "DELETE", headers: { origin: "https://example.test" } }));
  assert.match(disconnected.headers.get("set-cookie"), /Max-Age=0/);
});

test("invalid key failures never echo the submitted credential", async () => {
  globalThis.fetch = async () => new Response('{"error":{"message":"bad key"}}', { status: 401 });
  const response = await connect(new Request("https://example.test/api/ai-connection", {
    method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model: "gpt-5.6-luna" }),
  }));
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes(apiKey));
});

test("Ask AIOS uses the encrypted session and reports an honest authority envelope", async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/v1/models/")) return new Response("{}", { status: 200 });
    const authorization = new Headers(init?.headers).get("authorization");
    assert.equal(authorization, `Bearer ${apiKey}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false);
    assert.match(body.instructions, /Notion and Drive have not been accessed/);
    return Response.json({ id: "resp_test", output: [{ type: "message", content: [{ type: "output_text", text: "Governed answer." }] }], usage: { total_tokens: 42 } });
  };
  const connected = await connect(new Request("https://example.test/api/ai-connection", {
    method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, model: "gpt-5.6-luna" }),
  }));
  const response = await chat(new Request("https://example.test/api/llm/chat", {
    method: "POST", headers: { origin: "https://example.test", cookie: connected.headers.get("set-cookie"), "content-type": "application/json" },
    body: JSON.stringify({ scope_key: "global-working-memory", messages: [{ role: "user", content: "What is wired?" }] }),
  }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.message, "Governed answer.");
  assert.equal(payload.write_authorization, "NONE");
  assert.deepEqual(payload.connector_access, { notion: false, google_drive: false, github_live: false });
});
