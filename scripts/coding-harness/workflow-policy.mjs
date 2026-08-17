#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function workflowFiles(args) {
  if (args.length) return args.map((value) => resolve(value));
  return readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => resolve(".github/workflows", name));
}

export function inspectWorkflowText(text, filePath = "<memory>") {
  const findings = [];
  const hasPullRequest = /^\s{0,2}pull_request\s*:/m.test(text);

  if (!/^permissions\s*:/m.test(text)) {
    findings.push({ code: "WORKFLOW_PERMISSIONS_MISSING", file: filePath });
  }

  if (hasPullRequest && !/^concurrency\s*:/m.test(text)) {
    findings.push({ code: "PR_CONCURRENCY_MISSING", file: filePath });
  }

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*-?\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/);
    if (!match) continue;
    const target = match[1];
    if (target.startsWith("./") || target.startsWith("docker://")) continue;
    const at = target.lastIndexOf("@");
    const ref = at >= 0 ? target.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      findings.push({
        code: "ACTION_REF_NOT_IMMUTABLE_SHA",
        file: filePath,
        line: index + 1,
        value: target,
      });
    }
  }

  return findings;
}

const args = process.argv.slice(2);
const findings = [];
for (const filePath of workflowFiles(args)) {
  const text = readFileSync(filePath, "utf8");
  findings.push(...inspectWorkflowText(text, filePath));
}

if (findings.length) {
  for (const finding of findings) {
    console.error(JSON.stringify(finding));
  }
  process.exit(2);
}

console.log(`workflow-policy: PASS (${workflowFiles(args).length} file(s))`);
