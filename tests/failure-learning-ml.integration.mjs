import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { trainRisk } from "../scripts/failure-learning/train-risk.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const python = process.env.AIOS_ML_PYTHON;
const outDir = join(root, "outputs", "evaluations");
test("ML shadow: train native risk, validate inputs and CV transfer against prior", {timeout: 90000}, async () => {
  assert.ok(python, "AIOS_ML_PYTHON must select the isolated scikit-learn runtime");
  const risk = await trainRisk();
  assert.equal(risk.trained_episode_count, 1);
  assert.equal(risk.validation_status, "NOT_EVALUATED_NO_FAILURE_RISK_HOLDOUT");
  assert.equal(risk.promoted, false);
  assert.equal(risk.coder_activation_authorized, false);

  execFileSync(python, ["-m", "unittest", "discover", "-s", "tests",
    "-p", "failure_learning_ml_test.py"], {cwd: root, timeout: 30000, encoding: "utf8", env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"}});
  execFileSync(python, ["scripts/failure-learning/train_evaluate.py",
    "--output", join(outDir,"failure-learning-ml.json")], {
      cwd:root, timeout:30000, encoding:"utf8", env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
  });
  const transfer = JSON.parse(await readFile(join(outDir,"failure-learning-ml.json"),"utf8"));
  assert.equal(transfer.count,3);
  assert.equal(transfer.shadow_candidate.promotion_authorized,false);
  assert.equal(transfer.shadow_candidate.coder_activation_authorized,false);
  assert.equal(transfer.leave_one_target_out.status,"DIAGNOSTIC_ONLY");
  assert.equal(transfer.leave_one_repository_out.status,"DIAGNOSTIC_ONLY");
  assert.equal(transfer.leave_one_repository_out.metrics.candidate.accuracy,0);
  await mkdir(outDir,{recursive:true});
  const path=join(outDir,"failure-learning-risk.json");
  await writeFile(path+".tmp",JSON.stringify(risk,null,2)+"\n");
  await rename(path+".tmp",path);
  console.log(JSON.stringify({
    task:transfer.task, risk_trained:1, transfer_cases:transfer.count,
    loo_candidate:transfer.leave_one_target_out.metrics.candidate,
    loo_baseline:transfer.leave_one_target_out.metrics.baseline,
    promotion_authorized:false,
  }));
});
