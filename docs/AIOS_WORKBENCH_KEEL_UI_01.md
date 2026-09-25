# AIOS_WORKBENCH_KEEL_UI_01

Status: EXPERIMENTAL / REVIEW

## Goal

Test Keel-inspired workspace ergonomics against the existing AIOS runtime without replacing AIOS routing, authority, workflow, memory, or execution contracts.

## Boundaries

- Uses existing AIOS API surfaces only.
- No ACP adapter in this slice.
- No new memory authority.
- No Drive/Notion/GitHub source mutation from the UI.
- Direct execution is SIMULATION-only.
- A simulation button is enabled only for an ACTIVE capability with no approval requirement, a registered workflow, and a matching scope allowlist.
- Route choice is a projection of registered capability metadata. The UI does not invent workflows.
- Existing workflow-kernel validation remains authoritative.

## UI slice

- left rail: observed scopes + durable execution history
- center: task desk + registered capability selection + simulation launch
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
5. SIMULATION creates a real workflow execution only when existing runtime policy allows it.
6. No LIVE execution path is present in this UI slice.
7. Existing cockpit remains the default root.
