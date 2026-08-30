import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ci = await readFile(".github/workflows/ci.yml", "utf8");

test("PR CodingHarness receipts derive changed paths from the exact base/head diff", () => {
  assert.match(ci, /fetch-depth:\s*0/);
  assert.match(ci, /execFileSync\('git', \['diff', '--name-only', '-z', base, head\]\)/);
  assert.match(ci, /changed_paths:\s*changedPaths/);
  assert.doesNotMatch(ci, /changed_paths:\s*\[\]/);
});
