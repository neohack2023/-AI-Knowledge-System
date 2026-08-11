# AIOS ChatGPT Secure MCP Tunnel runbook

Gate: `AIOS_CHATGPT_APP_BRIDGE_MCP_LIVE_BINDING_04`

Purpose: connect the existing AIOS MCP worker to ChatGPT Developer Mode without exposing the MCP worker as a public network service.

## Preferred topology

```text
ChatGPT Developer Mode
        |
OpenAI-hosted Secure MCP Tunnel
        |
outbound HTTPS polling by tunnel-client
        |
http://127.0.0.1:8000/mcp
        |
AIOS MCP worker (local profile)
        |
https://ai-knowledge-system.neohack.chatgpt.site/api/aios-bridge
```

This is intentionally different from the public-host `remote-dev` profile. With Secure MCP Tunnel, the MCP worker stays loopback-only. `MCP_ALLOWED_HOSTS` is therefore not required for this tunnel-first fixture because the worker is not bound to a non-loopback interface. Do not switch to `HOST=0.0.0.0` merely to satisfy the tunnel path.

## Prerequisites

- A `tunnel_id` created in OpenAI Platform tunnel settings.
- Tunnels Read + Manage permission to create/edit the tunnel.
- Tunnels Read + Use permission to run `tunnel-client` and select the tunnel in ChatGPT.
- The tunnel must be associated with the ChatGPT workspace that will use it.
- A runtime API key for `tunnel-client` stored outside source control.
- The same `AIOS_BRIDGE_TOKEN` configured in the deployed AIOS backend and supplied to the local MCP worker. Do not commit the value.
- Python dependencies from `worker/aios-chatgpt-app/requirements.txt`.
- Current `tunnel-client` obtained from OpenAI Platform tunnel settings or the latest public `openai/tunnel-client` release. Do not pin a stale download URL in this repository.

## 1. Start the MCP worker locally

Use the loopback-safe profile:

```bash
export AIOS_MCP_DEPLOYMENT_PROFILE=local
export AIOS_BACKEND_ORIGIN="https://ai-knowledge-system.neohack.chatgpt.site"
export AIOS_BRIDGE_TOKEN="<secret-manager-value>"
export HOST="127.0.0.1"
export PORT="8000"

python -m pip install -r worker/aios-chatgpt-app/requirements.txt
python worker/aios-chatgpt-app/server.py
```

Do not set `MCP_ALLOWED_HOSTS` for this loopback-only fixture unless the worker configuration is intentionally changed to a non-loopback bind. The server already fails closed if a non-loopback bind is attempted without an allowlist.

## 2. Configure tunnel-client

In a separate shell on the same trusted host/network:

```bash
export CONTROL_PLANE_API_KEY="<runtime-api-key>"

tunnel-client init \
  --profile aios-chatgpt \
  --tunnel-id <tunnel_id> \
  --mcp-server-url http://127.0.0.1:8000/mcp

tunnel-client doctor --profile aios-chatgpt --explain
tunnel-client run --profile aios-chatgpt
```

Keep `tunnel-client run` healthy while ChatGPT is discovering or calling tools. The tunnel client needs outbound HTTPS to OpenAI and local reachability to the MCP worker; no inbound public port is required.

## 3. Local readiness checks

Before touching ChatGPT, require:

- the MCP worker is listening only on loopback;
- `tunnel-client doctor --profile aios-chatgpt --explain` reports a healthy/usable profile;
- the tunnel-client local health/readiness surfaces report ready;
- the deployed AIOS backend origin is reachable from the MCP worker;
- no secret values were written to repository files, issue comments, logs, Notion, or Drive.

## 4. Connect from ChatGPT Developer Mode

1. Enable Developer Mode in ChatGPT workspace settings if not already enabled.
2. Open ChatGPT Plugins and create a developer-mode app.
3. Under Connection choose `Tunnel`.
4. Select the associated tunnel or paste its `tunnel_id`.
5. Create the connection and review discovered metadata.

Expected discovery:

- `search`
- `fetch`
- `aios_status`
- `run_backend_workflow`
- `open_aios_workbench`
- resource `ui://aios/repo-workbench-v0.1.html`
- resource MIME `text/html;profile=mcp-app`

## 5. Acceptance test inside ChatGPT

Run, in order:

1. `aios_status` and require `READY`.
2. `search("workflow")` and require at least one repository record.
3. `fetch(<returned-id>)` and require `GITHUB_EXECUTION_TRUTH` metadata.
4. `open_aios_workbench` and require the inline workbench to render.
5. `internal-runtime-diagnostic` through `run_backend_workflow` with empty input and no governed-write probe.

Required authority assertions:

- `coverage=REPOSITORY_EXECUTION_TRUTH_ONLY`
- `authority=GITHUB_EXECUTION_TRUTH`
- `write_authorization=NONE`
- safe execution policy remains `A0_PROCESS_LOCAL_EXECUTION_ONLY`
- no Notion/Drive authority projection
- no MASON mutation, memory/canon promotion, or destination write

## 6. Evidence and rollback

Record without secrets:

- `tunnel_id` only if policy permits storing the identifier; never store the runtime API key.
- tunnel association/workspace used.
- `tunnel-client doctor` result classification, not raw secret-bearing output.
- ChatGPT discovery result.
- safe diagnostic result.
- current `main` commit and the earlier rollback anchors:
  - pre-Sites-binding main: `bebada2ad3f2a89e6f9741a10d4d017adfd90cd6`
  - evaluated Sites-binding head: `b25cd54508b9a1be580a88a74fbe2b625bb4716e`
  - Sites-binding merge commit: `49a7160db82be1a09c2dba2bdfcac390341c41a6`

If the tunnel path fails, do not widen AIOS authority, expose the worker publicly, or weaken DNS-rebinding protections to force a pass. Capture the failing layer and retry from the smallest affected layer.

## Public-host alternative

Only use the `remote-dev` profile when intentionally deploying the MCP worker behind a real HTTPS host. That path requires:

- `AIOS_MCP_DEPLOYMENT_PROFILE=remote-dev`
- HTTPS `AIOS_BACKEND_ORIGIN`
- `AIOS_BRIDGE_TOKEN`
- non-loopback `HOST`
- exact `MCP_ALLOWED_HOSTS`
- optional exact `MCP_ALLOWED_ORIGINS` when an Origin header is observed
- an HTTPS `/mcp` URL that can be verified by `worker/aios-chatgpt-app/remote_smoke_test.py`

For the current private Developer Mode fixture, Secure MCP Tunnel is the narrower and safer path.
