# AIOS_CHATGPT_APP_BRIDGE_DEPLOY_BINDING_02

Status: `PASS_PREDEPLOY_BINDING_CONTROLS / BLOCKED_REMOTE_ENDPOINT_PROVISION / BLOCKED_CHATGPT_CONNECTION / NO_MERGE_AUTHORIZATION`

Date: 2026-08-10 America/Indiana/Indianapolis

## Purpose

Move the AIOS ChatGPT app bridge from a locally proven MCP runtime to a deployment-ready, remotely verifiable binding without weakening authority, repository release policy, or MCP transport security.

## Starting state

`AIOS_CHATGPT_APP_BRIDGE_FIXTURE_01` proved the local MCP runtime, exact tool/resource surface, representative backend calls, and local `/mcp` binding. It stopped because no public/tunneled MCP endpoint or ChatGPT Developer Mode connection was available to the execution environment.

The repository already contains `.openai/hosting.json` with an OpenAI Sites project ID, and the starter README states that pushed commits are built by the remote Sites builder. The repository does not contain or expose the deployed Sites origin, so the backend URL cannot be inferred safely from source.

## Deployment research applied

Current OpenAI ChatGPT app guidance requires the MCP server to be reachable through an HTTPS connection for Developer Mode testing; private development can use a secure tunnel instead of generally publishing the service.

The Model Context Protocol Streamable HTTP specification requires Host/Origin protections against DNS rebinding. The official MCP Python SDK documents an important deployment behavior: loopback hosts receive safe defaults, but a server deployed behind a real hostname must provide explicit transport-security allowlists or remote requests can be rejected/insecurely configured depending on the host path.

This fixture therefore treats transport security as part of deployment correctness, not optional hardening.

Primary implementation references:

- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://github.com/modelcontextprotocol/python-sdk/blob/main/src/mcp/server/transport_security.py
- https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/run/asgi.md
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

## Repository changes

### 1. Fail-closed deployment profile

`worker/aios-chatgpt-app/server.py`

The worker now defaults to a loopback-only local bind. A network-visible bind no longer happens accidentally.

`AIOS_MCP_DEPLOYMENT_PROFILE=remote-dev` requires all of:

- HTTPS `AIOS_BACKEND_ORIGIN`;
- `AIOS_BRIDGE_TOKEN` for worker-to-backend authentication;
- explicit `MCP_ALLOWED_HOSTS`;
- explicit `TransportSecuritySettings` with DNS-rebinding protection enabled.

`MCP_ALLOWED_ORIGINS` is optional but exact when used. The repository does not guess or wildcard ChatGPT/browser origins.

### 2. Deployment-security regression fixture

`worker/aios-chatgpt-app/smoke_test.py`

The existing executable MCP fixture now proves:

- loopback local profile remains valid;
- non-loopback local bind fails without `MCP_ALLOWED_HOSTS`;
- remote-dev rejects non-HTTPS backend origins;
- remote-dev rejects a missing `AIOS_BRIDGE_TOKEN`;
- remote-dev materializes explicit host/origin allowlists into MCP transport security.

### 3. Remote network verifier

`worker/aios-chatgpt-app/remote_smoke_test.py`

Once an HTTPS `/mcp` exists, this client connects through the official MCP Streamable HTTP client and verifies:

- exact five-tool discovery;
- `ui://aios/repo-workbench-v0.1.html`;
- `text/html;profile=mcp-app`;
- backend `READY` state;
- `REPOSITORY_EXECUTION_TRUTH_ONLY` coverage;
- `GITHUB_EXECUTION_TRUTH` authority;
- `write_authorization=NONE`;
- search/fetch identity;
- `remote-dev` workbench metadata;
- optional `internal-runtime-diagnostic` completion through `A0_PROCESS_LOCAL_EXECUTION_ONLY`.

The verifier refuses non-HTTPS remote URLs by default.

### 4. Manual remote GitHub gate

`.github/workflows/aios-chatgpt-deploy-binding.yml`

The manual `AIOS ChatGPT Deploy Binding` workflow reads `AIOS_MCP_URL` from repository/environment secrets and executes the remote verifier. This separates source readiness from deployment evidence.

No endpoint URL or credential is committed to the repository.

