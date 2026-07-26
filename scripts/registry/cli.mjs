#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import {
  compileRegistry,
  RegistryValidationError,
  validateRegistry,
} from "./lib.mjs";

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};

const command = process.argv[2];
const root = path.resolve(argumentValue("--root", process.cwd()));
const outDir = argumentValue("--out", "outputs/registry");

const printDiagnostics = (diagnostics) => {
  for (const item of diagnostics) {
    console.error(`${item.code} ${item.file}:${item.field} ${item.message}`);
  }
};

try {
  if (command === "validate") {
    await validateRegistry({ root });
    console.log("AIOS registry validation: PASS");
  } else if (command === "compile") {
    const result = await compileRegistry({ root, outDir });
    console.log([
      "AIOS registry compile: PASS",
      `registry=${result.compiled.registry_fingerprint}`,
      `inventory=${result.inventory.inventory_projection_fingerprint}`,
      `output=${path.relative(root, result.registryPath)}`,
    ].join(" | "));
  } else {
    throw new Error("Usage: node scripts/registry/cli.mjs <validate|compile> [--root PATH] [--out PATH]");
  }
} catch (error) {
  if (error instanceof RegistryValidationError) {
    printDiagnostics(error.diagnostics);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exitCode = 1;
}
