import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DATABASE_NAME = "ai-knowledge-system-db";
const GENERATED_CONFIG_NAME = ".wrangler-migrations.generated.jsonc";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveDatabaseRecord(databases, databaseName) {
  if (!Array.isArray(databases)) throw new TypeError("Wrangler D1 inventory must be an array.");
  const matches = databases.filter((database) => database?.name === databaseName);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one remote D1 database named ${databaseName}; found ${matches.length}.`);
  }
  const record = matches[0];
  const databaseId = record.uuid ?? record.database_id ?? record.id;
  if (typeof databaseId !== "string" || !UUID_PATTERN.test(databaseId)) {
    throw new Error(`Remote D1 database ${databaseName} did not expose a valid UUID.`);
  }
  return { databaseName, databaseId };
}

export function buildMigrationConfig(baseConfig, database) {
  return {
    ...baseConfig,
    d1_databases: [{
      binding: "DB",
      database_name: database.databaseName,
      database_id: database.databaseId,
      migrations_dir: "drizzle",
    }],
  };
}

function runWrangler(args, capture = false) {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(executable, ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: { ...process.env, CI: process.env.CI ?? "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler command failed: wrangler ${args.join(" ")}`);
  return capture ? result.stdout : "";
}

export async function applyCloudflareD1Migrations(
  databaseName = process.env.AIOS_CLOUDFLARE_D1_NAME ?? DEFAULT_DATABASE_NAME,
) {
  const inventory = JSON.parse(runWrangler(["d1", "list", "--json"], true));
  const database = resolveDatabaseRecord(inventory, databaseName);

  const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const baseConfig = JSON.parse(await readFile(resolve(repoRoot, "wrangler.jsonc"), "utf8"));
  const generatedConfigPath = resolve(repoRoot, GENERATED_CONFIG_NAME);

  try {
    await writeFile(
      generatedConfigPath,
      `${JSON.stringify(buildMigrationConfig(baseConfig, database), null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(`Resolved remote D1 ${database.databaseName}; applying registered migrations.`);
    runWrangler([
      "d1", "migrations", "apply", "DB", "--remote", "--config", generatedConfigPath,
    ]);
  } finally {
    await rm(generatedConfigPath, { force: true });
  }
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  applyCloudflareD1Migrations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
