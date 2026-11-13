#!/usr/bin/env node
// One deterministic, receipt-backed entry point for bounded AIOS execution evaluations.
import { spawn } from "node:child_process";
import { mkdir, appendFile, writeFile, rename, access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profiles = {
  learning: [
    "tests/failure-learning.test.ts",
    "tests/failure-learning-episode.test.ts",
    "tests/failure-learning-promotion.test.ts",
  ],
  runtime: [
    "tests/workflow-kernel.test.mjs",
    "tests/aios-bridge-live-read.test.mjs",
  ],
};
const exists = async (path) => access(path, constants.F_OK).then(() => true).catch(() => false);

const gitHead = async () => {
  const r = await evaluateScenario({ name: "git-head", command: "git", args: ["rev-parse", "HEAD"], cwd: root, timeoutMs: 4000, capture: true });
  return r.status === "PASS" ? r.captured?.trim() : null;
};

export async function evaluateScenario({ name, command, args = [], cwd = root, requiredPaths = [], timeoutMs = 120000, capture = false }) {
  const started = Date.now();
  const missing = [];
  for (const path of requiredPaths) if (!await exists(resolve(cwd, path))) missing.push(path);
  if (missing.length) return { name, status: "BLOCKED", reason_code: "ENVIRONMENT_NOT_READY", missing, duration_ms: Date.now() - started, exit_code: null };

  return await new Promise((finish) => {
    let child;
    let settled = false;
    let output = "";
    const complete = (obj) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      finish({ name, duration_ms: Date.now() - started, ...obj });
    };
    const timer = setTimeout(() => {
      child?.kill();
      complete({ status: "FAIL", reason_code: "TIMEOUT", exit_code: null });
    }, timeoutMs);
    try {
      child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: process.env });
      for (const stream of [child.stdout, child.stderr]) {
        stream?.on("data", (chunk) => {
          if (capture && output.length < 512) output += chunk.toString("utf8").slice(0, 512 - output.length);
        });
      }
      child.on("error", (err) => complete({ status: "BLOCKED", reason_code: err.code === "ENOENT" ? "COMMAND_NOT_FOUND" : "PROCESS_START_FAILED", exit_code: null }));
      child.on("close", (code, signal) => complete({ status: code === 0 ? "PASS" : "FAIL", reason_code: code === 0 ? null : "TEST_EXIT_NONZERO", exit_code: code, ...(signal ? { signal } : {}), ...(capture ? { captured: output } : {}) }));
    } catch {
      complete({ status: "BLOCKED", reason_code: "PROCESS_START_FAILED", exit_code: null });
    }
  });
}

export async function runEvaluation({ profile = "learning", cwd = root, outputDir = join(root, "outputs", "evaluations"), writeReceipt = true } = {}) {
  if (!["learning", "runtime", "both"].includes(profile)) throw new Error("Profile must be learning, runtime, or both.");
  const startedAt = new Date().toISOString();
  const scenarios = profile === "both" ? ["learning", "runtime"] : [profile];
  const results = [];
  for (const name of scenarios) {
    const tests = profiles[name];
    results.push(await evaluateScenario({
      name, command: process.execPath,
      args: ["--experimental-transform-types", "--test", ...tests],
      cwd, requiredPaths: name === "runtime" ? ["dist/server/index.js", ...tests] : tests,
      timeoutMs: name === "runtime" ? 180000 : 90000,
    }));
  }
  const status = results.every(r => r.status === "PASS") ? "PASS"
    : results.some(r => r.status === "FAIL") ? "FAIL"
    : results.some(r => r.status === "PASS") ? "PARTIAL" : "BLOCKED";
  const receipt = {
    schema: "AIOSBehavioralEvaluation/1",
    run_id: randomUUID(),
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    repository_head: await gitHead(),
    profile,
    environment: { platform: process.platform, node: process.version },
    status,
    coverage: { executed: results.filter(r => r.status !== "BLOCKED").length, requested: results.length, complete: results.every(r => r.status !== "BLOCKED") },
    results,
    authorization_effect: "NONE",
    acceptance_scope: "LOCAL_EXECUTION_EVIDENCE_ONLY",
  };
  if (writeReceipt) {
    await mkdir(outputDir, { recursive: true });
    const current = join(outputDir, "latest.json");
    const temp = join(outputDir, "latest.tmp");
    await writeFile(temp, JSON.stringify(receipt, null, 2) + "\n", { flag: "w" });
    await rename(temp, current);
    await appendFile(join(outputDir, "runs.jsonl"), JSON.stringify(receipt) + "\n");
  }
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv.find(a => a.startsWith("--profile="));
  const profile = arg ? arg.split("=")[1] : "learning";
  try {
    const receipt = await runEvaluation({ profile });
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    process.exitCode = receipt.status === "FAIL" ? 1 : receipt.status === "PASS" ? 0 : 2;
  } catch (error) {
    process.stderr.write(String(error.message) + "\n");
    process.exitCode = 2;
  }
}
