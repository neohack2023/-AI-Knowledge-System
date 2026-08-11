# AIOS_CHATGPT_APP_BRIDGE_FIXTURE_01

Status: `PASS_LOCAL_RUNTIME / EXTERNAL_CONNECTION_BLOCKED / NO_MERGE_AUTHORIZATION`

Date: 2026-08-10 America/Indiana/Indianapolis

## Purpose

Prove that the ChatGPT-facing AIOS bridge is a real MCP/runtime surface rather than repository-shaped scaffolding, then identify the smallest remaining gate before the inline workbench can be opened from ChatGPT Developer Mode.

## Fixture scope

The fixture exercises the draft branch `gog/2d-to-3d-lab-v0-1` / PR #38 and verifies:

1. Python MCP worker syntax and dependency installation.
2. MCP server import under the current `mcp[cli]` runtime.
3. Exact discovery of the five admitted tools:
   - `search`
   - `fetch`
   - `aios_status`
   - `run_backend_workflow`
   - `open_aios_workbench`
4. Discovery and readback of `ui://aios/repo-workbench-v0.1.html`.
5. UI resource MIME type `text/html;profile=mcp-app`.
6. Representative search/fetch/status/safe-workflow/open-workbench calls against a controlled backend fixture.
7. Local Streamable HTTP binding at `/mcp`.
8. Existing repository build/test and public-release boundary after the fixture changes.

## Execution evidence

Head SHA after fixture instrumentation:

`7415eb79606d8b8fb49e384f7f188093b23555ae`

GitHub Actions run:

`31449572178`

Results:

- Python worker syntax: PASS
- install `worker/aios-chatgpt-app/requirements.txt`: PASS
- `worker/aios-chatgpt-app/smoke_test.py`: PASS
- local `/mcp` Streamable HTTP bind probe: PASS
- repository build and test: PASS
- public-release contract tests: PASS
- public-release boundary validation: PASS

The executable smoke fixture lives at:

`worker/aios-chatgpt-app/smoke_test.py`

## Authority and execution observations

The fixture does not broaden authority.

- knowledge coverage remains `REPOSITORY_EXECUTION_TRUTH_ONLY`
- initial scope remains `global-working-memory`
- destination-write authorization remains `NONE`
- Notion and Drive authority are not projected through the bridge
- `governed_write_probe` remains blocked
- backend execution remains limited to policy-admitted A0 / INTERNAL_NATIVE / EXECUTION_LOCAL / FULLY_REVERSIBLE / PROCESS_LOCAL / LIVE-capable workflows
- no memory promotion, canon promotion, MASON mutation, or external destination write follows from this fixture

## External connection gate

OpenAI's current plugin testing flow requires the MCP server to be reachable through either:

- a public HTTPS Streamable HTTP endpoint, typically ending in `/mcp`; or
- Secure MCP Tunnel in Developer Mode.

That endpoint/tunnel is not available to this execution environment. The repository's `.openai/hosting.json` declares an OpenAI hosting project ID but does not expose a public application origin or MCP URL, so `AIOS_BACKEND_ORIGIN` remains intentionally unbound in source.

Therefore these steps are **not claimed as passed**:

- ChatGPT Developer Mode connection creation
- ChatGPT-side tool metadata discovery from a remote endpoint
- inline widget render inside a ChatGPT conversation
- ChatGPT-originated live call to `internal-runtime-diagnostic`

## Result

`PASS_LOCAL_RUNTIME / BLOCKED_EXTERNAL_BINDING`

The architecture and executable MCP runtime are proven on the draft branch. The remaining blocker is deployment/connection configuration, not another bridge redesign.

## Next bounded gate

`AIOS_CHATGPT_APP_BRIDGE_DEPLOY_BINDING_02`

Acceptance criteria:

1. obtain a stable HTTPS backend origin for the AI Knowledge System application;
2. deploy the MCP worker or attach it through Secure MCP Tunnel;
3. configure `AIOS_BACKEND_ORIGIN` and, when used, matching `AIOS_BRIDGE_TOKEN`;
4. connect the resulting `/mcp` endpoint in ChatGPT Developer Mode;
5. confirm the five expected tools and the `ui://aios/repo-workbench-v0.1.html` resource;
6. render the workbench inside ChatGPT;
7. run `search`, `fetch`, `aios_status`, and `internal-runtime-diagnostic` without governed-write input;
8. preserve `write_authorization=NONE` and all existing authority boundaries;
9. produce a deployment receipt before any merge or authority expansion.