### 5. Admitted configuration example

`config/aios-chatgpt-remote-dev.example`

The initial attempt used an `.env` example. The repository public-release policy correctly deny-lists every `**/.env*` path, so that file was removed rather than weakening the policy. The non-secret binding example now lives under the admitted `config/**` surface.

## Execution evidence

Instrumented code/documentation head before this receipt:

`38d0bfcbab5b8a95518a78c33e6026729e61e965`

GitHub Actions CI run:

`31450257429`

Results:

- Python worker syntax: PASS
- remote verifier syntax: PASS
- MCP dependency installation: PASS
- local MCP + deployment-security smoke: PASS
- repository build/test: PASS
- public-release contract tests: PASS
- public-release boundary validation: PASS

The public-release boundary also verified that the temporary `.env` example was not retained and that the final deployment contract stays inside admitted paths.

## Acceptance matrix

| Acceptance criterion | Result | Evidence |
| --- | --- | --- |
| Stable HTTPS AIOS backend origin | BLOCKED_EXTERNAL | Sites project ID exists; deployed origin is not exposed by repository/GitHub connector |
| Deploy MCP worker or attach secure tunnel | BLOCKED_EXTERNAL | No deployment/tunnel provisioning action exists in this execution surface |
| Configuration contract | PASS_READY | `remote-dev` profile + `config/aios-chatgpt-remote-dev.example` |
| Transport security | PASS | fail-closed Host/Origin policy tested in CI |
| Remote MCP verifier | PASS_READY | `remote_smoke_test.py` |
| Remote GitHub gate | PASS_READY | manual workflow using secret `AIOS_MCP_URL` |
| ChatGPT Developer Mode connection | BLOCKED_EXTERNAL | requires a reachable MCP URL and workspace UI action |
| ChatGPT-side five-tool/resource discovery | BLOCKED_EXTERNAL | remote host not provisioned |
| Inline workbench render | BLOCKED_EXTERNAL | ChatGPT connection not created |
| ChatGPT-originated diagnostic | BLOCKED_EXTERNAL | ChatGPT connection not created |
| Authority preservation | PASS | no authority widening; write authorization remains NONE |

## Authority state

Unchanged:

- coverage: `REPOSITORY_EXECUTION_TRUTH_ONLY`
- scope: `global-working-memory`
- source authority: `GITHUB_EXECUTION_TRUTH`
- destination-write authorization: `NONE`
- Notion/Drive authority projection: `NONE`
- `governed_write_probe`: blocked
- admitted backend execution: A0 / INTERNAL_NATIVE / EXECUTION_LOCAL / FULLY_REVERSIBLE / PROCESS_LOCAL / LIVE-capable only
- memory/canon/MASON/external mutation: not authorized

## Result

`PASS_PREDEPLOY_BINDING_CONTROLS / BLOCKED_REMOTE_ENDPOINT_PROVISION / BLOCKED_CHATGPT_CONNECTION`

The deployment problem is now reduced to infrastructure binding rather than application/runtime uncertainty. The repository can deterministically verify the endpoint as soon as one exists.

## Next bounded gate

`AIOS_CHATGPT_APP_BRIDGE_ENDPOINT_PROVISION_03`

Acceptance criteria:

1. resolve the actual deployed AI Knowledge System HTTPS origin from the Sites deployment surface;
2. configure matching `AIOS_BRIDGE_TOKEN` on the Sites backend and MCP worker secret managers;
3. deploy the MCP worker or attach a private Secure MCP Tunnel;
4. set exact `MCP_ALLOWED_HOSTS` and any observed legitimate `MCP_ALLOWED_ORIGINS`;
5. store the resulting HTTPS `/mcp` URL as the `AIOS_MCP_URL` GitHub repository/environment secret;
6. dispatch `AIOS ChatGPT Deploy Binding` and require PASS;
7. create/refresh the ChatGPT Developer Mode app connection using the same `/mcp` URL;
8. verify five tools plus the UI resource from ChatGPT;
9. render the AIOS Repo Workbench inside ChatGPT;
10. run `search`, `fetch`, `aios_status`, and `internal-runtime-diagnostic` from ChatGPT without governed-write input;
11. produce a remote deployment receipt before merge or authority expansion.