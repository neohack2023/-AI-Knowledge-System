# AIOS ChatGPT App Bridge v0.2

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
- `read_execution(execution_id)` — read-only execution status, ordered events, and execution-bound provenance snapshot.
- `read_execution_provenance(execution_id, provenance_envelope_id)` — minimum validated provenance projection for one exact execution-bound envelope.
- `run_backend_workflow(...)` — policy-bounded backend execution.
- `open_aios_workbench()` — renders `ui://aios/repo-workbench-v0.2.html` inside ChatGPT.

The two execution readers use the `AIOSChatBridge/0.2` contract and remain bounded to `global-working-memory`. They report `WORKFLOW_EXECUTION_KERNEL` as read authority and `write_authorization=NONE`. The provenance reader returns the kernel's minimum validated read projection rather than source payloads, policy internals, credentials, or write authorization.

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

## Safe local configuration

Local is the default deployment profile. The worker now binds to loopback by default so an accidental `python server.py` does not create a network-visible MCP service.

```bash
AIOS_BACKEND_ORIGIN=http://127.0.0.1:3000 \
AIOS_MCP_DEPLOYMENT_PROFILE=local \
HOST=127.0.0.1 \
PORT=8000 \
python worker/aios-chatgpt-app/server.py
```

The local endpoint is `http://127.0.0.1:8000/mcp`.

## Remote Developer Mode binding

Use `remote-dev` only after the AI Knowledge System backend has a stable HTTPS origin.

Required deployment values:

```text
AIOS_MCP_DEPLOYMENT_PROFILE=remote-dev
AIOS_BACKEND_ORIGIN=https://<deployed-aios-origin>
AIOS_BRIDGE_TOKEN=<secret shared with the backend>
HOST=0.0.0.0
PORT=8000
MCP_ALLOWED_HOSTS=<exact deployed MCP host>
MCP_ALLOWED_ORIGINS=<optional exact comma-separated origins>
```

A non-secret copy template lives at:

`config/aios-chatgpt-remote-dev.example`

Do not commit real environment files or secrets. The repository public-release policy intentionally deny-lists `.env*` paths.

### Transport security

A network-visible bind fails closed unless `MCP_ALLOWED_HOSTS` is configured. The worker passes explicit `TransportSecuritySettings` to the official MCP Python SDK so Host/Origin validation remains enabled behind a real hostname.

For the `remote-dev` profile the worker also requires:

- `AIOS_BACKEND_ORIGIN` to use HTTPS;
- `AIOS_BRIDGE_TOKEN` to be present;
- an explicit MCP host allowlist.

Origin values are not guessed or wildcarded. If the deployment receives an `Origin` header, add only the exact legitimate origin observed for the chosen connection path.

## Deployment verification

Local/runtime verification:

```bash
pip install -r worker/aios-chatgpt-app/requirements.txt
python worker/aios-chatgpt-app/smoke_test.py
```

Remote verification after an HTTPS endpoint exists:

```bash
python worker/aios-chatgpt-app/remote_smoke_test.py \
  --mcp-url https://<mcp-host>/mcp
```

The remote verifier uses the real MCP Streamable HTTP client and checks:

- the exact seven-tool surface and read-only annotations on all six read/render tools;
- `ui://aios/repo-workbench-v0.2.html` and `text/html;profile=mcp-app`;
- backend `READY` state;
- `REPOSITORY_EXECUTION_TRUTH_ONLY` coverage;
- `GITHUB_EXECUTION_TRUTH` authority;
- `write_authorization=NONE`;
- search/fetch identity;
- remote-dev workbench metadata;
- `internal-runtime-diagnostic` through the A0 process-local policy;
- a read-after-execute snapshot with ordered live events;
- an execution-bound provenance lookup returning `validity=VALID` and no write authorization.

A manual GitHub Action is also available at `.github/workflows/aios-chatgpt-deploy-binding.yml`. Configure the repository/environment secret `AIOS_MCP_URL` with the deployed HTTPS `/mcp` endpoint, then dispatch **AIOS ChatGPT Deploy Binding**.

## ChatGPT Developer Mode

After the remote verifier is green, register the same HTTPS `/mcp` URL in ChatGPT Developer Mode and refresh the app after tool/resource metadata changes. The final acceptance check is a ChatGPT-originated discovery/render/run, because a generic network client cannot prove the ChatGPT host itself loaded the app.

A Secure MCP Tunnel can be used for private development instead of a generally public MCP endpoint. The tunnel/deployment connection is an infrastructure action and is not stored as repository authority.

## Security status

This is still a Developer Mode fixture. `AIOS_BRIDGE_TOKEN` protects worker-to-backend traffic, and MCP transport Host/Origin validation is enforced for remote binds, but the MCP endpoint itself does not yet implement user OAuth. Do not treat this version as a public production app.

The exposed knowledge projection remains limited to repository execution truth until MCP user authentication and connector-backed authority adapters are separately admitted.

## GoG relationship

The inline widget can open the existing `/gog-3d-lab` web surface. The actual 2D→3D GPU provider remains behind the existing GoG provider API and is not duplicated inside the MCP worker.

A later slice can add a file-aware MCP reconstruction tool once the ChatGPT ↔ MCP ↔ AIOS backend deployment path is proven.
