from __future__ import annotations

import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REQUEST_PATH = ROOT / os.environ.get("BRIDGE_REQUEST", "site/gtterminal/bridge/request.json")
SESSION_PATH = ROOT / os.environ.get("BRIDGE_SESSION", "site/gtterminal/bridge/session.json")
RESULT_PATH = ROOT / os.environ.get("BRIDGE_RESULT", "site/gtterminal/bridge/result.json")
API_BASE = "https://neocities.org/api"
SITE_ORIGIN = "https://gtterminal.neocities.org"
MAX_TEXT_UPLOAD = 512_000
ALLOWED_OPS = {"noop", "info", "list", "create_directory", "upload_text", "delete", "session_status"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def save_result(payload: dict) -> None:
    payload = {
        "bridge": "GT_TERMINAL_NEOCITIES_BRIDGE_01",
        "site_origin": SITE_ORIGIN,
        "completed_at": now_iso(),
        **payload,
    }
    RESULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def session_state() -> tuple[bool, str]:
    data = load_json(SESSION_PATH, {})
    if not data.get("enabled"):
        return False, "session_disabled"
    expires_at = data.get("expires_at")
    if not expires_at:
        return False, "missing_expiry"
    try:
        dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return False, "invalid_expiry"
    if datetime.now(timezone.utc) >= dt.astimezone(timezone.utc):
        return False, "session_expired"
    return True, "active"


def api_request(path: str, *, method: str = "GET", data: bytes | None = None, content_type: str | None = None):
    key = os.environ.get("NEOCITIES_GTTERMINAL_API_KEY", "")
    if not key:
        raise RuntimeError("missing_secret")
    headers = {
        "Authorization": f"Bearer {key}",
        "User-Agent": "GT_TERMINAL_NEOCITIES_BRIDGE_01",
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read()
            ctype = resp.headers.get_content_type()
            if ctype == "application/json" or raw[:1] in (b"{", b"["):
                return json.loads(raw.decode("utf-8"))
            return {"http_status": resp.status, "body_preview": raw[:400].decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        body = e.read()[:1000].decode("utf-8", "replace")
        raise RuntimeError(f"http_{e.code}:{body}") from None


def multipart_upload(remote_path: str, content: bytes, mime_type: str) -> dict:
    boundary = f"----gtterminal{int(time.time() * 1000)}"
    safe_name = remote_path.replace('"', "")
    parts = [
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{safe_name}"; filename="{Path(safe_name).name}"\r\n'.encode(),
        f"Content-Type: {mime_type}\r\n\r\n".encode(),
        content,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return api_request("/upload", method="POST", data=b"".join(parts), content_type=f"multipart/form-data; boundary={boundary}")


def validate_remote_path(path: str) -> str:
    path = path.strip().lstrip("/")
    if not path or path.startswith(".") or ".." in Path(path).parts:
        raise ValueError("unsafe_path")
    return path


def main() -> int:
    req = load_json(REQUEST_PATH, {"request_id": "bootstrap", "op": "noop"})
    request_id = str(req.get("request_id") or "missing")[:120]
    op = str(req.get("op") or "noop")

    if op not in ALLOWED_OPS:
        save_result({"request_id": request_id, "ok": False, "error": "operation_not_allowed", "op": op})
        return 2

    active, session_reason = session_state()
    if op == "session_status":
        save_result({"request_id": request_id, "ok": True, "op": op, "session": {"active": active, "reason": session_reason}})
        return 0

    if op == "noop":
        save_result({"request_id": request_id, "ok": True, "op": op, "message": "bridge_ready"})
        return 0

    if not active:
        save_result({"request_id": request_id, "ok": False, "op": op, "error": session_reason})
        return 3

    try:
        if op == "info":
            response = api_request("/info")

        elif op == "list":
            path = str(req.get("path") or "").strip().lstrip("/")
            suffix = ""
            if path:
                suffix = "?" + urllib.parse.urlencode({"path": path})
            response = api_request("/list" + suffix)

        elif op == "create_directory":
            path = validate_remote_path(str(req.get("path") or ""))
            body = urllib.parse.urlencode({"path": path}).encode()
            response = api_request("/create_directory", method="POST", data=body, content_type="application/x-www-form-urlencoded")

        elif op == "delete":
            files = req.get("files")
            if not isinstance(files, list) or not files:
                raise ValueError("files_required")
            clean = [validate_remote_path(str(x)) for x in files]
            if "index.html" in clean:
                raise ValueError("index_delete_blocked")
            body = urllib.parse.urlencode([("filenames[]", x) for x in clean]).encode()
            response = api_request("/delete", method="POST", data=body, content_type="application/x-www-form-urlencoded")

        elif op == "upload_text":
            remote_path = validate_remote_path(str(req.get("path") or ""))
            content = req.get("content")
            if not isinstance(content, str):
                raise ValueError("text_content_required")
            raw = content.encode("utf-8")
            if len(raw) > MAX_TEXT_UPLOAD:
                raise ValueError("text_upload_too_large")
            mime = str(req.get("mime_type") or mimetypes.guess_type(remote_path)[0] or "text/plain")
            response = multipart_upload(remote_path, raw, mime)

        else:
            raise RuntimeError("unreachable")

        save_result({"request_id": request_id, "ok": True, "op": op, "response": response})
        return 0

    except Exception as exc:
        # Secret is never included in exceptions or result payloads.
        save_result({"request_id": request_id, "ok": False, "op": op, "error": str(exc)[:1200]})
        return 1


if __name__ == "__main__":
    sys.exit(main())
