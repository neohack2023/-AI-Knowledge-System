import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { trainRisk } from "../scripts/failure-learning/train-risk.mjs";

test("native failure-risk model trains strictly from the registered TRAIN episode", async () => {
  const trained = await trainRisk();
  assert.equal(trained.trained_episode_count, 1);
  assert.equal(trained.model.state, "SHADOW_ONLY");
  assert.equal(trained.model.weights.length, 128);
  assert.equal(trained.source_episode_id, "github:python/cpython:pr:121143");
  assert.equal(trained.independent_holdout_available, false);
  assert.equal(trained.promoted, false);
  assert.equal(trained.coder_activation_authorized, false);
  assert.ok(trained.in_sample_risk_after > trained.in_sample_risk_before);
});

test("native training refuses improperly assigned HOLDOUT or incomplete episodes", async () => {
  const original = JSON.parse(await readFile(
    new URL("../config/failure-learning/episodes/cpython-pr-121143.v0.1.json", import.meta.url), "utf8"));
  const dir = await mkdtemp(join(tmpdir(), "aios-train-negative-"));
  try {
    for (const patch of [
      { episode: { ...original.episode, split: "HOLDOUT" } },
      { episode: { ...original.episode, state: "REPLAYING" } },
      { checkpoint: { ...original.checkpoint, failure_observed: false } },
    ]) {
      const file = join(dir, "source.json");
      await writeFile(file, JSON.stringify({ ...original, ...patch }));
      await assert.rejects(() => trainRisk(file), /TRAINING_EPISODE_NOT_ELIGIBLE/);
    }
  } finally { await rm(dir, { force: true, recursive: true }); }
});
