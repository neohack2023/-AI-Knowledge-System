import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateScenario, runEvaluation } from "../scripts/evaluate.mjs";

test("actual zero-exit child execution is PASS", async () => {
  const outcome = await evaluateScenario({ name: "positive-control", command: process.execPath, args: ["-e", "process.exit(0)"] });
  assert.equal(outcome.status, "PASS");
  assert.equal(outcome.exit_code, 0);
  assert.ok(outcome.duration_ms >= 0);
});

test("deliberately failing child is not a PASS or environmental BLOCK", async () => {
  const outcome = await evaluateScenario({ name: "negative-control", command: process.execPath, args: ["-e", "process.exit(9)"] });
  assert.equal(outcome.status, "FAIL");
  assert.equal(outcome.reason_code, "TEST_EXIT_NONZERO");
  assert.equal(outcome.exit_code, 9);
});

test("missing build prerequisite reports BLOCKED_ENVIRONMENT before starting tests", async () => {
  const outcome = await evaluateScenario({
    name: "missing-dist",
    command: process.execPath,
    args: ["-e", "process.exit(9)"],
    requiredPaths: ["__missing_aios_behavioral_build__/index.js"],
  });
  assert.equal(outcome.status, "BLOCKED");
  assert.equal(outcome.reason_code, "ENVIRONMENT_NOT_READY");
  assert.deepEqual(outcome.missing, ["__missing_aios_behavioral_build__/index.js"]);
  assert.equal(outcome.exit_code, null);
});

test("bounded subprocess timeout is classified as a failure", async () => {
  const outcome = await evaluateScenario({ name: "time-limit", command: process.execPath, args: ["-e", "setInterval(() => {}, 1000)"], timeoutMs: 150 });
  assert.equal(outcome.status, "FAIL");
  assert.equal(outcome.reason_code, "TIMEOUT");
});

test("receipt reports incomplete coverage without falsely awarding acceptance", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "aios-evaluate-"));
  try {
    const receipt = await runEvaluation({ profile: "both", cwd, writeReceipt: false });
    assert.equal(receipt.status, "BLOCKED");
    assert.deepEqual(receipt.coverage, { executed: 0, requested: 2, complete: false });
    assert.equal(receipt.authorization_effect, "NONE");
    assert.equal(receipt.acceptance_scope, "LOCAL_EXECUTION_EVIDENCE_ONLY");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("GitHub CI executes the same behavioral profiles and preserves their independent receipt", async () => {
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(ci, /name: Run behavioral evaluation profiles\s+if: always\(\)\s+run: npm run evaluate -- --profile=all/);
  assert.match(ci, /name: Upload behavioral evaluation receipt[\s\S]*?outputs\/evaluations\/latest\.json[\s\S]*?outputs\/evaluations\/runs\.jsonl/);
});

test("diagnostic output from a failed executable scenario is bounded", async () => {
  const outcome = await evaluateScenario({
    name: "bounded-failure",
    command: process.execPath,
    args: ["-e", "process.stderr.write('X'.repeat(15000));process.exit(7)"],
    capture: true,
  });
  assert.equal(outcome.status, "FAIL");
  assert.equal(outcome.exit_code, 7);
  assert.equal(outcome.captured?.length, 12000);
});

test("HTTP evaluation checks the compiled Worker and local D1 prerequisites before execution", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "aios-http-missing-"));
  try {
    const receipt = await runEvaluation({ profile: "http", cwd, writeReceipt: false });
    assert.equal(receipt.status, "BLOCKED");
    assert.deepEqual(receipt.coverage, { executed: 0, requested: 1, complete: false });
    assert.deepEqual(receipt.results[0].missing, [
      "node_modules/miniflare/package.json", "dist/server/index.js",
      "drizzle/0000_execution_history.sql", "tests/http-runtime.integration.ts",
    ]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("optional real-browser profile stays outside ordinary four-profile CI and fails cleanly on missing environment", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "aios-browser-missing-"));
  try {
    const receipt = await runEvaluation({ profile: "browser", cwd, writeReceipt: false });
    assert.equal(receipt.status, "BLOCKED");
    assert.deepEqual(receipt.coverage, { executed: 0, requested: 1, complete: false });
    assert.ok(receipt.results[0].missing.includes("tests/workbench-browser.integration.mjs"));
    assert.equal(receipt.authorization_effect, "NONE");
    const source = await readFile(new URL("../scripts/evaluate.mjs", import.meta.url), "utf8");
    assert.match(source, /profile === "all" \? \["learning", "runtime", "d1", "http"\]/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
