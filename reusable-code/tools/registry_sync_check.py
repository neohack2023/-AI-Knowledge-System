#!/usr/bin/env python3
import argparse, json, pathlib, sys

def main():
    p=argparse.ArgumentParser()
    p.add_argument("registry_json", help="Exported registry rows keyed by chunk_id")
    p.add_argument("store_root", help="Path to reusable-code directory")
    a=p.parse_args()
    registry=json.loads(pathlib.Path(a.registry_json).read_text())
    root=pathlib.Path(a.store_root)
    findings=[]
    for chunk_id,row in registry.items():
        pointer=row.get("code_store_pointer")
        if pointer:
            manifest=root / pointer / "manifest.json"
            if not manifest.exists():
                findings.append({"chunk_id":chunk_id,"code":"STORE_POINTER_MISSING","pointer":pointer})
                continue
            data=json.loads(manifest.read_text())
            if data.get("chunk_id") != chunk_id:
                findings.append({"chunk_id":chunk_id,"code":"CHUNK_ID_DRIFT"})
            if row.get("validation_status") and data.get("status") != row.get("validation_status"):
                findings.append({"chunk_id":chunk_id,"code":"STATUS_DRIFT","registry":row.get("validation_status"),"store":data.get("status")})
    result={"ok":not findings,"finding_count":len(findings),"findings":findings}
    print(json.dumps(result,indent=2,sort_keys=True))
    return 0 if not findings else 3

if __name__ == "__main__":
    sys.exit(main())
