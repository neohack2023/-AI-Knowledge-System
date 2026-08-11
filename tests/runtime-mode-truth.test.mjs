import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("one shared runtime mode model defines every truthful cockpit mode", async () => {
  const model = await read("../shared/runtime-mode.ts");
  for (const mode of ["IDLE", "SIMULATION", "LIVE", "REPLAY", "BLOCKED", "FAILED"]) {
    assert.match(model, new RegExp(`\\"${mode}\\"`));
  }

  const [runtime, cockpit, serverTypes] = await Promise.all([
    read("../app/runtime.ts"),
    read("../app/cockpit.tsx"),
    read("../server/workflows/types.ts"),
  ]);
  assert.doesNotMatch(`${runtime}\n${cockpit}\n${serverTypes}`, /export type EventMode\s*=|export type WorkflowExecutionMode\s*=\s*"LIVE"/);
  assert.match(cockpit, /runtimeModePresentation\[mode\]/);
});

test("SimulationEventTransport cannot present live trace or live execution labels", async () => {
  const [model, runtime, cockpit] = await Promise.all([
    read("../shared/runtime-mode.ts"),
    read("../app/runtime.ts"),
    read("../app/cockpit.tsx"),
  ]);
  assert.match(runtime, /class SimulationEventTransport[\s\S]*readonly mode: RuntimeMode = "SIMULATION"/);
  assert.match(model, /traceLabel: "SIMULATION TRACE"/);
  assert.match(model, /pathLabel: "SIMULATED WORKFLOW PATH"/);
  assert.doesNotMatch(cockpit, />LIVE TRACE</);
  assert.doesNotMatch(cockpit, />LIVE MINDMAP EXECUTION</);
  assert.match(cockpit, /new SimulationEventTransport/);
  assert.match(cockpit, /setMode\(nextTransport\.mode\)/);
  assert.match(cockpit, /definition\.executionModes\?\.includes\("LIVE"\)/);
});

test("fabricated and static cockpit facts carry explicit truth labels", async () => {
  const [cockpit, registry, nextActions] = await Promise.all([
    read("../app/cockpit.tsx"),
    read("../app/system-registry.ts"),
    read("../shared/next-actions.ts"),
  ]);
  for (const label of ["SAMPLE", "SNAPSHOT", "SIMULATION"]) {
    assert.match(`${cockpit}\n${registry}`, new RegExp(label));
  }
  assert.match(cockpit, /NEXT ACTION ≠ AUTHORIZATION/);
  assert.match(cockpit, /Registry-backed transition selection · simulation only/);
  assert.match(nextActions, /write_authorized: false/);
  assert.match(registry, /SNAPSHOT · authoritative repository execution facts/);
});

test("live cockpit clients target the normalized read contract and retain terminal traces", async () => {
  const [runtime, cockpit] = await Promise.all([
    read("../app/runtime.ts"),
    read("../app/cockpit.tsx"),
  ]);
  assert.match(runtime, /url\.searchParams\.set\("view", "cockpit"\)/);
  assert.match(runtime, /url\.searchParams\.set\("transport", "sse"\)/);
  assert.match(runtime, /url\.searchParams\.set\("execution_id", executionId\)/);
  assert.match(cockpit, /event\.status === "CANCELLED"/);
  assert.match(cockpit, /event\.status === "FAILED"/);
});
