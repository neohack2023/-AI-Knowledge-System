import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

  assert.equal(packageJson.scripts["db:migrations:apply:cloudflare"], "wrangler d1 migrations apply DB --remote");
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
