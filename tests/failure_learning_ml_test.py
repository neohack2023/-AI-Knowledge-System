import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/failure-learning/train_evaluate.py"
spec = importlib.util.spec_from_file_location("failure_learning_shadow", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SOURCES = sorted((ROOT / "config/failure-learning/evaluations").glob("holdout-*.json"))

class ShadowTrainingTests(unittest.TestCase):
    def test_real_three_cases_are_shadow_only_and_do_not_leak_targets(self):
        report = module.evaluate(SOURCES)
        self.assertEqual(report["count"], 3)
        self.assertEqual(report["repositories"], 2)
        self.assertFalse(report["shadow_candidate"]["promotion_authorized"])
        self.assertFalse(report["shadow_candidate"]["coder_activation_authorized"])
        self.assertEqual(report["shadow_candidate"]["state"], "SHADOW_ONLY")
        for key in ("leave_one_target_out", "leave_one_repository_out"):
            for fold in report[key]["folds"]:
                self.assertNotIn(fold["target"], fold["train_ids"])
                if key == "leave_one_repository_out":
                    targets = {r["id"]: r["repo"] for r in module.load(SOURCES)}
                    self.assertTrue(all(targets[tid] != fold["repository"] for tid in fold["train_ids"]))
        self.assertEqual(report["leave_one_repository_out"]["metrics"]["candidate"]["accuracy"], 0.0)

    def test_corrupt_delta_and_mutable_metadata_rejected(self):
        source = json.loads(next(path for path in SOURCES if "0002" in path.name).read_text(encoding="utf8"))
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder) / "case.json"
            for patch in [
                {"observed_delta": 222.0},
                {"selection": {**source["selection"], "cutoff_kind": "MUTABLE_PR_DESCRIPTION"}},
                {"global_promotion_authorized": True},
                {"selection": {**source["selection"], "contamination_state": "TAINTED_PRIOR_REVIEW"}},
            ]:
                dest.write_text(json.dumps({**source, **patch}), encoding="utf8")
                with self.assertRaises(ValueError):
                    module.load([dest])

    def test_single_case_blocks_cv_generalization_claim(self):
        report = module.evaluate([next(path for path in SOURCES if "0002" in path.name)])
        self.assertEqual(report["leave_one_target_out"]["status"], "UNAVAILABLE_INSUFFICIENT_DATA")
        self.assertFalse(report["shadow_candidate"]["promotion_authorized"])

if __name__ == "__main__":
    unittest.main()
