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

test("workbench execution is simulation-only in v0.1", async () => {
  const source = await read("app/workbench/workbench.tsx");
  assert.match(source, /mode:\s*"SIMULATION"/);
  assert.doesNotMatch(source, /mode:\s*"LIVE"\s*,/);
  assert.match(source, /approval_required === false/);
  assert.match(source, /status === "ACTIVE"/);
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
