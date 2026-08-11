"""ChatGPT-facing MCP bridge for the AI Knowledge System.

This service deliberately stays thin. Repository execution truth and workflow
logic remain in the deployed AI Knowledge System backend. The MCP server only
normalizes that backend into ChatGPT tools plus one inline workbench resource.

Initial authority boundary:
- search/fetch/status/execution/provenance reads are read-only
- workflow execution is restricted by the backend to A0, INTERNAL_NATIVE,
  EXECUTION_LOCAL, FULLY_REVERSIBLE, PROCESS_LOCAL handlers
- governed_write_probe input is explicitly blocked
- no Notion/Drive memory authority is exposed here yet
- no destination-write or canon-promotion authority
- developer-mode fixture until MCP user authentication is added

Deployment boundary:
- local is the safe default and binds only to loopback
- remote-dev requires an HTTPS AIOS backend origin, a backend bridge token,
  and explicit MCP Host/Origin allowlists
- a non-loopback bind without explicit transport security fails closed
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp_types import ToolAnnotations

BACKEND_ORIGIN = os.environ.get("AIOS_BACKEND_ORIGIN", "").strip().rstrip("/")
BRIDGE_TOKEN = os.environ.get("AIOS_BRIDGE_TOKEN", "").strip()
DEPLOYMENT_PROFILE = os.environ.get("AIOS_MCP_DEPLOYMENT_PROFILE", "local").strip().lower()
WIDGET_URI = "ui://aios/repo-workbench-v0.2.html"
WIDGET_PATH = Path(__file__).with_name("widget.html")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}

mcp = MCPServer(
    "AI Knowledge System",
    title="AIOS Repo Workbench",
    description="Read repository and live execution truth, then run policy-bounded AIOS backend logic from ChatGPT.",
    instructions=(
        "Use search and fetch for repository execution truth. "
        "Use read_execution for an execution-scoped live snapshot and "
        "read_execution_provenance for the minimum validated provenance projection. "
        "Use run_backend_workflow only when a user explicitly wants to exercise a registered backend workflow. "
        "The backend admits only A0 process-local execution and blocks governed-write input."
    ),
    version="0.2.0",
)

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
PROCESS_LOCAL_EXECUTION = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)


def _csv_env(name: str) -> list[str]:
    raw = os.environ.get(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


def _transport_security_for(host: str) -> TransportSecuritySettings | None:
    """Build the MCP transport-security policy and fail closed for remote binds."""
    allowed_hosts = _csv_env("MCP_ALLOWED_HOSTS")
    allowed_origins = _csv_env("MCP_ALLOWED_ORIGINS")

    if DEPLOYMENT_PROFILE not in {"local", "remote-dev"}:
        raise RuntimeError(
            "AIOS_MCP_DEPLOYMENT_PROFILE must be 'local' or 'remote-dev' for this fixture"
        )

    if DEPLOYMENT_PROFILE == "local":
        if host in LOOPBACK_HOSTS and not allowed_hosts and not allowed_origins:
            # The MCP SDK auto-enables loopback-only DNS-rebinding protection.
            return None
        if not allowed_hosts:
            raise RuntimeError(
                "Non-loopback MCP binds require MCP_ALLOWED_HOSTS; refusing insecure startup"
            )
        return TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=allowed_hosts,
            allowed_origins=allowed_origins,
        )

    # remote-dev is intentionally strict because the endpoint becomes reachable
    # outside the local process boundary. It is still not a public-production
    # profile because MCP user OAuth is a separate future gate.
    if not BACKEND_ORIGIN.startswith("https://"):
        raise RuntimeError(
            "remote-dev requires AIOS_BACKEND_ORIGIN to use HTTPS"
        )
    if not BRIDGE_TOKEN:
        raise RuntimeError(
            "remote-dev requires AIOS_BRIDGE_TOKEN for worker-to-backend authentication"
        )
    if not allowed_hosts:
        raise RuntimeError(
            "remote-dev requires MCP_ALLOWED_HOSTS for DNS-rebinding protection"
        )
    return TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=allowed_hosts,
        allowed_origins=allowed_origins,
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
    description="Inline ChatGPT UI for repository search, live execution inspection, and policy-bounded process-local workflow execution.",
    mime_type="text/html;profile=mcp-app",
    meta={
        "ui": {
            "prefersBorder": True,
            "csp": {"connectDomains": [], "resourceDomains": []},
        },
        "openai/widgetDescription": "Search AIOS repository truth, inspect live execution traces, and run bounded backend logic.",
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
    name="read_execution",
    title="Read AIOS execution snapshot",
    description=(
        "Use this when the user needs the current status, ordered events, and execution-bound provenance "
        "for one exact live AIOS execution. This is read-only and grants no workflow or destination-write authority."
    ),
    annotations=READ_ONLY,
)
def read_execution(execution_id: str) -> dict[str, Any]:
    """Read one exact workflow execution snapshot through the bounded bridge."""
    return _request(
        "/api/aios-bridge",
        {"action": "read_execution", "execution_id": execution_id},
    )


@mcp.tool(
    name="read_execution_provenance",
    title="Read validated AIOS execution provenance",
    description=(
        "Use this when the user needs the minimum validated provenance projection for one envelope already "
        "identified inside a specific AIOS execution. The lookup is execution-bound, read-only, and does not "
        "expose source payloads, policy internals, credentials, or write authorization."
    ),
    annotations=READ_ONLY,
)
def read_execution_provenance(
    execution_id: str,
    provenance_envelope_id: str,
) -> dict[str, Any]:
    """Read one execution-bound provenance projection through the bounded bridge."""
    return _request(
        "/api/aios-bridge",
        {
            "action": "read_execution_provenance",
            "execution_id": execution_id,
            "provenance_envelope_id": provenance_envelope_id,
        },
    )


@mcp.tool(
    name="run_backend_workflow",
    title="Run safe AIOS backend logic",
    description=(
        "Use this only when the user explicitly wants to exercise a registered AIOS backend workflow from ChatGPT. "
        "The backend allows only A0, INTERNAL_NATIVE, EXECUTION_LOCAL, FULLY_REVERSIBLE, PROCESS_LOCAL LIVE execution, "
        "blocks governed_write_probe input, and grants no destination-write authority."
    ),
    annotations=PROCESS_LOCAL_EXECUTION,
)
def run_backend_workflow(
    workflow_id: str,
    scope_key: str = "global-working-memory",
    input: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute one workflow through the backend-enforced safe process-local policy."""
    return _request(
        "/api/aios-bridge",
        {
            "action": "execute_safe_workflow",
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
        "The workbench can search repository execution truth, inspect live execution events and provenance, "
        "and invoke policy-bounded process-local backend logic."
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
        "deployment_profile": DEPLOYMENT_PROFILE,
        "gog_lab_url": f"{BACKEND_ORIGIN}/gog-3d-lab" if BACKEND_ORIGIN else None,
    }


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "127.0.0.1").strip()
    transport_security = _transport_security_for(host)
    mcp.run(
        transport="streamable-http",
        host=host,
        port=port,
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        transport_security=transport_security,
    )
