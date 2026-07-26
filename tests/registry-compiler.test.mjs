import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  compileRegistry,
  RegistryValidationError,
  validateRegistry,
} from "../scripts/registry/lib.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedNow = "2026-07-26T12:00:00.000Z";

const temporaryRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aios-registry-"));
  await cp(path.join(projectRoot, "config"), path.join(root, "config"), { recursive: true });
  return root;
};

test("synthetic starter registry validates", async () => {
  const result = await validateRegistry({ root: projectRoot, now: fixedNow });
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test("registry compilation is byte-identical and fingerprint-stable", async () => {
  const firstRoot = await temporaryRoot();
  const secondRoot = await temporaryRoot();
  try {
    const first = await compileRegistry({ root: firstRoot, outDir: "compiled-a", now: fixedNow });
    const second = await compileRegistry({ root: secondRoot, outDir: "compiled-b", now: fixedNow });

    const [firstRegistry, secondRegistry, firstInventory, secondInventory] = await Promise.all([
      readFile(first.registryPath, "utf8"),
      readFile(second.registryPath, "utf8"),
      readFile(first.inventoryPath, "utf8"),
      readFile(second.inventoryPath, "utf8"),
    ]);

    assert.equal(firstRegistry, secondRegistry);
    assert.equal(firstInventory, secondInventory);
    assert.equal(first.compiled.registry_fingerprint, second.compiled.registry_fingerprint);
    assert.equal(
      first.inventory.inventory_projection_fingerprint,
      second.inventory.inventory_projection_fingerprint,
    );
  } finally {
    await Promise.all([rm(firstRoot, { recursive: true, force: true }), rm(secondRoot, { recursive: true, force: true })]);
  }
});

test("overlapping exact aliases fail closed with file and field diagnostics", async () => {
  const root = await temporaryRoot();
  try {
    await writeFile(
      path.join(root, "config", "aliases", "duplicate.json"),
      JSON.stringify({
        schema_name: "AliasDefinition",
        schema_version: "1.0",
        alias_id: "alias:global-runtime:duplicate",
        alias: "CORE-RUNTIME",
        scope_key: "global-runtime",
        status: "ACTIVE",
      }, null, 2),
      "utf8",
    );

    await assert.rejects(
      () => validateRegistry({ root, now: fixedNow }),
      (error) => {
        assert.ok(error instanceof RegistryValidationError);
        const conflict = error.diagnostics.find((item) =>
          item.code === "OVERLAPPING_EXACT_ALIAS" && item.field === "alias");
        assert.ok(conflict);
        assert.match(conflict.file, /^config\/aliases\/.+\.json$/);
        assert.match(conflict.message, /conflicts with config\/aliases\/.+\.json/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("orphan aliases and unavailable handlers fail closed", async () => {
  const root = await temporaryRoot();
  try {
    const aliasPath = path.join(root, "config", "aliases", "global-runtime.json");
    const workflowPath = path.join(root, "config", "workflows", "internal-runtime-diagnostic.json");
    const alias = JSON.parse(await readFile(aliasPath, "utf8"));
    const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
    alias.scope_key = "missing-scope";
    workflow.handler_available = false;
    await writeFile(aliasPath, JSON.stringify(alias, null, 2), "utf8");
    await writeFile(workflowPath, JSON.stringify(workflow, null, 2), "utf8");

    await assert.rejects(
      () => validateRegistry({ root, now: fixedNow }),
      (error) => {
        const codes = new Set(error.diagnostics.map((item) => item.code));
        assert.ok(codes.has("ORPHAN_ALIAS"));
        assert.ok(codes.has("HANDLER_UNAVAILABLE"));
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
