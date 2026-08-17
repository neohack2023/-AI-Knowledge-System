import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cri-registry-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "fixture@example.com");
  git(repo, "config", "user.name", "Fixture");
  git(repo, "remote", "add", "origin", "https://github.com/example/fixture");
  fs.mkdirSync(path.join(repo, "src"));
  fs.writeFileSync(path.join(repo, "src", "sample.py"), `import json\n\n@cache\ndef stable_digest(value):\n    \"\"\"Return a stable digest.\"\"\"\n    return json.dumps(value, sort_keys=True)\n\nclass Worker:\n    \"\"\"Process one work item.\"\"\"\n    def run(self, value):\n        return value\n`);
  fs.writeFileSync(path.join(repo, "LICENSE"), "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files.\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "fixture");
  return { repo, sha: git(repo, "rev-parse", "HEAD") };
}

test("02B-CORE registry preserves Python extractor output exactly", () => {
  const fixture = makeRepo();
  try {
    const probe = `
import importlib.util
import json
import pathlib
import sys

tool, repo, sha = sys.argv[1:]
spec = importlib.util.spec_from_file_location("repository_intake", tool)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = pathlib.Path(repo)
paths = module.tracked_files(root)
manifests = sorted(path for path in paths if pathlib.Path(path).name in module.MANIFESTS)
license_info = module.detect_license(root, paths, manifests)
kwargs = dict(
    root=root,
    relative="src/sample.py",
    repository_url="https://github.com/example/fixture",
    revision=sha,
    scope_id="global-working-memory",
    license_info=license_info,
    retrieved_at="2026-08-17T22:10:00Z",
)
direct = module.python_candidates(**kwargs)
routed = module.EXTRACTOR_REGISTRY.extract("Python", **kwargs)
assert direct == routed
extractor = module.EXTRACTOR_REGISTRY.get("Python")
assert extractor is not None
assert extractor.extractor_id == "python-stdlib-ast-v0.1"
assert extractor.extractor_class == "GENERALIZED_PARSER"
assert module.EXTRACTOR_REGISTRY.supported_languages() == ("Python",)
print(json.dumps({"direct_equals_registry": True, "supported_languages": module.EXTRACTOR_REGISTRY.supported_languages()}))
`;
    const result = run("python3", ["-c", probe, tool, fixture.repo, fixture.sha]);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.direct_equals_registry, true);
    assert.deepEqual(payload.supported_languages, ["Python"]);
  } finally {
    fs.rmSync(fixture.repo, { recursive: true, force: true });
  }
});

test("02B-CORE registry rejects duplicate language registration", () => {
  const probe = `
import importlib.util
import sys
spec = importlib.util.spec_from_file_location("repository_intake", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
registry = module.ExtractorRegistry()
registry.register(module.PythonAstExtractor())
try:
    registry.register(module.PythonAstExtractor())
except ValueError as exc:
    assert "already registered" in str(exc)
else:
    raise AssertionError("duplicate extractor registration did not fail")
`;
  const result = run("python3", ["-c", probe, tool]);
  assert.equal(result.status, 0, result.stderr);
});
