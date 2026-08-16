#!/usr/bin/env python3
import argparse, json, pathlib, sys

ALLOWED_TERMINAL = {"VERIFIED"}

def verify(candidate, receipt):
    reasons = []
    required = ["chunk_id","candidate_digest","source_revision","license_gate"]
    for k in required:
        if not candidate.get(k): reasons.append(f"MISSING_CANDIDATE_{k.upper()}")
    for k in ["validation_run_id","chunk_id","candidate_digest","source_revision","terminal_status"]:
        if not receipt.get(k): reasons.append(f"MISSING_RECEIPT_{k.upper()}")
    if candidate.get("chunk_id") != receipt.get("chunk_id"): reasons.append("CHUNK_ID_MISMATCH")
    if candidate.get("candidate_digest") != receipt.get("candidate_digest"): reasons.append("DIGEST_MISMATCH")
    if candidate.get("source_revision") != receipt.get("source_revision"): reasons.append("SOURCE_REVISION_MISMATCH")
    if candidate.get("license_gate") != "PASS": reasons.append("LICENSE_NOT_PASS")
    if receipt.get("terminal_status") not in ALLOWED_TERMINAL: reasons.append(f"TERMINAL_NOT_ADMISSIBLE:{receipt.get('terminal_status')}")
    blocking = [g for g in receipt.get("gate_results",[]) if g.get("required") and g.get("result") not in {"PASS","NOT_APPLICABLE"}]
    if blocking: reasons.append("REQUIRED_GATE_NOT_PASS")
    return {"chunk_id":candidate.get("chunk_id"),"admitted":not reasons,"decision":"ADMIT_VERIFIED" if not reasons else "REJECT_ADMISSION","reason_codes":reasons,"validation_run_id":receipt.get("validation_run_id")}

def main():
    p=argparse.ArgumentParser(); p.add_argument("candidate"); p.add_argument("receipt"); p.add_argument("--out")
    a=p.parse_args(); c=json.loads(pathlib.Path(a.candidate).read_text()); r=json.loads(pathlib.Path(a.receipt).read_text())
    result=verify(c,r); text=json.dumps(result,indent=2,sort_keys=True)
    if a.out: pathlib.Path(a.out).write_text(text+"\n")
    print(text); return 0 if result["admitted"] else 2
if __name__=="__main__": sys.exit(main())
