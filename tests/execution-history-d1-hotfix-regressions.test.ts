import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationPath = fileURLToPath(new URL("../drizzle/0000_execution_history.sql", import.meta.url));
const journalPath = fileURLToPath(new URL("../drizzle/meta/_journal.json", import.meta.url));
const snapshotPath = fileURLToPath(new URL("../drizzle/meta/0000_snapshot.json", import.meta.url));
const schemaPath = fileURLToPath(new URL("../db/schema.ts", import.meta.url));

test("B02.2 baseline Drizzle snapshot contains the complete execution-history schema", async () => {
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.equal(snapshot.version, "6");
  assert.equal(snapshot.dialect, "sqlite");
  assert.equal(snapshot.prevId, "00000000-0000-0000-0000-000000000000");
  assert.deepEqual(Object.keys(snapshot.tables).sort(), [
    "workflow_execution_events",
    "workflow_execution_links",
    "workflow_executions",
  ]);

  const indexes = Object.values(snapshot.tables).flatMap((table: any) => Object.keys(table.indexes));
  assert.deepEqual(indexes.sort(), [
    "workflow_execution_events_identity_idx",
    "workflow_execution_events_sequence_idx",
    "workflow_execution_links_identity_idx",
    "workflow_execution_links_type_idx",
    "workflow_executions_capability_created_idx",
    "workflow_executions_identity_idx",
    "workflow_executions_scope_created_idx",
  ]);
});

test("B02.2 committed Drizzle baseline does not generate a duplicate follow-up migration", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "aios-d1-drizzle-"));
  const outDir = join(tempRoot, "drizzle");
  const metaDir = join(outDir, "meta");
  const configPath = join(tempRoot, "drizzle.config.ts");

  try {
    await mkdir(metaDir, { recursive: true });
    await Promise.all([
      copyFile(migrationPath, join(outDir, "0000_execution_history.sql")),
      copyFile(journalPath, join(metaDir, "_journal.json")),
      copyFile(snapshotPath, join(metaDir, "0000_snapshot.json")),
    ]);
    await writeFile(configPath, `export default {\n  out: ${JSON.stringify(outDir)},\n  schema: ${JSON.stringify(schemaPath)},\n  dialect: "sqlite",\n};\n`);

    const cliPath = fileURLToPath(new URL("../node_modules/drizzle-kit/bin.cjs", import.meta.url));
    execFileSync(process.execPath, [cliPath, "generate", "--config", configPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    });

    assert.deepEqual((await readdir(outDir)).sort(), ["0000_execution_history.sql", "meta"]);
    assert.deepEqual((await readdir(metaDir)).sort(), ["0000_snapshot.json", "_journal.json"]);
    const journal = JSON.parse(await readFile(join(metaDir, "_journal.json"), "utf8"));
    assert.equal(journal.entries.length, 1);
    assert.equal(journal.entries[0].tag, "0000_execution_history");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("B02.2 runtime preserves the initialized D1 store when schema setup fails", async () => {
  const source = await readFile(
    new URL("../server/workflows/durable-runtime-instance.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /return new D1ExecutionHistoryStore\(db\)\.initialize\(\);/);
  assert.doesNotMatch(source, /UnavailableExecutionHistoryStore\("D1_SCHEMA_UNAVAILABLE"\)/);
});
