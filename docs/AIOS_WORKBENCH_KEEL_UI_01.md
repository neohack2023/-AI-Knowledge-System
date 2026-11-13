# AIOS_WORKBENCH_KEEL_UI_01

Status: EXPERIMENTAL / REVIEW

## Goal

Test Keel-inspired workspace ergonomics against the existing AIOS runtime without replacing AIOS routing, authority, workflow, memory, or execution contracts.

## Boundaries

- Uses existing AIOS API surfaces only.
- No ACP adapter in this slice.
- No new memory authority.
- No Drive/Notion/GitHub source mutation from the UI.
- Direct execution is limited to the exact verified A0 process-local Internal Runtime Diagnostic workflow using LIVE mode when durable D1 history is available.
- The explicit A0 diagnostic button is enabled only for the matching registered ACTIVE capability, `autonomy_band=A0`, no approval requirement, a matching scope, the live workflow inventory, and healthy D1 durable history. Double-clicks are blocked while a request is running.
- Route choice is a projection of registered capability metadata. The UI does not invent workflows.
- Existing workflow-kernel validation remains authoritative.

## UI slice

- left rail: observed scopes + durable execution history
- center: task desk + registered capability selection + bounded A0 diagnostic launch
- right inspector: decision metadata + execution events + bridge boundaries

## Keel-derived ideas under test

1. Persistent session/task workspace
2. Explicit route selection from eligible choices
3. Pinned execution inspection
4. Decision visibility separate from execution
5. Provider/executor UI as a future adapter seam

## Acceptance for v0.1

1. Build passes.
2. Static workbench boundary tests pass.
3. Existing test suite does not regress.
4. Workbench loads current capability/history/bridge surfaces.
5. A browser-launched, registered LIVE A0 diagnostic creates a durable workflow execution through the same HTTP kernel as the headless client.
6. All other LIVE workflows remain inspect-only in this UI; no connector, repository, Drive or canon write is added.
7. Existing cockpit remains the default root.

## Verified behavior correction (2026-11-13)

The original experimental UI's `SIMULATION` execute request was rejected by the LIVE kernel (HTTP 409), so static UI tests could pass without a working button. The present UI routes exactly the registered A0 process-local `internal-runtime-diagnostic` through `LIVE`, and disables the run control for all other capabilities, absent D1 durability, mismatched scopes, inactive/unapproved definitions or an in-flight request. The server-side workflow kernel remains the real authority, not these client guards.

The existing Workbench is reused; no second UI, numbered tool variant, local database clone, or new execution gateway. Headless CLI/MCP/HTTP clients continue to call the same application routes. The left rail displays observed D1 histories, while the right inspector exposes actual workflow stages/events and capability authority metadata.

Implementation evidence must include full build, actual HTTP+D1 integration, UI boundary regression tests, and a real browser interaction before claiming functional GUI success. Real authorization beyond the existing platform headers is a separate security obligation; do not interpret the UI gate as a server authorization boundary.

Changelog: 2026-11-13 — Corrected nonfunctional SIMULATION request to exact A0 LIVE diagnostic; added in-flight deduplication and D1 readiness restrictions.

### Browser integration test / headless operator

On Windows Host 02 with Microsoft Edge installed, run `npm run evaluate -- --profile=browser` after building the project. The optional browser profile is *not* part of Linux CI's `--profile=all` because it needs an installed real browser; `AIOS_BROWSER_PATH` may be set to a compatible Chromium executable. Missing dependencies become `BLOCKED / ENVIRONMENT_NOT_READY`.

The maintained `tests/workbench-browser.integration.mjs` launches the same compiled Worker and isolated D1 as other evaluation profiles, serves the static assets and UI on OS-assigned localhost ports, runs a real headless Edge session using Chrome DevTools Protocol, clicks the registered diagnostic, verifies that the browser reports completion and SQL D1 contains a completed row. It then selects a different registered capability and verifies that the Run button is disabled and SQL execution count is unchanged. Unique browser profile data, descendant Edge processes, and ephemeral D1 are cleaned up. Its receipts use the existing `outputs/evaluations/latest.json` and `runs.jsonl` paths, not tool-v2 shadow copies.

Execution evidence is a browser integration result, not an unrestricted agent execution promise, public benchmark win, server authentication proof, or production Cloudflare certification. Real D1/HTTP/browser results and any follow-on failures are recorded with their precise head and environment.

Changelog: 2026-11-13 — Converted transient Edge debugging probe into maintained opt-in `browser` evaluation with positive click/readback and negative capability-admission controls; test temp cleanup is explicit.
