import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tool = path.join(root, "reusable-code", "tools", "repository_intake.py");

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...options });
}

function git(cwd, ...args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeRepo({ licensed = true } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cri-intake-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "fixture@example.com");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "remote", "add", "origin", "https://github.com/example/fixture");
  fs.mkdirSync(path.join(repo, "src"));
  fs.mkdirSync(path.join(repo, "dist"));
  fs.writeFileSync(path.join(repo, "src", "sample.py"), `import json\n\ndef stable_digest(value):\n    \"\"\"Return a stable digest.\"\"\"\n    return json.dumps(value, sort_keys=True)\n\nclass Worker:\n    \"\"\"Process one work item.\"\"\"\n    def run(self, value):\n        return value\n`);
  fs.writeFileSync(path.join(repo, "dist", "generated.py"), "def generated():\n    return 1\n");
  fs.writeFileSync(path.join(repo, "pyproject.toml"), '[project]\nname = "fixture"\nversion = "0.1.0"\n');
  if (licensed) {
    fs.writeFileSync(path.join(repo, "LICENSE"), "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \\\"Software\\\"), to deal in the Software without restriction.\n");
  }
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture");
  return { repo, sha: git(repo, "rev-parse", "HEAD") };
}

function intake(repo, sha, extra = []) {
  return run("python3", [
    tool,
    "--repo-root", repo,
    "--repository-url", "https://github.com/example/fixture",
    "--revision", sha,
    "--branch", "main",
    "--retrieved-at", "2026-08-17T22:10:00Z",
    ...extra,
  ]);
}

test("CODE-REUSE-02 emits deterministic source-anchored Python candidates", () => {
  const fixture = makeRepo();
  try {
    const result = intake(fixture.repo, fixture.sha);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.receipt.status, "COMPLETE");
    assert.equal(payload.receipt.resolved_revision, fixture.sha);
    assert.equal(payload.receipt.license_state, "PASS");
    assert.equal(payload.receipt.license_spdx, "MIT");
    assert.equal(payload.receipt.write_authorization, "NONE");
    assert.deepEqual(payload.candidates.map((item) => item.title), ["stable_digest", "Worker"]);
    for (const candidate of payload.candidates) {
      assert.equal(candidate.status, "CANDIDATE");
      assert.equal(candidate.validation_status, "UNVALIDATED");
      assert.equal(candidate.source_revision, fixture.sha);
      assert.equal(candidate.license_gate, "PASS");
      assert.equal(candidate.source_evidence.extractor_class, "GENERALIZED_PARSER");
      assert.ok(candidate.source_url.includes(`/blob/${fixture.sha}/src/sample.py#L`));
      assert.ok(!("source_code" in candidate));
    }
    assert.ok(!payload.candidates.some((item) => item.source_evidence.path.startsWith("dist/")));
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("revision mismatch fails closed and still emits a receipt", () => {
  const fixture = makeRepo();
  try {
    const result = intake(fixture.repo, "deadbeef");
    assert.equal(result.status, 2);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.receipt.status, "FAILED");
    assert.equal(payload.receipt.failure_state, "REVISION_UNRESOLVED");
    assert.deepEqual(payload.candidates, []);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("missing license blocks literal reuse without erasing pattern-level candidates", () => {
  const fixture = makeRepo({ licensed: false });
  try {
    const result = intake(fixture.repo, fixture.sha);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.receipt.license_state, "BLOCKED");
    assert.ok(payload.candidates.length > 0);
    assert.ok(payload.candidates.every((item) => item.license_gate === "BLOCKED"));
    assert.ok(payload.candidates.every((item) => item.status === "CANDIDATE"));
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("claimed repository identity must match the checkout origin", () => {
  const fixture = makeRepo();
  try {
    const result = run("python3", [
      tool,
      "--repo-root", fixture.repo,
      "--repository-url", "https://github.com/example/not-the-fixture",
      "--revision", fixture.sha,
      "--retrieved-at", "2026-08-17T22:10:00Z",
    ]);
    assert.equal(result.status, 2);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.receipt.failure_state, "SOURCE_UNRESOLVED");
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("unrecognized package license metadata cannot produce a PASS gate", () => {
  const fixture = makeRepo({ licensed: false });
  try {
    fs.writeFileSync(path.join(fixture.repo, "package.json"), JSON.stringify({ name: "fixture", license: "UNLICENSED" }));
    git(fixture.repo, "add", "package.json");
    git(fixture.repo, "commit", "-qm", "add package metadata");
    const sha = git(fixture.repo, "rev-parse", "HEAD");
    const result = intake(fixture.repo, sha);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.receipt.license_state, "BLOCKED");
    assert.ok(payload.candidates.every((item) => item.license_gate === "BLOCKED"));
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("same pinned snapshot produces stable candidate identities", () => {
  const fixture = makeRepo();
  try {
    const first = JSON.parse(intake(fixture.repo, fixture.sha).stdout);
    const second = JSON.parse(intake(fixture.repo, fixture.sha).stdout);
    assert.equal(first.receipt.run_id, second.receipt.run_id);
    assert.deepEqual(first.candidates, second.candidates);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("the live AI Knowledge System checkout can be inventoried as an exact internal fixture", () => {
  const sha = git(root, "rev-parse", "HEAD");
  const result = run("python3", [
    tool,
    "--repo-root", root,
    "--repository-url", "https://github.com/neohack2023/-AI-Knowledge-System",
    "--revision", sha,
    "--branch", "main",
    "--scope-id", "global-working-memory",
    "--language-allowlist", "Python",
    "--max-files", "5000",
    "--max-candidates", "25",
    "--retrieved-at", "2026-08-17T22:10:00Z",
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.receipt.resolved_revision, sha);
  assert.equal(payload.receipt.repository_url, "https://github.com/neohack2023/-AI-Knowledge-System");
  assert.equal(payload.receipt.write_authorization, "NONE");
  assert.ok(payload.receipt.candidate_count > 0);
  assert.ok(payload.candidates.every((item) => item.source_evidence.path && item.source_evidence.start_line > 0));
});
