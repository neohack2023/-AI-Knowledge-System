import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tool = path.join(root, "reusable-code", "tools", "code_reuse_retrieve.py");
const fixtures = path.join(root, "tests", "fixtures", "code-reuse-06a");
const knowledge = path.join(fixtures, "developer-knowledge.json");
const registry = path.join(fixtures, "code-registry.json");
const unitsRoot = path.join(root, "reusable-code", "units");
const sourceReceipt = path.join(root, "reusable-code", "fixtures", "SEED-003", "validation-receipt.json");

function runCase(name, stamp = "2026-08-16T21:20:00Z", registryPath = registry) {
  const result = spawnSync("python3", [
    tool,
    "--request", path.join(fixtures, `request-${name}.json`),
    "--knowledge", knowledge,
    "--registry", registryPath,
    "--generated-at", stamp,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function withMutatedRegistry(mutator, fn) {
  const parsed = JSON.parse(fs.readFileSync(registry, "utf8"));
  mutator(parsed);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "code-reuse-06a-"));
  const tempRegistry = path.join(tempDir, "registry.json");
  fs.writeFileSync(tempRegistry, JSON.stringify(parsed, null, 2));
  try {
    return fn(tempRegistry);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function repoRelative(target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function rewriteJson(target, mutator) {
  const value = JSON.parse(fs.readFileSync(target, "utf8"));
  mutator(value);
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + "\n");
}

function withStoredUnitClone(mutator, fn) {
  const sourceUnit = path.join(unitsRoot, "SEED-003");
  const tempUnit = path.join(unitsRoot, `.SEED-003-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.cpSync(sourceUnit, tempUnit, { recursive: true });
  try {
    const storedSource = path.join(tempUnit, "src", "canonical_json.py");
    const licensePath = path.join(tempUnit, "LICENSE");
    const provenancePath = path.join(tempUnit, "provenance.json");
    const validationPath = path.join(tempUnit, "validation.json");
    const receiptPath = path.join(tempUnit, "validation-receipt.json");
    fs.copyFileSync(sourceReceipt, receiptPath);

    rewriteJson(provenancePath, (provenance) => {
      provenance.stored_source_path = repoRelative(storedSource);
      provenance.license.evidence_path = repoRelative(licensePath);
    });
    rewriteJson(validationPath, (validation) => {
      validation.fixture_receipt_path = repoRelative(receiptPath);
    });

    const clone = {
      pointer: repoRelative(tempUnit),
      receiptRef: repoRelative(receiptPath),
      tempUnit,
      storedSource,
      licensePath,
      provenancePath,
      validationPath,
      manifestPath: path.join(tempUnit, "manifest.json"),
      receiptPath,
    };
    if (mutator) mutator(clone);
    return fn(clone);
  } finally {
    fs.rmSync(tempUnit, { recursive: true, force: true });
  }
}

function bindSeedToClone(snapshot, clone) {
  const seed = snapshot.records.find((item) => item.chunk_id === "SEED-003");
  seed.code_store_pointer = clone.pointer;
  seed.validation_receipt_ref = clone.receiptRef;
  return seed;
}

test("CODE-REUSE-06A covers all six decision states", () => {
  const expected = new Map([
    ["retrieve-both", "RETRIEVE_BOTH"],
    ["knowledge-only", "RETRIEVE_KNOWLEDGE_ONLY"],
    ["code-only", "RETRIEVE_CODE_ONLY"],
    ["skip", "SKIP"],
    ["fail-closed", "FAIL_CLOSED"],
    ["expand", "EXPAND"],
  ]);
  for (const [name, state] of expected) {
    assert.equal(runCase(name).decision.state, state, name);
  }
});

test("hard filters reject relevant unsafe candidates before ranking", () => {
  const packet = runCase("retrieve-both");
  assert.deepEqual(packet.selected_units.map((item) => item.chunk_id), ["SEED-003"]);
  const rejected = Object.fromEntries(packet.rejected_candidates.map((item) => [item.chunk_id, item.reason_codes]));
  assert.deepEqual(rejected["SEED-001"], ["QUERY_NOT_MATCHED"]);
  assert.ok(rejected["SEED-002"].includes("STATUS_NOT_EXECUTABLE"));
  assert.ok(rejected["SEED-002"].includes("SECURITY_RISK_NOT_ALLOWED"));
  assert.ok(rejected["SEED-002"].includes("CODE_STORE_POINTER_MISSING"));
});

test("ordinary relevant non-executable peer does not suppress a valid VERIFIED unit", () => {
  const packet = runCase("retrieve-both");
  assert.equal(packet.decision.state, "RETRIEVE_BOTH");
  assert.deepEqual(packet.selected_units.map((item) => item.chunk_id), ["SEED-003"]);
  const unsafe = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-002");
  assert.ok(unsafe.reason_codes.includes("STATUS_NOT_EXECUTABLE"));
  assert.ok(!packet.selected_units.some((item) => item.chunk_id === "SEED-002"));
});

test("stale nonempty Code Store pointer fails closed before ranking", () => {
  withMutatedRegistry((snapshot) => {
    const seed = snapshot.records.find((item) => item.chunk_id === "SEED-003");
    seed.code_store_pointer = "reusable-code/units/DOES-NOT-EXIST";
  }, (registryPath) => {
    const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
    assert.equal(packet.decision.state, "FAIL_CLOSED");
    const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
    assert.ok(seed.reason_codes.includes("CODE_STORE_POINTER_INVALID"));
  });
});

test("a bad stored peer suppresses another otherwise eligible unit", () => {
  withMutatedRegistry((snapshot) => {
    const good = snapshot.records.find((item) => item.chunk_id === "SEED-003");
    snapshot.records.push({
      ...good,
      chunk_id: "SEED-003-BAD-PEER",
      title: "Stable JSON SHA-256 digest stale peer",
      code_store_pointer: "reusable-code/units/DOES-NOT-EXIST",
    });
  }, (registryPath) => {
    const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
    assert.equal(packet.decision.state, "FAIL_CLOSED");
    assert.deepEqual(packet.selected_units, []);
    const bad = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003-BAD-PEER");
    assert.ok(bad.reason_codes.includes("CODE_STORE_POINTER_INVALID"));
    const good = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
    assert.deepEqual(good.reason_codes, ["SUPPRESSED_BY_CRITICAL_RELEVANT_BLOCKER"]);
  });
});

test("registry and stored source revision disagreement fails closed", () => {
  withMutatedRegistry((snapshot) => {
    const seed = snapshot.records.find((item) => item.chunk_id === "SEED-003");
    seed.source_revision = "stale-source-revision";
  }, (registryPath) => {
    const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
    assert.equal(packet.decision.state, "FAIL_CLOSED");
    const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
    assert.ok(seed.reason_codes.includes("CODE_STORE_BINDING_MISMATCH"));
  });
});

test("stored executable byte drift fails closed even when metadata still matches", () => {
  withStoredUnitClone((clone) => {
    fs.appendFileSync(clone.storedSource, "\n# tampered after validation\n", "utf8");
  }, (clone) => {
    withMutatedRegistry((snapshot) => {
      bindSeedToClone(snapshot, clone);
    }, (registryPath) => {
      const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
      assert.equal(packet.decision.state, "FAIL_CLOSED");
      const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
      assert.ok(seed.reason_codes.includes("CODE_STORE_BYTES_DIGEST_MISMATCH"));
    });
  });
});

test("REUSABLE cannot substitute for VERIFIED in the executable lane", () => {
  withStoredUnitClone((clone) => {
    rewriteJson(clone.manifestPath, (manifest) => { manifest.status = "REUSABLE"; });
    rewriteJson(clone.validationPath, (validation) => { validation.terminal_status = "REUSABLE"; });
    rewriteJson(clone.receiptPath, (receipt) => { receipt.terminal_status = "REUSABLE"; });
  }, (clone) => {
    withMutatedRegistry((snapshot) => {
      const seed = bindSeedToClone(snapshot, clone);
      seed.status = "REUSABLE";
      seed.validation_status = "REUSABLE";
    }, (registryPath) => {
      const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
      assert.equal(packet.decision.state, "FAIL_CLOSED");
      assert.deepEqual(packet.selected_units, []);
      const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
      assert.ok(seed.reason_codes.includes("STATUS_NOT_EXECUTABLE"));
      assert.ok(seed.reason_codes.includes("VALIDATION_NOT_EXECUTABLE"));
      assert.ok(seed.reason_codes.includes("CODE_STORE_BINDING_MISMATCH"));
    });
  });
});

test("required receipt gate FAIL overrides nominal VERIFIED terminal status", () => {
  withStoredUnitClone((clone) => {
    rewriteJson(clone.receiptPath, (receipt) => {
      const gate = receipt.gate_results.find((item) => item.required);
      gate.result = "FAIL";
    });
  }, (clone) => {
    withMutatedRegistry((snapshot) => {
      bindSeedToClone(snapshot, clone);
    }, (registryPath) => {
      const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
      assert.equal(packet.decision.state, "FAIL_CLOSED");
      const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
      assert.ok(seed.reason_codes.includes("CODE_STORE_REQUIRED_GATE_NOT_PASS"));
    });
  });
});

test("mutated provenance-bound license evidence fails closed", () => {
  withStoredUnitClone((clone) => {
    fs.appendFileSync(clone.licensePath, "\nmutated after validation\n", "utf8");
  }, (clone) => {
    withMutatedRegistry((snapshot) => {
      bindSeedToClone(snapshot, clone);
    }, (registryPath) => {
      const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
      assert.equal(packet.decision.state, "FAIL_CLOSED");
      const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
      assert.ok(seed.reason_codes.includes("CODE_STORE_LICENSE_DIGEST_MISMATCH"));
    });
  });
});

test("missing provenance-bound license evidence fails closed", () => {
  withStoredUnitClone((clone) => {
    fs.rmSync(clone.licensePath);
  }, (clone) => {
    withMutatedRegistry((snapshot) => {
      bindSeedToClone(snapshot, clone);
    }, (registryPath) => {
      const packet = runCase("code-only", "2026-08-16T21:20:00Z", registryPath);
      assert.equal(packet.decision.state, "FAIL_CLOSED");
      const seed = packet.rejected_candidates.find((item) => item.chunk_id === "SEED-003");
      assert.ok(seed.reason_codes.includes("CODE_STORE_LICENSE_EVIDENCE_MISSING"));
    });
  });
});

test("logical packet digest ignores timestamp-only changes", () => {
  const a = runCase("retrieve-both", "2026-08-16T21:20:00Z");
  const b = runCase("retrieve-both", "2026-08-17T00:00:00Z");
  assert.equal(a.packet_digest, b.packet_digest);
  assert.equal(a.packet_id, b.packet_id);
  assert.equal(a.packet_digest, "sha256:95934efed118556188a4db1cf9e4ee57405d9251894da4541cacf47d9470ab8e");
});

test("retrieval never grants write authorization", () => {
  assert.equal(runCase("retrieve-both").write_authorization, "NONE");
});

test("selected unit preserves validation receipt lineage", () => {
  const packet = runCase("retrieve-both");
  assert.deepEqual(packet.receipt_refs.selected_validation_receipts, [
    "reusable-code/fixtures/SEED-003/validation-receipt.json",
  ]);
});
