import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildMigrationConfig, resolveDatabaseRecord } from "../scripts/cloudflare/apply-d1-migrations.mjs";
import test from "node:test";

test("Cloudflare deployment config is portable and preserves Sites binding metadata", async () => {
  const [wranglerText, viteText, hostingText, releaseText, packageText] = await Promise.all([
    readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../public-release-manifest.yaml", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  const wrangler = JSON.parse(wranglerText);
  const hosting = JSON.parse(hostingText);
  const release = JSON.parse(releaseText);
  const packageJson = JSON.parse(packageText);

  assert.equal(wrangler.name, "ai-knowledge-system");
  assert.equal(wrangler.main, "./worker/index.ts");
  assert.deepEqual(wrangler.compatibility_flags, ["nodejs_compat"]);
  assert.equal(wrangler.assets.binding, "ASSETS");
  assert.equal(wrangler.images.binding, "IMAGES");

  assert.deepEqual(wrangler.d1_databases, [{ binding: "DB", migrations_dir: "drizzle" }]);
  assert.ok(!wranglerText.includes("database_id"));
  assert.ok(!wranglerText.includes("00000000-0000-4000-8000-000000000000"));

  assert.equal(packageJson.scripts["db:migrations:apply:cloudflare"], "node scripts/cloudflare/apply-d1-migrations.mjs");
  assert.equal(packageJson.scripts.deploy, "npm run db:migrations:apply:cloudflare && wrangler deploy");

  assert.equal(hosting.d1, "DB");
  assert.ok(viteText.includes("cloudflare({"));
  assert.ok(!viteText.includes("SITE_CREATOR_PLACEHOLDER_DATABASE_ID"));
  assert.ok(!viteText.includes("localBindingConfig"));

  assert.ok(
    release.allowlist.some(
      (entry) =>
        entry.id === "root-wrangler-config" &&
        entry.pattern === "wrangler.jsonc",
    ),
  );
});


test("Cloudflare D1 resolver binds an exact remote database without committing its UUID", () => {
  const resolved = resolveDatabaseRecord(
    [
      { name: "other-db", uuid: "11111111-1111-4111-8111-111111111111" },
      { name: "ai-knowledge-system-db", uuid: "22222222-2222-4222-8222-222222222222" },
    ],
    "ai-knowledge-system-db",
  );
  assert.deepEqual(resolved, {
    databaseName: "ai-knowledge-system-db",
    databaseId: "22222222-2222-4222-8222-222222222222",
  });

  const generated = buildMigrationConfig(
    { name: "ai-knowledge-system", d1_databases: [{ binding: "DB", migrations_dir: "drizzle" }] },
    resolved,
  );
  assert.deepEqual(generated.d1_databases, [{
    binding: "DB",
    database_name: "ai-knowledge-system-db",
    database_id: "22222222-2222-4222-8222-222222222222",
    migrations_dir: "drizzle",
  }]);
});

test("Cloudflare D1 resolver fails closed on missing or ambiguous database identity", () => {
  assert.throws(
    () => resolveDatabaseRecord([], "ai-knowledge-system-db"),
    /found 0/,
  );
  assert.throws(
    () => resolveDatabaseRecord(
      [
        { name: "ai-knowledge-system-db", uuid: "22222222-2222-4222-8222-222222222222" },
        { name: "ai-knowledge-system-db", uuid: "33333333-3333-4333-8333-333333333333" },
      ],
      "ai-knowledge-system-db",
    ),
    /found 2/,
  );
});
