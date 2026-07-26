#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { checkRepository, PublicReleaseBoundaryError } from "./lib.mjs";

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

try {
  const root = path.resolve(argumentValue("--root", process.cwd()));
  const manifestPath = argumentValue("--manifest", "public-release-manifest.yaml");
  const reportPath = argumentValue("--report", "outputs/public-release-report.json");
  const { passed, report } = checkRepository({ root, manifestPath, reportPath });

  const summary = report.summary;
  console.log([
    `Public release boundary: ${report.result}`,
    `tracked=${summary.tracked_files}`,
    `included=${summary.included_files}`,
    `blocked=${summary.blocked_files}`,
    `unresolved=${summary.unresolved_files}`,
    `findings=${summary.sensitive_findings}`,
    `report=${reportPath}`,
  ].join(" | "));

  if (!passed) {
    for (const record of [...report.blocked, ...report.unresolved].slice(0, 20)) {
      console.error(`PATH ${record.classification}: ${record.file} (${record.rule_id ?? "no-rule"})`);
    }
    for (const finding of report.findings.slice(0, 20)) {
      console.error(
        `CONTENT ${finding.classification}: ${finding.file}:${finding.line}:${finding.column} (${finding.rule_id}) ${finding.preview}`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof PublicReleaseBoundaryError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
