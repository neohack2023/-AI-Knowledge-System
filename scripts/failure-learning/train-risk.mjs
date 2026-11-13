#!/usr/bin/env node
// Train the existing online failure-risk model on TRAIN-only checkpoint evidence.
// One recorded episode is not evidence of generalization. No promotion.
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createFailureRiskModel, predictFailureRisk, updateFailureRiskModel,
} from "../../server/failure-learning/model.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const episodePath = resolve(root,"config/failure-learning/episodes/cpython-pr-121143.v0.1.json");
const defaultOut = resolve(root,"outputs/evaluations/failure-learning-risk.json");

export async function trainRisk(filePath = episodePath) {
  const raw = await readFile(filePath);
  const data = JSON.parse(raw.toString("utf8"));
  if (data.schema_name !== "FailureLearningEpisodeFixture"
      || data.episode?.split !== "TRAIN"
      || data.episode?.state !== "COMPLETE"
      || data.episode?.terminal_label == null
      || data.checkpoint?.failure_observed !== true
      || data.episode?.episode_id !== "github:python/cpython:pr:121143"
      || !Array.isArray(data.checkpoint?.failure_features)) {
    throw new Error("TRAINING_EPISODE_NOT_ELIGIBLE");
  }
  const initial = createFailureRiskModel();
  const features = data.checkpoint.failure_features;
  const before = predictFailureRisk(initial, features);
  const fitted = updateFailureRiskModel(initial, features, true, data.episode.episode_id);
  const after = predictFailureRisk(fitted, features);
  if (fitted.state !== "SHADOW_ONLY" || fitted.trained_episode_count !== 1
      || after.risk <= before.risk) throw new Error("SHADOW_TRAINING_CONTROL_FAILED");
  return {
    schema: "AIOSFailureRiskTraining/1",
    git_head: execFileSync("git", ["rev-parse","HEAD"], {cwd: root, encoding:"utf8"}).trim(),
    source_sha256: createHash("sha256").update(raw).digest("hex"),
    source_episode_id: data.episode.episode_id,
    trained_episode_count: 1,
    in_sample_risk_before: before.risk,
    in_sample_risk_after: after.risk,
    training_only: true,
    independent_holdout_available: false,
    validation_status: "NOT_EVALUATED_NO_FAILURE_RISK_HOLDOUT",
    model: fitted,
    promoted: false,
    coder_activation_authorized: false,
    authority_effect: "NONE",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await trainRisk();
    const out = resolve(process.argv[2] || defaultOut);
    await mkdir(dirname(out),{recursive:true});
    await writeFile(out+".tmp",JSON.stringify(result,null,2)+"\n");
    await rename(out+".tmp",out);
    console.log(JSON.stringify({
      status: result.validation_status,
      trained_episode_count: result.trained_episode_count,
      before: result.in_sample_risk_before,
      after: result.in_sample_risk_after,
      output: out,
    }));
  } catch (error) {
    console.error(String(error));
    process.exitCode=2;
  }
}
