import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const page = read("app/page.tsx");
const cockpit = read("app/current-cockpit.tsx");
const historyRoute = read("app/api/execution-history/route.ts");
const runtimeInstance = read("server/workflows/durable-runtime-instance.ts");

test("root site renders the current cockpit with authenticated opener identity", () => {
  assert.match(page, /import \{ headers \} from "next\/headers"/);
  assert.match(page, /oai-authenticated-user-email/);
  assert.match(page, /oai-authenticated-user-full-name/);
  assert.match(page, /<CurrentCockpit viewer=\{fullName \?\? email\} \/>/);
  assert.doesNotMatch(page, /<Cockpit \/>/);
});

test("current cockpit active navigation maps only to real runtime-backed surfaces", () => {
  for (const label of ["Overview", "Execution", "Capabilities", "Repository", "GoG 2D→3D Lab"]) {
    assert.match(cockpit, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const endpoint of [
    "/api/workflow-executions",
    "/api/capabilities",
    "/api/aios-bridge",
    "/api/execution-history?scope_key=global-working-memory&limit=25",
  ]) {
    assert.ok(cockpit.includes(endpoint), `missing runtime-backed endpoint ${endpoint}`);
  }
  assert.ok(cockpit.includes("PLANNED / NOT YET WIRED"));
  assert.ok(cockpit.includes("Deferred domains"));
});

test("live diagnostic is fail-closed behind positive D1 durability", () => {
  assert.match(cockpit, /const d1Ready = backendState\?\.state === "DURABLE_AVAILABLE" && persistence === "D1_DURABLE"/);
  assert.match(cockpit, /disabled=\{!d1Ready\}/);
  assert.match(cockpit, /workflow_id: "internal-runtime-diagnostic"/);
  assert.match(cockpit, /mode: "LIVE"/);
  assert.ok(cockpit.includes("Fresh-runtime restoration must still be tested separately"));
});

test("durable history list endpoint fails visibly when D1 is unavailable", () => {
  assert.match(runtimeInstance, /export const getExecutionHistoryStore = \(\) => storePromise/);
  assert.match(historyRoute, /listDurableExecutionHistory/);
  assert.match(historyRoute, /state\.state !== "DURABLE_AVAILABLE"/);
  assert.match(historyRoute, /"PROCESS_LOCAL_DEGRADED"/);
  assert.match(historyRoute, /503/);
  assert.match(historyRoute, /"D1_DURABLE"/);
  assert.match(historyRoute, /"cache-control": "no-store"/);
});

test("aspirational domains are explicitly deferred instead of rendered as fake pages", () => {
  for (const label of ["Memory", "Research", "Assets", "Sources", "Project Scope", "Memory Objects", "Migration Ledger", "MASON Episodes", "Agent Traces"]) {
    assert.ok(cockpit.includes(`["${label}"`) || cockpit.includes(`[\"${label}\"`), `${label} should be listed in the deferred-domain contract`);
  }
  assert.ok(cockpit.includes("Visible technical debt, not inert navigation pretending to be complete."));
});
