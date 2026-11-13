#!/usr/bin/env python3
"""Shadow-only evaluation of lesson-transfer outcomes; never a failure-risk deployment."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone
from sklearn import __version__ as sklearn_version
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, brier_score_loss
from sklearn.model_selection import LeaveOneOut, LeaveOneGroupOut
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "config/failure-learning/evaluations"
FEATURES = ["cross_repository", "code_bearing", "activated_lesson_count"]
SOURCE_TRAIN_REPO = "github:81598961"

def extract(path):
    raw = path.read_bytes()
    r = json.loads(raw)
    if r.get("schema_name") != "FailureLearningPairedEvaluation":
        return None
    sel = r.get("selection", {})
    ref = sel.get("immutable_source_ref")
    if not (sel.get("contamination_state") == "CLEAN"
            and sel.get("cutoff_kind") == "IMMUTABLE_INITIAL_COMMIT"
            and isinstance(ref, str) and ref.startswith("git-commit:")
            and len(ref.removeprefix("git-commit:")) == 40
            and sel.get("source_digest") == ref
            and r.get("global_promotion_authorized") is False):
        raise ValueError(f"{path.name}: clean immutable cutoff and shadow-only state required")
    a, b, delta = (r["lessons_off"]["score"]["total"],
                   r["lessons_on"]["score"]["total"], r["observed_delta"])
    if not all(type(x) in (float, int) for x in (a, b, delta)) or not math.isclose(b-a,delta,abs_tol=1e-8):
        raise ValueError(f"{path.name}: inconsistent paired outcome")
    ids = r["lessons_on"]["activated_lesson_ids"]
    if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
        raise ValueError(f"{path.name}: invalid activated lesson IDs")
    repo = r["repository_id"]
    return {
        "id": r["evaluation_id"], "repo": repo,
        "features": [int(repo != SOURCE_TRAIN_REPO),
                     int(r.get("lane") in ("CODE_BEARING", "CODE_BEARING_CROSS_REPO")),
                     len(set(ids))],
        "label": int(delta > 0), "delta": float(delta),
        "digest": hashlib.sha256(raw).hexdigest()
    }

def load(paths):
    cases = [row for path in sorted(paths) if (row := extract(path)) is not None]
    if not cases or len(set(r["id"] for r in cases)) != len(cases):
        raise ValueError("No usable cases or duplicate evaluation IDs")
    return cases

def fit_predict(xtrain,ytrain,xtest,kind):
    if kind == "prior" or len(set(ytrain)) < 2:
        model = DummyClassifier(strategy="prior")
        method = "prior" if kind == "prior" else "single_class_prior_fallback"
    else:
        model = make_pipeline(StandardScaler(),LogisticRegression(C=1.0,max_iter=1000,random_state=0))
        method = "logistic"
    model.fit(xtrain,ytrain)
    classes = list(model.classes_)
    return ([float(row[classes.index(1)]) for row in model.predict_proba(xtest)]
            if 1 in classes else [0.0 for _ in xtest]), method

def score(cases, mode):
    x = [r["features"] for r in cases]
    y = [r["label"] for r in cases]
    groups = [r["repo"] for r in cases]
    if len(cases)<2 or (mode=="repository" and len(set(groups))<2):
        return {"status":"UNAVAILABLE_INSUFFICIENT_DATA"}
    cv = LeaveOneOut() if mode=="target" else LeaveOneGroupOut()
    rows=[]
    for train,test in cv.split(x,y,groups if mode=="repository" else None):
        tx=[x[i] for i in train]; ty=[y[i] for i in train]
        candidate,variant=fit_predict(tx,ty,[x[i] for i in test],"logistic")
        baseline,_=fit_predict(tx,ty,[x[i] for i in test],"prior")
        for j,idx in enumerate(test):
            rows.append({"target":cases[idx]["id"],"repository":cases[idx]["repo"],
                         "train_ids":[cases[k]["id"] for k in train],
                         "observed_positive":y[idx],"actual_delta":cases[idx]["delta"],
                         "candidate_probability":round(candidate[j],6),
                         "baseline_probability":round(baseline[j],6),"estimator":variant})
    rows.sort(key=lambda r:r["target"])
    metrics={}
    for name in ("candidate","baseline"):
        p=[r[name+"_probability"] for r in rows]
        t=[r["observed_positive"] for r in rows]
        metrics[name]={"accuracy":round(accuracy_score(t,[int(x>=0.5) for x in p]),6),
                       "brier":round(brier_score_loss(t,p),6),
                       "missed_negative_transfer":sum(int(y==0 and x>=0.5) for x,y in zip(p,t))}
    return {"status":"DIAGNOSTIC_ONLY", "folds":rows, "metrics":metrics,
            "brier_candidate_minus_baseline":round(metrics["candidate"]["brier"]-metrics["baseline"]["brier"],6),
            "independent_confirmation":False}

def evaluate(paths):
    cases=load(paths)
    x=[r["features"] for r in cases]; y=[r["label"] for r in cases]
    params=None
    if len(set(y))==2:
        model=make_pipeline(StandardScaler(), LogisticRegression(C=1.0,max_iter=1000,random_state=0))
        model.fit(x,y)
        params={"mean":model[0].mean_.tolist(),"scale":model[0].scale_.tolist(),
                "coefficient":model[1].coef_[0].tolist(),"intercept":float(model[1].intercept_[0]),
                "classes":model[1].classes_.tolist()}
    return {
        "schema":"AIOSLessonTransferShadow/1",
        "at":datetime.now(timezone.utc).isoformat(),
        "head":subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip(),
        "python":sys.version.split()[0],"sklearn":sklearn_version,"seed":0,
        "task":"POSITIVE_LESSON_TRANSFER_NOT_FAILURE_RISK",
        "feature_names":FEATURES,"count":len(cases),"repositories":len(set(r["repo"] for r in cases)),
        "cases":[{"id":r["id"],"repo":r["repo"],"digest":r["digest"],"delta":r["delta"]} for r in cases],
        "leave_one_target_out":score(cases,"target"),
        "leave_one_repository_out":score(cases,"repository"),
        "shadow_candidate":{"state":"SHADOW_ONLY" if params is not None else "UNTRAINED",
                             "fitted_on_previously_revealed_outcomes":True,
                             "parameters":params,"promotion_authorized":False,
                             "coder_activation_authorized":False},
        "limitations":["Previously revealed historical evaluations, not untouched holdout",
                       "Only one independent failure-risk training episode",
                       "Three paired cases are too few for reliable generalization",
                       "No benchmark certification or automated self-improvement claim",
                       "Outcome grades never used as predictors",
                       "Single-class folds use an explicit prior fallback"],
        "authority_effect":"NONE"}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--output",default=str(ROOT/"outputs/evaluations/failure-learning-ml.json"))
    p.add_argument("--inputs",nargs="*",type=Path)
    args=p.parse_args()
    try: report=evaluate(args.inputs if args.inputs else list(SOURCES.glob("holdout-*.json")))
    except (ValueError,KeyError,TypeError) as exc:
        print(json.dumps({"status":"INVALID_DATA","reason":str(exc)}),file=sys.stderr)
        return 2
    result=json.dumps(report,indent=2,sort_keys=True)+"\n"
    if args.output=="-": print(result,end="")
    else:
        dest=Path(args.output);dest.parent.mkdir(parents=True,exist_ok=True)
        tmp=dest.with_suffix(dest.suffix+".tmp");tmp.write_text(result,encoding="utf-8")
        os.replace(tmp,dest)
        print(json.dumps({"state":"SHADOW_DIAGNOSTIC_COMPLETE","count":report["count"],
                          "loo_metrics":report["leave_one_target_out"].get("metrics"),
                          "path":str(dest)}))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
