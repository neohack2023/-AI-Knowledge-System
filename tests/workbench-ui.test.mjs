import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("workbench stays on existing AIOS API surfaces", async () => {
  const source = await read("app/workbench/workbench.tsx");
  for (const endpoint of ["/api/capabilities", "/api/execution-history", "/api/workflow-executions", "/api/aios-bridge"]) {
    assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(source, /fetch\([^\n]*\/api\/(memory|mason|stone|write|deploy)/i);
});

test("workbench runs only the exact A0 diagnostic supported by the LIVE kernel", async () => {
  const source = await read("app/workbench/workbench.tsx");
  assert.match(source, /mode:\s*"LIVE"/);
  assert.doesNotMatch(source, /mode:\s*"SIMULATION"/);
  assert.match(source, /selectedCapability\?\.capability_id === "cap:internal-runtime-diagnostic"/);
  assert.match(source, /selectedCapability\.workflow_id === "internal-runtime-diagnostic"/);
  assert.match(source, /selectedCapability\.autonomy_band === "A0"/);
  assert.match(source, /selectedCapability\.approval_required === false/);
  assert.match(source, /selectedCapability\.status === "ACTIVE"/);
  assert.match(source, /scopeFilter === "global-working-memory"/);
  assert.match(source, /workflows\?\.execution_history\?\.state === "DURABLE_AVAILABLE"/);
  assert.match(source, /disabled=\{!legalDiagnostic \|\| loading \|\| running\}/);
  assert.match(source, /setRunning\(true\)/);
  assert.match(source, /setRunning\(false\)/);
});

test("workbench makes governance boundaries visible", async () => {
  const source = await read("app/workbench/workbench.tsx");
  assert.match(source, /READ ≠ WRITE/);
  assert.match(source, /ROUTE ≠ AUTHORIZATION/);
  assert.match(source, /The workbench does not invent routes/);
  assert.match(source, /No new memory authority/);
});

test("workbench route is server-auth aware", async () => {
  const page = await read("app/workbench/page.tsx");
  assert.match(page, /oai-authenticated-user-email/);
  assert.match(page, /oai-authenticated-user-full-name/);
});


test("workbench honors wildcard scope and live workflow inventory", async () => {
  const source = await read("app/workbench/workbench.tsx");
  assert.match(source, /scope_allowlist\?\.includes\("\*"\)/);
  assert.match(source, /liveWorkflowIds\.has\(selectedCapability\.workflow_id\)/);
  assert.match(source, /other actions require their separate execution policies/);
});
