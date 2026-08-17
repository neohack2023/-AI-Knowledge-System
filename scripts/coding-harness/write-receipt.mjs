#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function gitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const checks = JSON.parse(process.env.HARNESS_CHECKS_JSON || "[]");
const logical = {
  schema_version: "aios-coding-harness/v0.1",
  repository: process.env.GITHUB_REPOSITORY || "local",
  head_sha:
    process.env.HARNESS_HEAD_SHA ||
    process.env.GITHUB_HEAD_SHA ||
    process.env.GITHUB_SHA ||
    gitHead(),
  base_sha: process.env.HARNESS_BASE_SHA || null,
  profile: process.env.HARNESS_PROFILE || "PR",
  checks,
  known_regressions_loaded: [
    "WORKFLOW_PERMISSIONS_MISSING",
    "PR_CONCURRENCY_MISSING",
    "ACTION_REF_NOT_IMMUTABLE_SHA",
    "NODE_SYNTAX_ERROR",
    "PYTHON_SYNTAX_ERROR",
  ],
  terminal_status: process.env.HARNESS_TERMINAL_STATUS || "PARTIAL",
};

const canonical = JSON.stringify(logical);
const receipt = {
  ...logical,
  receipt_digest: `sha256:${createHash("sha256").update(canonical).digest("hex")}`,
};

mkdirSync("outputs", { recursive: true });
writeFileSync("outputs/coding-harness-receipt.json", `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
