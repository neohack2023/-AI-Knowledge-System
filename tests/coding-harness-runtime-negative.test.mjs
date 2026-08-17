import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function withTempFile(name, content, fn) {
  const dir = mkdtempSync(join(tmpdir(), "aios-harness-"));
  const file = join(dir, name);
  writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("node syntax preflight rejects malformed JavaScript", () => {
  const result = withTempFile("broken.mjs", "export const = 1;\n", (file) =>
    spawnSync(process.execPath, ["--check", file], { encoding: "utf8" }),
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /SyntaxError|Unexpected token/);
});

test("python compile preflight rejects malformed Python", () => {
  const result = withTempFile("broken.py", "def broken(:\n    pass\n", (file) =>
    spawnSync("python3", ["-m", "py_compile", file], { encoding: "utf8" }),
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /SyntaxError/);
});
