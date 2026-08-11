"""Executable smoke fixture for the AIOS ChatGPT MCP bridge.

This fixture proves the MCP SDK can import the server, discover its advertised
surface, read the inline UI resource, normalize representative backend results,
bind the Streamable HTTP endpoint locally, and fail closed when a remote bind is
missing its deployment security configuration. It does not claim a public
ChatGPT Developer Mode connection or a deployed backend origin.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SERVER_PATH = ROOT / "server.py"
EXPECTED_TOOLS = {
    "search",
    "fetch",
    "aios_status",
    "read_execution",
    "read_execution_provenance",
    "run_backend_workflow",
    "open_aios_workbench",
}
WIDGET_URI = "ui://aios/repo-workbench-v0.2.html"


def load_server_module():
    os.environ.setdefault("AIOS_BACKEND_ORIGIN", "http://127.0.0.1:9")
    spec = importlib.util.spec_from_file_location("aios_chatgpt_app_server", SERVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load MCP server module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def text_from_tool_result(result: Any) -> str:
    content = getattr(result, "content", None) or []
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            return text
    raise AssertionError(f"Tool result did not contain text content: {result!r}")


async def exercise_registered_surface(module) -> None:
    tools = await module.mcp.list_tools()
    tool_names = {tool.name for tool in tools}
    assert tool_names == EXPECTED_TOOLS, (tool_names, EXPECTED_TOOLS)
    by_name = {tool.name: tool for tool in tools}
    for name in {
        "search", "fetch", "aios_status", "read_execution",
        "read_execution_provenance", "open_aios_workbench",
    }:
        annotations = by_name[name].annotations
        assert annotations is not None
        assert annotations.read_only_hint is True, name

    resources = await module.mcp.list_resources()
    widget = next((resource for resource in resources if str(resource.uri) == WIDGET_URI), None)
    assert widget is not None, f"Missing UI resource {WIDGET_URI}"
    assert widget.mime_type == "text/html;profile=mcp-app", widget.mime_type

    resource_result = await module.mcp.read_resource(WIDGET_URI)
    resource_items = list(resource_result)
    assert resource_items, "Widget resource returned no content"
    html = str(resource_items[0].content)
    assert "AIOS Repo Workbench" in html
    assert "run_backend_workflow" in html
    assert "read_execution" in html
    assert "read_execution_provenance" in html
    assert "Execution trace" in html

    def fake_request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        assert path == "/api/aios-bridge"
        if payload is None:
            return {
                "contract": "AIOSChatBridge/0.2",
                "status": "READY",
                "coverage": "REPOSITORY_EXECUTION_TRUTH_ONLY",
                "authority": "GITHUB_EXECUTION_TRUTH",
                "write_authorization": "NONE",
                "records": 3,
                "live_workflows": [
                    {"workflow_id": "internal-runtime-diagnostic", "version": "1.2.0"}
                ],
            }
        action = payload.get("action")
        if action == "search":
            return {
                "results": [
                    {
                        "id": "repo:workflow:internal-runtime-diagnostic",
                        "title": "LIVE workflow: internal-runtime-diagnostic",
                        "url": "https://github.com/example/repo/blob/main/server/workflows/kernel.ts",
                    }
                ]
            }
        if action == "fetch":
            return {
                "id": payload["id"],
                "title": "LIVE workflow: internal-runtime-diagnostic",
                "text": "Process-local diagnostic workflow fixture.",
                "url": "https://github.com/example/repo/blob/main/server/workflows/kernel.ts",
                "metadata": {"authority": "GITHUB_EXECUTION_TRUTH"},
            }
        if action == "execute_safe_workflow":
            return {
                "contract": "AIOSChatBridge/0.2",
                "mode": "LIVE",
                "bridge_policy": "A0_PROCESS_LOCAL_EXECUTION_ONLY",
                "write_authorization": "NONE",
                "snapshot": {
                    "execution": {
                        "execution_id": "execution-fixture",
                        "workflow_id": "internal-runtime-diagnostic",
                        "scope_key": "global-working-memory",
                        "status": "COMPLETED",
                    },
                    "events": [{
                        "event_id": "event-fixture",
                        "execution_id": "execution-fixture",
                        "event_type": "workflow.execution.completed",
                        "sequence": 4,
                    }],
                    "provenance_envelopes": [{
                        "envelope_id": "envelope-fixture",
                        "used_by_execution_id": "execution-fixture",
                    }],
                },
            }
        if action == "read_execution":
            assert payload["execution_id"] == "execution-fixture"
            return {
                "contract": "AIOSChatBridge/0.2",
                "scope_key": "global-working-memory",
                "authority": "WORKFLOW_EXECUTION_KERNEL",
                "write_authorization": "NONE",
                "snapshot": {
                    "execution": {
                        "execution_id": "execution-fixture",
                        "workflow_id": "internal-runtime-diagnostic",
                        "scope_key": "global-working-memory",
                        "status": "COMPLETED",
                    },
                    "events": [{"event_id": "event-fixture", "sequence": 4}],
                    "provenance_envelopes": [{"envelope_id": "envelope-fixture"}],
                },
            }
        if action == "read_execution_provenance":
            assert payload["execution_id"] == "execution-fixture"
            assert payload["provenance_envelope_id"] == "envelope-fixture"
            return {
                "contract": "AIOSChatBridge/0.2",
                "authority": "WORKFLOW_EXECUTION_KERNEL",
                "write_authorization": "NONE",
                "provenance": {
                    "schema_name": "ContextProvenanceEnvelopeReadProjection",
                    "schema_version": "0.1",
                    "envelope_id": "envelope-fixture",
                    "used_by_execution_id": "execution-fixture",
                    "validity": "VALID",
                },
            }
        raise AssertionError(f"Unexpected fake bridge action: {action!r}")

    module._request = fake_request

    search_result = await module.mcp.call_tool("search", {"query": "workflow"})
    search_payload = json.loads(text_from_tool_result(search_result))
    assert search_payload["results"][0]["id"] == "repo:workflow:internal-runtime-diagnostic"

    fetch_result = await module.mcp.call_tool(
        "fetch", {"id": "repo:workflow:internal-runtime-diagnostic"}
    )
    fetch_payload = json.loads(text_from_tool_result(fetch_result))
    assert fetch_payload["metadata"]["authority"] == "GITHUB_EXECUTION_TRUTH"

    status_result = await module.mcp.call_tool("aios_status", {})
    assert getattr(status_result, "is_error", False) is False
    assert "READY" in text_from_tool_result(status_result)

    execution_result = await module.mcp.call_tool(
        "read_execution", {"execution_id": "execution-fixture"}
    )
    execution_payload = json.loads(text_from_tool_result(execution_result))
    assert execution_payload["write_authorization"] == "NONE"
    assert execution_payload["snapshot"]["events"][0]["sequence"] == 4

    provenance_result = await module.mcp.call_tool(
        "read_execution_provenance",
        {
            "execution_id": "execution-fixture",
            "provenance_envelope_id": "envelope-fixture",
        },
    )
    provenance_payload = json.loads(text_from_tool_result(provenance_result))
    assert provenance_payload["provenance"]["validity"] == "VALID"
    assert provenance_payload["provenance"]["used_by_execution_id"] == "execution-fixture"

    run_result = await module.mcp.call_tool(
        "run_backend_workflow",
        {
            "workflow_id": "internal-runtime-diagnostic",
            "scope_key": "global-working-memory",
            "input": {},
        },
    )
    assert getattr(run_result, "is_error", False) is False
    assert "A0_PROCESS_LOCAL_EXECUTION_ONLY" in text_from_tool_result(run_result)

    open_result = await module.mcp.call_tool("open_aios_workbench", {})
    assert getattr(open_result, "is_error", False) is False
    assert "gog_lab_url" in text_from_tool_result(open_result)


def exercise_deployment_security(module) -> None:
    original_profile = module.DEPLOYMENT_PROFILE
    original_origin = module.BACKEND_ORIGIN
    original_token = module.BRIDGE_TOKEN
    original_hosts = os.environ.get("MCP_ALLOWED_HOSTS")
    original_origins = os.environ.get("MCP_ALLOWED_ORIGINS")
    try:
        module.DEPLOYMENT_PROFILE = "local"
        os.environ.pop("MCP_ALLOWED_HOSTS", None)
        os.environ.pop("MCP_ALLOWED_ORIGINS", None)
        assert module._transport_security_for("127.0.0.1") is None

        try:
            module._transport_security_for("0.0.0.0")
        except RuntimeError as error:
            assert "MCP_ALLOWED_HOSTS" in str(error)
        else:
            raise AssertionError("Non-loopback local profile did not fail closed")

        module.DEPLOYMENT_PROFILE = "remote-dev"
        module.BACKEND_ORIGIN = "http://backend.example"
        module.BRIDGE_TOKEN = "fixture-token"
        os.environ["MCP_ALLOWED_HOSTS"] = "mcp.example.test"
        try:
            module._transport_security_for("0.0.0.0")
        except RuntimeError as error:
            assert "HTTPS" in str(error)
        else:
            raise AssertionError("remote-dev accepted a non-HTTPS backend")

        module.BACKEND_ORIGIN = "https://backend.example"
        module.BRIDGE_TOKEN = ""
        try:
            module._transport_security_for("0.0.0.0")
        except RuntimeError as error:
            assert "AIOS_BRIDGE_TOKEN" in str(error)
        else:
            raise AssertionError("remote-dev accepted a missing backend token")

        module.BRIDGE_TOKEN = "fixture-token"
        os.environ["MCP_ALLOWED_ORIGINS"] = "https://chatgpt.example.test"
        security = module._transport_security_for("0.0.0.0")
        assert security is not None
        assert security.enable_dns_rebinding_protection is True
        assert security.allowed_hosts == ["mcp.example.test"]
        assert security.allowed_origins == ["https://chatgpt.example.test"]
    finally:
        module.DEPLOYMENT_PROFILE = original_profile
        module.BACKEND_ORIGIN = original_origin
        module.BRIDGE_TOKEN = original_token
        if original_hosts is None:
            os.environ.pop("MCP_ALLOWED_HOSTS", None)
        else:
            os.environ["MCP_ALLOWED_HOSTS"] = original_hosts
        if original_origins is None:
            os.environ.pop("MCP_ALLOWED_ORIGINS", None)
        else:
            os.environ["MCP_ALLOWED_ORIGINS"] = original_origins


def probe_streamable_http_binding() -> None:
    env = os.environ.copy()
    env.update(
        {
            "AIOS_BACKEND_ORIGIN": "http://127.0.0.1:9",
            "AIOS_MCP_DEPLOYMENT_PROFILE": "local",
            "HOST": "127.0.0.1",
            "PORT": "8765",
        }
    )
    env.pop("MCP_ALLOWED_HOSTS", None)
    env.pop("MCP_ALLOWED_ORIGINS", None)
    proc = subprocess.Popen(
        [sys.executable, str(SERVER_PATH)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                output = proc.stdout.read() if proc.stdout else ""
                raise AssertionError(f"MCP server exited before binding:\n{output}")
            try:
                with socket.create_connection(("127.0.0.1", 8765), timeout=0.3):
                    break
            except OSError:
                time.sleep(0.15)
        else:
            raise AssertionError("MCP server did not bind localhost:8765")

        request = urllib.request.Request(
            "http://127.0.0.1:8765/mcp",
            headers={"Accept": "application/json, text/event-stream"},
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=2) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
        assert status < 500, f"/mcp transport returned server error HTTP {status}"
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def main() -> None:
    module = load_server_module()
    asyncio.run(exercise_registered_surface(module))
    exercise_deployment_security(module)
    probe_streamable_http_binding()
    print("AIOS_CHATGPT_APP_BRIDGE_FIXTURE_01 local MCP + deployment security smoke: PASS")


if __name__ == "__main__":
    main()
