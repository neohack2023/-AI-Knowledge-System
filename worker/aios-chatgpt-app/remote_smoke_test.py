"""Remote deployment verifier for AIOS_CHATGPT_APP_BRIDGE_DEPLOY_BINDING_02.

Run this only after an MCP endpoint is reachable through HTTPS. It connects
through the real Streamable HTTP client, verifies the advertised tool/resource
surface, checks the authority boundary reported by the backend, and optionally
runs the admitted process-local diagnostic workflow.

This test is intentionally client-side. A PASS proves the deployed MCP URL is
reachable and functional from the network where the test is executed. It does
not by itself prove that ChatGPT Developer Mode has registered the app or
rendered the widget inside a conversation.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from typing import Any
from urllib.parse import urlparse

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

EXPECTED_TOOLS = {
    "search",
    "fetch",
    "aios_status",
    "run_backend_workflow",
    "open_aios_workbench",
}
WIDGET_URI = "ui://aios/repo-workbench-v0.1.html"


def text_from_result(result: Any) -> str:
    content = getattr(result, "content", None) or []
    for block in content:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            return text
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return json.dumps(structured)
    raise AssertionError(f"MCP result contained no text payload: {result!r}")


def parse_json_result(result: Any) -> dict[str, Any]:
    text = text_from_result(result)
    value = json.loads(text)
    if not isinstance(value, dict):
        raise AssertionError(f"Expected object result, got {type(value).__name__}")
    return value


def validate_url(url: str, allow_http_localhost: bool) -> None:
    parsed = urlparse(url)
    if parsed.path.rstrip("/") != "/mcp":
        raise SystemExit("MCP URL must end in /mcp")
    if parsed.scheme == "https":
        return
    if allow_http_localhost and parsed.scheme == "http" and parsed.hostname in {
        "127.0.0.1",
        "localhost",
        "::1",
    }:
        return
    raise SystemExit("Remote binding verification requires an HTTPS /mcp URL")


async def verify(url: str, run_safe_workflow: bool) -> None:
    async with streamable_http_client(url) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()

            tools_result = await session.list_tools()
            tool_names = {tool.name for tool in tools_result.tools}
            assert tool_names == EXPECTED_TOOLS, (tool_names, EXPECTED_TOOLS)

            resources_result = await session.list_resources()
            widget = next(
                (
                    resource
                    for resource in resources_result.resources
                    if str(resource.uri) == WIDGET_URI
                ),
                None,
            )
            assert widget is not None, f"Missing UI resource {WIDGET_URI}"
            mime = getattr(widget, "mime_type", None) or getattr(widget, "mimeType", None)
            assert mime == "text/html;profile=mcp-app", mime

            widget_result = await session.read_resource(WIDGET_URI)
            assert widget_result.contents, "Widget resource returned no content"
            widget_text = getattr(widget_result.contents[0], "text", "")
            assert "AIOS Repo Workbench" in widget_text

            status = parse_json_result(await session.call_tool("aios_status", arguments={}))
            assert status.get("status") == "READY", status
            assert status.get("coverage") == "REPOSITORY_EXECUTION_TRUTH_ONLY", status
            assert status.get("authority") == "GITHUB_EXECUTION_TRUTH", status
            assert status.get("write_authorization") == "NONE", status

            search_payload = parse_json_result(
                await session.call_tool("search", arguments={"query": "workflow"})
            )
            results = search_payload.get("results") or []
            assert results, "Remote search returned no workflow records"
            record_id = results[0]["id"]

            fetched = parse_json_result(
                await session.call_tool("fetch", arguments={"id": record_id})
            )
            assert fetched.get("id") == record_id
            metadata = fetched.get("metadata") or {}
            assert metadata.get("authority") == "GITHUB_EXECUTION_TRUTH", metadata

            opened = parse_json_result(
                await session.call_tool("open_aios_workbench", arguments={})
            )
            assert opened.get("status") == "READY", opened
            assert opened.get("deployment_profile") == "remote-dev", opened
            assert str(opened.get("backend_origin", "")).startswith("https://"), opened

            if run_safe_workflow:
                execution = parse_json_result(
                    await session.call_tool(
                        "run_backend_workflow",
                        arguments={
                            "workflow_id": "internal-runtime-diagnostic",
                            "scope_key": "global-working-memory",
                            "input": {},
                        },
                    )
                )
                assert execution.get("write_authorization") == "NONE", execution
                assert execution.get("bridge_policy") == "A0_PROCESS_LOCAL_EXECUTION_ONLY", execution
                snapshot = execution.get("snapshot") or {}
                execution_state = snapshot.get("execution") or {}
                assert execution_state.get("status") == "COMPLETED", execution

    print("AIOS_CHATGPT_APP_BRIDGE_DEPLOY_BINDING_02 remote MCP smoke: PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mcp-url",
        default=os.environ.get("AIOS_MCP_URL", ""),
        help="Deployed Streamable HTTP endpoint, for example https://mcp.example.com/mcp",
    )
    parser.add_argument(
        "--skip-safe-workflow",
        action="store_true",
        help="Verify read-only tools/resources without running internal-runtime-diagnostic",
    )
    parser.add_argument(
        "--allow-http-localhost",
        action="store_true",
        help="Permit http://localhost only for controlled development",
    )
    args = parser.parse_args()
    if not args.mcp_url:
        raise SystemExit("Provide --mcp-url or AIOS_MCP_URL")
    validate_url(args.mcp_url, args.allow_http_localhost)
    asyncio.run(verify(args.mcp_url, not args.skip_safe_workflow))


if __name__ == "__main__":
    main()