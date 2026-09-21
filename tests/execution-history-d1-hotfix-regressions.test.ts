import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../drizzle/0000_execution_history.sql", import.meta.url);
const journalPath = new URL("../drizzle/meta/_journal.json", import.meta.url);
const snapshotPath = new URL("../drizzle/meta/0000_snapshot.json", import.meta.url);
const failureLearningMigrationPath = new URL("../db/failure-learning/migrations/0000_failure_learning.sql", import.meta.url);

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

test("primary Drizzle stream remains execution-history only", async () => {
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  assert.deepEqual(journal.entries.map((entry: any) => entry.tag), ["0000_execution_history"]);
  assert.doesNotMatch(await readFile(migrationPath, "utf8"), /failure_learning_/);
});

test("failure-learning migration is isolated behind FAILURE_DB", async () => {
  const failureMigration = await readFile(failureLearningMigrationPath, "utf8");
  assert.match(failureMigration, /CREATE TABLE `failure_learning_repositories`/);
  assert.match(failureMigration, /CREATE TABLE `failure_learning_checkpoints`/);

  const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.deepEqual(
    wrangler.d1_databases.map((entry: any) => [entry.binding, entry.migrations_dir]),
    [
      ["DB", "drizzle"],
      ["FAILURE_DB", "db/failure-learning/migrations"],
    ],
  );

  const runtime = await readFile(new URL("../server/failure-learning/runtime.ts", import.meta.url), "utf8");
  assert.match(runtime, /env\.FAILURE_DB/);
  assert.doesNotMatch(runtime, /new D1FailureLearningStore\(env\.DB\)/);
});

test("B02.2 runtime keeps D1-backed I/O request-local while preserving fail-visible initialization", async () => {
  const source = await readFile(new URL("../server/workflows/durable-runtime-instance.ts", import.meta.url), "utf8");
  assert.match(source, /return new D1ExecutionHistoryStore\(db\)\.initialize\(\);/);
  assert.match(source, /getExecutionHistoryStore = \(\) => createStore\(\)/);
  assert.match(source, /const store = await createStore\(\)/);
  assert.doesNotMatch(source, /globalThis/);
  assert.doesNotMatch(source, /__aiKnowledgeDurable/);
  assert.doesNotMatch(source, /UnavailableExecutionHistoryStore\("D1_SCHEMA_UNAVAILABLE"\)/);
});

test("B02.2 runtime readiness probe uses required-table reads and does not replay schema DDL after deploy-time migrations", async () => {
  const source = await readFile(new URL("../server/workflows/d1-execution-history-store.ts", import.meta.url), "utf8");
  assert.match(source, /SELECT 1 AS ready FROM/);
  assert.doesNotMatch(source, /await this\.db\.batch\(executionHistorySchemaStatements/);
});
