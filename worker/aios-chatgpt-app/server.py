"""ChatGPT-facing MCP bridge for the AI Knowledge System.

This service deliberately stays thin. Repository execution truth and workflow
logic remain in the deployed AI Knowledge System backend. The MCP server only
normalizes that backend into ChatGPT tools plus one inline workbench resource.

Initial authority boundary:
- search/fetch/status are read-only
- workflow calls are hard-coded to SIMULATION by the backend bridge
- no Notion/Drive memory authority is exposed here yet
- no destination-write or canon-promotion authority
- developer-mode fixture until MCP authentication is added
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp_types import ToolAnnotations

BACKEND_ORIGIN = os.environ.get("AIOS_BACKEND_ORIGIN", "").strip().rstrip("/")
BRIDGE_TOKEN = os.environ.get("AIOS_BRIDGE_TOKEN", "").strip()
WIDGET_URI = "ui://aios/repo-workbench-v0.1.html"
WIDGET_PATH = Path(__file__).with_name("widget.html")

mcp = MCPServer(
    "AI Knowledge System",
    title="AIOS Repo Workbench",
    description="Read repository execution truth and run bounded AIOS backend simulations from ChatGPT.",
    instructions=(
        "Use search and fetch for repository execution truth. "
        "Use run_backend_workflow only when a user explicitly wants to exercise a registered workflow. "
        "All workflow calls through this bridge are SIMULATION-only and carry no destination-write authority."
    ),
    version="0.1.0",
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
SIMULATION = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)


def _backend_url(path: str) -> str:
    if not BACKEND_ORIGIN:
        raise RuntimeError("AIOS_BACKEND_ORIGIN is not configured on the MCP worker")
    return f"{BACKEND_ORIGIN}{path}"


def _request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    headers = {"Accept": "application/json"}
    if BRIDGE_TOKEN:
        headers["Authorization"] = f"Bearer {BRIDGE_TOKEN}"

    body: bytes | None = None
    method = "GET"
    if payload is not None:
        method = "POST"
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")

    request = urllib.request.Request(_backend_url(path), data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(f"AIOS backend returned HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"AIOS backend is unreachable: {error.reason}") from error


@mcp.resource(
    WIDGET_URI,
    name="AIOS Repo Workbench",
    title="AIOS Repo Workbench",
    description="Inline ChatGPT UI for repository search and simulation-only workflow execution.",
    mime_type="text/html;profile=mcp-app",
    meta={
        "ui": {
            "prefersBorder": True,
            "csp": {"connectDomains": [], "resourceDomains": []},
        },
        "openai/widgetDescription": "Search AIOS repository execution truth and run bounded backend simulations.",
    },
)
def workbench_resource() -> str:
    return WIDGET_PATH.read_text(encoding="utf-8")


@mcp.tool(
    name="search",
    title="Search AIOS repository knowledge",
    description=(
        "Use this when the user needs read-only AI Knowledge System repository execution truth. "
        "Returns the standard company-knowledge search shape."
    ),
    annotations=READ_ONLY,
)
def search(query: str) -> str:
    """Search live repository-projected AIOS knowledge."""
    payload = _request("/api/aios-bridge", {"action": "search", "query": query})
    results = payload.get("results", [])
    standard = {
        "results": [
            {"id": item["id"], "title": item["title"], "url": item["url"]}
            for item in results
            if all(key in item for key in ("id", "title", "url"))
        ]
    }
    return json.dumps(standard, separators=(",", ":"))


@mcp.tool(
    name="fetch",
    title="Fetch AIOS repository knowledge",
    description=(
        "Use this after search when the user needs the full text and metadata for one AIOS repository record. "
        "Returns the standard company-knowledge fetch shape."
    ),
    annotations=READ_ONLY,
)
def fetch(id: str) -> str:
    """Fetch one exact repository knowledge record by id."""
    payload = _request("/api/aios-bridge", {"action": "fetch", "id": id})
    standard = {
        "id": payload["id"],
        "title": payload["title"],
        "text": payload["text"],
        "url": payload["url"],
        "metadata": payload.get("metadata", {}),
    }
    return json.dumps(standard, separators=(",", ":"))


@mcp.tool(
    name="aios_status",
    title="Read AIOS bridge status",
    description="Use this to read the live AIOS bridge, workflow, and capability inventory without changing backend state.",
    annotations=READ_ONLY,
)
def aios_status() -> dict[str, Any]:
    """Return the bounded bridge status and live runtime inventory."""
    return _request("/api/aios-bridge")


@mcp.tool(
    name="run_backend_workflow",
    title="Run an AIOS backend simulation",
    description=(
        "Use this only when the user explicitly wants to exercise a registered AIOS workflow from ChatGPT. "
        "This bridge always executes in SIMULATION mode and grants no destination-write authority."
    ),
    annotations=SIMULATION,
)
def run_backend_workflow(
    workflow_id: str,
    scope_key: str = "global-working-memory",
    input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute one registered workflow through the backend's SIMULATION-only bridge action."""
    return _request(
        "/api/aios-bridge",
        {
            "action": "simulate_workflow",
            "workflow_id": workflow_id,
            "scope_key": scope_key,
            "input": input or {},
        },
    )


@mcp.tool(
    name="open_aios_workbench",
    title="Open AIOS Repo Workbench",
    description=(
        "Use this when the user wants the interactive AIOS repository interface inside ChatGPT. "
        "The workbench can search repository execution truth and run simulation-only backend workflows."
    ),
    annotations=READ_ONLY,
    meta={
        "ui": {"resourceUri": WIDGET_URI},
        "openai/outputTemplate": WIDGET_URI,
    },
)
def open_aios_workbench() -> dict[str, Any]:
    """Render the inline ChatGPT workbench with current backend status."""
    status = _request("/api/aios-bridge")
    return {
        "status": status.get("status", "UNKNOWN"),
        "contract": status.get("contract"),
        "status_payload": status,
        "backend_origin": BACKEND_ORIGIN,
        "gog_lab_url": f"{BACKEND_ORIGIN}/gog-3d-lab" if BACKEND_ORIGIN else None,
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
    )
