import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ci = await readFile(".github/workflows/ci.yml", "utf8");

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" });

const changedPaths = (cwd, range) => git(cwd, ["diff", "--name-only", "-z", range])
  .split("\0")
  .filter(Boolean)
  .sort();

test("PR CodingHarness receipts derive changed paths from the merge-base PR diff", async () => {
  assert.match(ci, /fetch-depth:\s*0/);
  assert.match(ci, /execFileSync\('git', \['diff', '--name-only', '-z', `\$\{base\}\.\.\.\$\{head\}`\]\)/);
  assert.match(ci, /changed_paths:\s*changedPaths/);
  assert.doesNotMatch(ci, /changed_paths:\s*\[\]/);

  const repo = await mkdtemp(join(tmpdir(), "aios-pr-diff-"));
  git(repo, ["init", "-b", "main"]);
  git(repo, ["config", "user.email", "aios-test@example.invalid"]);
  git(repo, ["config", "user.name", "AIOS Test"]);

  await writeFile(join(repo, "shared.txt"), "root\n");
  git(repo, ["add", "shared.txt"]);
  git(repo, ["commit", "-m", "root"]);

  git(repo, ["switch", "-c", "feature"]);
  await writeFile(join(repo, "feature-only.txt"), "feature\n");
  git(repo, ["add", "feature-only.txt"]);
  git(repo, ["commit", "-m", "feature change"]);

  git(repo, ["switch", "main"]);
  await writeFile(join(repo, "base-only.txt"), "base advance\n");
  git(repo, ["add", "base-only.txt"]);
  git(repo, ["commit", "-m", "base-only advance"]);

  const direct = changedPaths(repo, "main..feature");
  const mergeBase = changedPaths(repo, "main...feature");

  assert.deepEqual(direct, ["base-only.txt", "feature-only.txt"]);
  assert.deepEqual(mergeBase, ["feature-only.txt"]);
});
