from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
AUDIT_DIR = ROOT / "site/gtterminal/audits/GT_TERMINAL_LANDING_AUDIT_01"
CANDIDATE = AUDIT_DIR / "index-v2.html"
RECEIPT = AUDIT_DIR / "receipt.json"
SITE_ORIGIN = "https://gtterminal.neocities.org"
API_BASE = "https://neocities.org/api"
SNAPSHOT_DIR = "snapshots/GT_TERMINAL_LANDING_AUDIT_01"
SNAPSHOT_PATH = f"{SNAPSHOT_DIR}/index.html"
CANDIDATE_PATH = "index-v2.html"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def auth_headers(accept: str = "application/json") -> dict[str, str]:
    key = os.environ.get("NEOCITIES_GTTERMINAL_API_KEY", "")
    if not key:
        raise RuntimeError("missing_secret")
    return {
        "Authorization": f"Bearer {key}",
        "User-Agent": "GT_TERMINAL_LANDING_AUDIT_01",
        "Accept": accept,
    }


def api_form(path: str, fields: list[tuple[str, str]]) -> dict:
    body = urllib.parse.urlencode(fields).encode()
    headers = auth_headers()
    headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(API_BASE + path, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_dir(path: str) -> None:
    try:
        result = api_form("/create_directory", [("path", path)])
        if result.get("result") not in {"success", None}:
            raise RuntimeError(f"create_directory_failed:{path}:{result}")
    except Exception as exc:
        # Neocities may report an already-existing directory as an error.
        # Verify via list before failing hard.
        q = urllib.parse.urlencode({"path": path})
        req = urllib.request.Request(API_BASE + "/list?" + q, headers=auth_headers(), method="GET")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data.get("result") == "success":
                return
        except Exception:
            pass
        raise RuntimeError(f"directory_unavailable:{path}:{exc}") from None


def multipart_upload(remote_path: str, content: bytes, mime_type: str) -> dict:
    boundary = f"----gtaudit{int(time.time() * 1000)}"
    safe_name = remote_path.replace('"', "")
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{safe_name}"; filename="{Path(safe_name).name}"\r\n'.encode(),
        f"Content-Type: {mime_type}\r\n\r\n".encode(),
        content,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    headers = auth_headers()
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    req = urllib.request.Request(API_BASE + "/upload", data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_public(path: str) -> tuple[bytes, str]:
    url = SITE_ORIGIN.rstrip("/") + "/" + path.lstrip("/")
    req = urllib.request.Request(url, headers={"User-Agent": "GT_TERMINAL_LANDING_AUDIT_01"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        ctype = resp.headers.get_content_type() or "application/octet-stream"
    return raw, ctype


def list_path(path: str) -> dict:
    q = urllib.parse.urlencode({"path": path}) if path else ""
    url = API_BASE + "/list" + (("?" + q) if q else "")
    req = urllib.request.Request(url, headers=auth_headers(), method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def find_entry(data: dict, wanted: str) -> dict | None:
    for item in data.get("files", []):
        if item.get("path") == wanted:
            return item
    return None


def main() -> None:
    original, original_type = get_public("index.html")
    original_sha256 = hashlib.sha256(original).hexdigest()

    ensure_dir("snapshots")
    ensure_dir(SNAPSHOT_DIR)

    snap_result = multipart_upload(SNAPSHOT_PATH, original, original_type or "text/html")
    if snap_result.get("result") != "success":
        raise RuntimeError(f"snapshot_upload_failed:{snap_result}")

    candidate = CANDIDATE.read_bytes()
    candidate_sha256 = hashlib.sha256(candidate).hexdigest()
    v2_result = multipart_upload(CANDIDATE_PATH, candidate, "text/html")
    if v2_result.get("result") != "success":
        raise RuntimeError(f"candidate_upload_failed:{v2_result}")

    snapshot_inventory = list_path(SNAPSHOT_DIR)
    root_inventory = list_path("")
    snapshot_entry = find_entry(snapshot_inventory, SNAPSHOT_PATH)
    candidate_entry = find_entry(root_inventory, CANDIDATE_PATH)

    receipt = {
        "audit_id": "GT_TERMINAL_LANDING_AUDIT_01",
        "completed_at": now_iso(),
        "site_origin": SITE_ORIGIN,
        "source": {
            "path": "index.html",
            "sha256": original_sha256,
            "bytes": len(original),
        },
        "snapshot": {
            "path": SNAPSHOT_PATH,
            "url": f"{SITE_ORIGIN}/{SNAPSHOT_PATH}",
            "sha256": original_sha256,
            "inventory": snapshot_entry,
        },
        "candidate": {
            "path": CANDIDATE_PATH,
            "url": f"{SITE_ORIGIN}/{CANDIDATE_PATH}",
            "sha256": candidate_sha256,
            "bytes": len(candidate),
            "inventory": candidate_entry,
        },
        "reversal_contract": {
            "production_index_modified": False,
            "rollback_source": SNAPSHOT_PATH,
            "promotion": "manual after visual review",
        },
        "secret_handling": "Neocities key used only as encrypted GitHub Actions secret; never written to receipt or output.",
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "audit_id": receipt["audit_id"],
        "snapshot": receipt["snapshot"]["url"],
        "candidate": receipt["candidate"]["url"],
        "source_sha256": original_sha256,
        "candidate_sha256": candidate_sha256,
        "production_index_modified": False,
    }))


if __name__ == "__main__":
    main()
