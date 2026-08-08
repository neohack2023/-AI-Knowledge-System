# SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-04

## Gate

Experimental read-only registry lane plus a SIMULATION-only PDF/document extraction handler, followed by deterministic replay of the two accepted sanitized report fixtures and comparison of emitted observability records against `SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03`.

## Runtime boundary

- Lifecycle lane: `EXPERIMENTAL_READ_ONLY`
- Candidate: `skill-candidate:validate-security-report-evidence-hygiene:v0.2`
- Handler: `handler:security-report-evidence-hygiene:1.0.0`
- Mode: `SIMULATION` only
- Scope: `global-working-memory`
- Input: sanitized extraction envelope for PDF, text, or Google Doc content
- Network access: none
- Source mutation: forbidden
- Credential use: forbidden
- External effects: none
- Persistence: process-local output only

The handler does not fetch URLs, open targets, parse live credentials, perform OCR, or alter reports. It snapshots the normalized envelope, validates every typed constant and bounded field at runtime, independently applies sanitization policy `1.0`, and verifies the canonical extraction digest before emitting records. It claims only that the supplied bounded extraction passed that policy; it does not claim the upstream source is sanitized merely because it is public. PDF extraction remains an upstream read-only adapter boundary.

## Replay fixtures

The fixture module `tests/fixtures/security-report-evidence-hygiene.ts` exports two sanitized extraction envelopes:

1. `cure53OdkInput`
   - Source class: `public_release_with_residual_identifiers`
   - Expected replay: thirteen baseline check records
2. `rosUshahidiInput`
   - Source class: `public_redacted_report_with_critical_residual_secrets`
   - Expected replay: thirteen baseline check records

The fixtures contain no source secrets. They preserve only bounded observations and pointers from the prior governed reviews.

## Baseline comparison

The test suite compares the canonical projection `{check_id -> state + finding_code}` for each replay with the exported `crossRunBaseline`. It also verifies:

- identical ordered check families across both reports
- no control drift
- no contradictory behavior
- no unsupported clean-pass claim
- no scope leak
- zero source mutations
- zero external effects
- two independent episodes, providers, and engagements

## Promotion boundary

Passing this gate permits the Notion lifecycle status `Experimental` for read-only SIMULATION use. It does not authorize merge, deployment, installation, LIVE execution, active capability status, URL fetching, raw secret handling, or external tool access.

## Expected terminal state

```text
EXPERIMENTAL_LANE_DEFINED
SIMULATION_ONLY_HANDLER_BOUND
TWO_SANITIZED_REPORTS_REPLAYED
OBSERVABILITY_BASELINE_MATCHED
CONTROL_DRIFT_NONE
SOURCE_MUTATIONS_ZERO
EXTERNAL_EFFECTS_ZERO
LIVE_EXECUTION_BLOCKED
RAW_SECRET_INPUT_BLOCKED
ACTIVE_STATUS_BLOCKED
```
