#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  checkRepository,
  parsePrivateTerms,
  PublicReleaseBoundaryError,
} from "./lib.mjs";

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

const hasFlag = (name) => process.argv.includes(name);
const hasArgument = (name) => process.argv.includes(name);

try {
  const trustedPrivateTermMode = hasFlag("--trusted-private-terms");
  const rootWasExplicit = hasArgument("--root");
  const root = path.resolve(argumentValue("--root", process.cwd()));
  const manifestPath = argumentValue("--manifest", "public-release-manifest.yaml");
  const reportPath = argumentValue("--report", "outputs/public-release-report.json");

  if (trustedPrivateTermMode) {
    const scannerRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../..",
    );

    if (!rootWasExplicit) {
      throw new Error(
        "--trusted-private-terms requires an explicit --root pointing to the candidate checkout.",
      );
    }

    if (root === scannerRoot) {
      throw new Error(
        "Trusted private-term scanning must run trusted scanner code from a separate checkout; --root cannot be the scanner checkout.",
      );
    }
  }

  const trustedPrivateTerms = trustedPrivateTermMode
    ? parsePrivateTerms(process.env.PUBLIC_RELEASE_PRIVATE_TERMS ?? "")
    : undefined;
  const { passed, report } = checkRepository({
    root,
    manifestPath,
    reportPath,
    privateTerms: trustedPrivateTerms,
  });

  const summary = report.summary;
  console.log([
    `Public release boundary: ${report.result}`,
    `tracked=${summary.tracked_files}`,
    `included=${summary.included_files}`,
    `blocked=${summary.blocked_files}`,
    `unresolved=${summary.unresolved_files}`,
    `findings=${summary.sensitive_findings}`,
    `binaries=${summary.binary_files_approved}`,
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
