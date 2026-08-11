# AIOS ChatGPT App Bridge v0.1

Status: `CANDIDATE / DEVELOPER_MODE_ONLY / NO MERGE AUTHORIZATION`

This worker exposes the AI Knowledge System backend to ChatGPT through a remote MCP endpoint and renders a small inline repository workbench.

## Architecture

```text
ChatGPT
  ↓ MCP Streamable HTTP
AIOS ChatGPT App worker `/mcp`
  ↓ server-to-server JSON
AI Knowledge System `/api/aios-bridge`
  ↓
Live capability registry + workflow kernel
```

The worker is intentionally thin. Backend execution truth stays in the TypeScript repository runtime.

## Tools

- `search(query)` — read-only standard company-knowledge search shape.
- `fetch(id)` — read-only standard company-knowledge fetch shape.
- `aios_status()` — live bridge, capability, and workflow inventory.
- `run_backend_workflow(...)` — policy-bounded backend execution.
- `open_aios_workbench()` — renders `ui://aios/repo-workbench-v0.1.html` inside ChatGPT.

## Execution policy

The live server kernel deliberately owns `LIVE` execution and rejects `SIMULATION`; presentation simulation remains a separate UI transport. The ChatGPT bridge therefore does not pretend to execute a server-side simulation.

`run_backend_workflow` calls `/api/aios-bridge` action `execute_safe_workflow`. The backend admits a workflow only when its registered capability is all of:

- `ACTIVE`
- `INTERNAL_NATIVE`
- `EXECUTION_LOCAL`
- `FULLY_REVERSIBLE`
- `PROCESS_LOCAL`
- autonomy band `A0`
- no approval required
- registered for `LIVE` execution

The bridge additionally blocks any `governed_write_probe` input. The current admitted proving workflow is `internal-runtime-diagnostic` without governed-write input.

## Authority boundary

The first bridge intentionally exposes only `REPOSITORY_EXECUTION_TRUTH_ONLY` under `global-working-memory`.

It does **not** expose the full Notion or Drive authority surface. It grants no destination-write authority, no canon promotion, no MASON write path, and no automatic memory mutation.

## Configuration

Required:

```bash
AIOS_BACKEND_ORIGIN=https://your-ai-knowledge-system.example
```

Optional server-to-server protection:

```bash
AIOS_BRIDGE_TOKEN=<same value configured on the AI Knowledge System backend>
```

Runtime:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r worker/aios-chatgpt-app/requirements.txt
python worker/aios-chatgpt-app/server.py
```

The default MCP endpoint is:

```text
http://localhost:8000/mcp
```

Use a public HTTPS tunnel or stable HTTPS deployment for ChatGPT Developer Mode.

## Security status

This is a developer-mode fixture. `AIOS_BRIDGE_TOKEN` protects worker-to-backend traffic when configured, but the MCP endpoint itself does not yet implement user OAuth. Do not treat this version as a public production app.

The exposed knowledge projection is intentionally limited to repository execution truth until MCP user authentication and connector-backed authority adapters are separately admitted.

## GoG relationship

The inline widget can open the existing `/gog-3d-lab` web surface. The actual 2D→3D GPU provider remains behind the existing GoG provider API and is not duplicated inside the MCP worker.

A later slice can add a file-aware MCP reconstruction tool once the base ChatGPT ↔ MCP ↔ AIOS backend path is proven.
