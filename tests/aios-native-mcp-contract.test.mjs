import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const aiosMcp = read("app/aios-mcp/route.ts");
const aiosAlias = read("app/api/aios-mcp/route.ts");
const glassboxMcp = read("app/mcp/route.ts");
const bridge = read("app/api/aios-bridge/route.ts");

test("Cloudflare-native AIOS MCP is isolated from the existing Glassbox MCP", () => {
  assert.match(aiosMcp, /endpoint: "\/aios-mcp"/);
  assert.match(aiosMcp, /alias: "\/api\/aios-mcp"/);
  assert.match(aiosAlias, /from "\.\.\/\.\.\/aios-mcp\/route"/);
  assert.match(glassboxMcp, /SWARM_GLASSBOX_CHATGPT_APP_01/);
  assert.doesNotMatch(glassboxMcp, /AIOS_CLOUDFLARE_NATIVE_MCP_01/);
});

test("AIOS MCP exposes the governed ten-tool surface", () => {
  for (const name of [
    "search",
    "fetch",
    "aios_status",
    "read_execution",
    "read_execution_provenance",
    "run_backend_workflow",
    "failure_learning_status",
    "failure_learning_replay",
    "failure_learning_predict",
    "open_aios_workbench",
  ]) {
    assert.ok(aiosMcp.includes(`name: "${name}"`), `missing MCP tool ${name}`);
  }
  assert.match(aiosMcp, /ui:\/\/aios\/repo-workbench-v0\.3\.html/);
  assert.match(aiosMcp, /text\/html;profile=mcp-app/);
});

test("MCP delegates to the existing bridge and preserves authority boundaries", () => {
  assert.match(aiosMcp, /readBridge/);
  assert.match(aiosMcp, /invokeBridge/);
  assert.match(aiosMcp, /scope_key: SCOPE_KEY/);
  assert.match(aiosMcp, /write_authorization: "NONE"/);
  assert.match(aiosMcp, /A0, process-local, fully reversible LIVE workflow/);
  assert.match(aiosMcp, /grants no Drive\/Notion authority/);
  assert.match(bridge, /governed_write_probe: "BLOCKED"/);
  assert.match(bridge, /destination_write_authorized: false/);
  assert.match(aiosMcp, /failure_learning_predict/);
  assert.match(aiosMcp, /shadow-only online failure-risk model/);
  assert.doesNotMatch(aiosMcp, /name: "failure_learning_(record|train|checkpoint)/);
});

test("internal bridge authentication never trusts an incoming MCP bearer token", () => {
  assert.match(aiosMcp, /process\.env\.AIOS_BRIDGE_TOKEN/);
  assert.match(aiosMcp, /headers\.set\("authorization", `Bearer \$\{token\}`\)/);
  assert.doesNotMatch(aiosMcp, /request\.headers\.get\("authorization"\)/);
});
