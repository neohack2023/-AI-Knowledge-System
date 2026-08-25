from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REQUEST_PATH = ROOT / os.environ.get("BRIDGE_REQUEST", "site/gtterminal/bridge/request.json")
SESSION_PATH = ROOT / os.environ.get("BRIDGE_SESSION", "site/gtterminal/bridge/session.json")
RESULT_PATH = ROOT / os.environ.get("BRIDGE_RESULT", "site/gtterminal/bridge/result.json")
MIRROR_ROOT = ROOT / "site/gtterminal/mirror"
API_BASE = "https://neocities.org/api"
SITE_ORIGIN = "https://gtterminal.neocities.org"


def load_json(path: Path, default: dict) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def save_result(payload: dict) -> None:
    RESULT_PATH.write_text(
        json.dumps(
            {
                "bridge": "GT_TERMINAL_NEOCITIES_BRIDGE_01",
                "site_origin": SITE_ORIGIN,
                "completed_at": datetime.now(timezone.utc).isoformat(),
                **payload,
            },
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )


def active_session() -> bool:
    session = load_json(SESSION_PATH, {})
    if not session.get("enabled") or session.get("scope") != "gt-terminal":
        return False
    try:
        expiry = datetime.fromisoformat(str(session["expires_at"]).replace("Z", "+00:00"))
    except (KeyError, ValueError):
        return False
    return datetime.now(timezone.utc) < expiry.astimezone(timezone.utc)


def api_list() -> dict:
    key = os.environ.get("NEOCITIES_GTTERMINAL_API_KEY", "")
    if not key:
        raise RuntimeError("missing_secret")
    request = urllib.request.Request(
        API_BASE + "/list",
        headers={"Authorization": f"Bearer {key}", "User-Agent": "GT_TERMINAL_NEOCITIES_BRIDGE_01"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def safe_target(remote_path: str) -> Path:
    relative = Path(remote_path)
    if not remote_path or relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe_path:{remote_path}")
    target = (MIRROR_ROOT / relative).resolve()
    if MIRROR_ROOT.resolve() not in target.parents:
        raise ValueError(f"unsafe_target:{remote_path}")
    return target


def download(remote_path: str, target: Path) -> int:
    url = SITE_ORIGIN.rstrip("/") + "/" + urllib.parse.quote(remote_path, safe="/._-~")
    request = urllib.request.Request(url, headers={"User-Agent": "GT_TERMINAL_NEOCITIES_BRIDGE_01"})
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)
    return len(body)


def snapshot() -> dict:
    listing = api_list()
    files = [entry for entry in listing.get("files", []) if not entry.get("is_directory")]
    MIRROR_ROOT.mkdir(parents=True, exist_ok=True)
    copied, total = [], 0
    for entry in files:
        remote_path = str(entry["path"])
        target = safe_target(remote_path)
        size = download(remote_path, target)
        copied.append({**entry, "downloaded_size": size})
        total += size
    manifest = {
        "snapshot_id": datetime.now(timezone.utc).strftime("gt-terminal-%Y%m%dT%H%M%SZ"),
        "site_origin": SITE_ORIGIN,
        "source": "Neocities authenticated /api/list plus public file reads",
        "files": copied,
        "file_count": len(copied),
        "total_downloaded_bytes": total,
    }
    (MIRROR_ROOT / ".snapshot.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    return {"result": "success", "file_count": len(copied), "total_downloaded_bytes": total, "mirror_root": "site/gtterminal/mirror"}


def main() -> int:
    request = load_json(REQUEST_PATH, {})
    if request.get("op") != "snapshot":
        bridge = Path(__file__).with_name("bridge.py")
        os.execv(sys.executable, [sys.executable, str(bridge)])
    if not active_session():
        save_result({"request_id": request.get("request_id"), "ok": False, "op": "snapshot", "error": "session_expired_or_disabled"})
        return 3
    try:
        save_result({"request_id": request.get("request_id"), "ok": True, "op": "snapshot", "response": snapshot()})
        return 0
    except Exception as exc:
        save_result({"request_id": request.get("request_id"), "ok": False, "op": "snapshot", "error": str(exc)[:1200]})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
