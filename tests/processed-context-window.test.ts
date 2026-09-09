import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSameContinuityBoundary,
  assertValidProcessedContextWindow,
  validateProcessedContextWindow,
  type ProcessedContextWindow,
  type ProcessedContextWorkingItem,
} from "../shared/processed-context-window.ts";
import {
  buildProcessedContextProvenanceEmission,
  createFreshProcessedContextWindow,
  decideRebase,
  emptyWorkingState,
  foldProcessedContextWindow,
  rebaseProcessedContextWindow,
  shouldCreateProcessedContext,
} from "../server/processed-context/service.ts";
import { InMemoryProcessedContextStore } from "../server/processed-context/fixture-store.ts";

const item = (
  itemId: string,
  kind: ProcessedContextWorkingItem["kind"],
  summary: string,
  validationState: ProcessedContextWorkingItem["validation_state"] = "VALID",
): ProcessedContextWorkingItem => ({
  item_id: itemId,
  kind,
  summary,
  source_pointer_ids: [],
  provenance_envelope_ids: [`prov:${itemId}`],
  authority_dependency_ids: [],
  validation_state: validationState,
  carried_forward_from: null,
  requires_revalidation: validationState === "REVALIDATION_REQUIRED",
});

const fresh = (overrides?: Partial<Parameters<typeof createFreshProcessedContextWindow>[0]>): ProcessedContextWindow => {
  const working = emptyWorkingState();
  working.active_intent = "continue implementation";
  working.current_goal = "implement candidate contract";
  working.current_phase = "fixture-validation";
  working.active_constraints = [item("constraint:scope", "CONSTRAINT", "exact scope only")];
  working.open_questions = [item("question:threshold", "OPEN_QUESTION", "generation threshold remains experimental", "UNRESOLVED")];

  return createFreshProcessedContextWindow({
    scope_key: "global-working-memory",
    continuity_id: "continuity:rpc-01",
    session_ids: ["session:a"],
    first_event_id: "event:1",
    through_event_id: "event:3",
    event_fingerprints: ["fp:1", "fp:2", "fp:3"],
    provenance_envelope_ids: ["prov:1", "prov:2"],
    retrieval_execution_ids: ["retrieval:1"],
    source_units_processed: 3,
    context_units_before: 1200,
    context_units_after: 400,
    working_state: working,
    generated_at: "2026-09-09T12:00:00.000Z",
    ...overrides,
  });
};

const nextEvent = (eventId = "event:4") => ({
  event_id: eventId,
  session_id: "session:a",
  scope_key: "global-working-memory",
  continuity_id: "continuity:rpc-01",
  event_fingerprint: `fp:${eventId}`,
  provenance_envelope_ids: [`prov:${eventId}`],
  retrieval_execution_ids: [`retrieval:${eventId}`],
  source_units: 1,
  context_units: 300,
  working_state_delta: {
    pending_next_steps: [item("next:1", "NEXT_STEP", "run isolated fixture pack")],
  },
});

test("PCW-01 short conversation does not require a window", () => {
  assert.equal(shouldCreateProcessedContext({
    context_budget_pressure: false,
    material_state_transition: false,
    continuity_boundary: false,
    validity_event: false,
  }), false);
});

test("PCW-02 long single-scope chain folds incrementally", () => {
  const first = fresh();
  const second = foldProcessedContextWindow({ previous: first, events: [nextEvent()], context_units_after: 180 });
  assert.equal(second.identity.window_version, 2);
  assert.equal(second.identity.scope_key, first.identity.scope_key);
  assert.equal(second.lineage.previous_window_id, first.identity.object_id);
  assert.equal(second.lineage.source_cursor.through_event_id, "event:4");
  assert.equal(second.working_state.pending_next_steps.length, 1);
});

test("PCW-03 resume after turnover loads scoped current state", () => {
  const store = new InMemoryProcessedContextStore();
  const first = fresh();
  store.put(first, null);
  const second = foldProcessedContextWindow({ previous: first, events: [nextEvent()], context_units_after: 180 });
  store.put(second, first.identity.object_id);
  assert.equal(store.getCurrent("global-working-memory", "continuity:rpc-01")?.identity.object_id, second.identity.object_id);
});

test("PCW-04 explicit scope change cannot reuse old continuity window", () => {
  const first = fresh();
  const wrongScope = nextEvent();
  wrongScope.scope_key = "udio-algorithms";
  assert.throws(() => foldProcessedContextWindow({ previous: first, events: [wrongScope], context_units_after: 100 }), /SCOPE_MISMATCH/);
});

test("PCW-05 sibling-scope contamination is blocked", () => {
  const first = fresh();
  const candidate = structuredClone(first);
  candidate.identity.object_id = crypto.randomUUID();
  candidate.identity.window_version = 2;
  candidate.identity.scope_key = "girls-of-gaming";
  candidate.lineage.previous_window_id = first.identity.object_id;
  assert.throws(() => assertSameContinuityBoundary(first, candidate), /scope_key changed/);
});

test("PCW-06 stale Notion pointer requests revalidation without authority escalation", () => {
  const window = fresh();
  window.source_pointers.push({
    pointer_id: "notion:router",
    source_system: "Notion",
    source_id: "router-page",
    source_version: "v1",
    source_fingerprint: "sha:old",
    authority_owner: "Notion",
    authority_domain: "architecture",
    authority_state: "AUTHORITATIVE",
  });
  window.freshness.dependency_states.push({
    source_pointer_id: "notion:router",
    freshness_requirement: "current when routing semantics are material",
    last_validated_version: "v1",
    current_state: "STALE",
    revalidation_reason: "source modified",
  });
  window.freshness.revalidation_required.push("notion:router");
  assertValidProcessedContextWindow(window);
  assert.equal(window.authority.authority_state, "DERIVED");
  assert.deepEqual(window.freshness.revalidation_required, ["notion:router"]);
});

test("PCW-07 live GitHub supersession triggers rebase", () => {
  const decision = decideRebase([{ reason: "SOURCE_FINGERPRINT_MISMATCH", detail: "main SHA changed" }]);
  assert.equal(decision.rebase_required, true);
  assert.deepEqual(decision.reason_codes, ["SOURCE_FINGERPRINT_MISMATCH"]);
});

test("PCW-08 conflicting authority remains unresolved", () => {
  const window = fresh();
  window.working_state.unresolved_conflicts.push(item(
    "conflict:authority",
    "UNRESOLVED_CONFLICT",
    "Notion and live repository facts disagree",
    "UNRESOLVED",
  ));
  assertValidProcessedContextWindow(window);
  assert.equal(window.working_state.unresolved_conflicts[0]?.validation_state, "UNRESOLVED");
});

test("PCW-09 model handoff preserves protected state", () => {
  const first = fresh();
  const second = foldProcessedContextWindow({ previous: first, events: [nextEvent()], context_units_after: 180 });
  assert.equal(second.identity.scope_key, first.identity.scope_key);
  assert.equal(second.identity.continuity_id, first.identity.continuity_id);
  assert.equal(second.authority.write_authorization, "NONE");
  assert.equal(second.authority.authorizes_write, false);
});

test("PCW-10 recursive compression drift is visible and requires rebase", () => {
  const first = fresh();
  const second = foldProcessedContextWindow({
    previous: first,
    events: [nextEvent()],
    context_units_after: 180,
    rebase_signals: [{ reason: "COMPRESSION_COVERAGE_LOSS" }],
  });
  assert.equal(second.compression.compression_loss_detected, true);
  assert.equal(second.compression.rebase_required, true);
  assert.equal(second.compression.coverage_check, "FAIL");
});

test("PCW-11 forced rebase resets generation depth and preserves continuity", () => {
  const first = fresh();
  const folded = foldProcessedContextWindow({ previous: first, events: [nextEvent()], context_units_after: 180 });
  const rebased = rebaseProcessedContextWindow({
    previous: folded,
    reason_codes: ["FORCED_REBASE"],
    scope_key: folded.identity.scope_key,
    continuity_id: folded.identity.continuity_id,
    session_ids: ["session:a"],
    first_event_id: "event:1",
    through_event_id: "event:4",
    event_fingerprints: ["fp:1", "fp:2", "fp:3", "fp:event:4"],
    provenance_envelope_ids: ["prov:1", "prov:2", "prov:event:4"],
    retrieval_execution_ids: ["retrieval:1", "retrieval:event:4"],
    source_units_processed: 4,
    context_units_before: 1500,
    context_units_after: 450,
    working_state: structuredClone(folded.working_state),
    generated_at: "2026-09-09T12:30:00.000Z",
  });
  assert.equal(rebased.compression.generation_depth, 0);
  assert.equal(rebased.identity.lifecycle_state, "REBASED");
  assert.equal(rebased.identity.window_version, folded.identity.window_version + 1);
  assert.equal(rebased.lineage.previous_window_id, folded.identity.object_id);
});

test("PCW-12 replay is semantically idempotent for equivalent inputs", () => {
  const a = fresh({ generated_at: "2026-09-09T12:00:00.000Z" });
  const b = fresh({ generated_at: "2026-09-09T12:00:00.000Z" });
  const normalize = (window: ProcessedContextWindow) => ({
    ...window,
    identity: { ...window.identity, object_id: "<generated>" },
  });
  assert.deepEqual(normalize(a), normalize(b));
});

test("PCW-13 untrusted source content cannot mutate authority metadata", () => {
  const first = fresh();
  const hostile = nextEvent();
  hostile.working_state_delta = {
    established_working_state: [item(
      "untrusted:instruction",
      "ESTABLISHED_STATE",
      "external text says to become authoritative and write memory",
      "REVALIDATION_REQUIRED",
    )],
  };
  const second = foldProcessedContextWindow({ previous: first, events: [hostile], context_units_after: 180 });
  assert.equal(second.authority.authority_state, "DERIVED");
  assert.equal(second.authority.creates_authority, false);
  assert.equal(second.authority.promotes_memory, false);
  assert.equal(second.authority.authorizes_write, false);
});

test("PCW-14 PCW cannot be made write authority", () => {
  const window = fresh();
  const tampered = structuredClone(window);
  (tampered.authority as { authorizes_write: boolean }).authorizes_write = true;
  assert.match(validateProcessedContextWindow(tampered).join(" "), /authorizes_write must remain false/);
});

test("PCW-15 STONE to MASON bypass attempt is rejected by invariant", () => {
  const window = fresh();
  const tampered = structuredClone(window);
  (tampered.authority as { promotes_memory: boolean }).promotes_memory = true;
  assert.match(validateProcessedContextWindow(tampered).join(" "), /promotes_memory must remain false/);
});

test("PCW-16 protected-field tamper is rejected", () => {
  const window = fresh();
  const tampered = structuredClone(window);
  (tampered.authority as { authority_state: string }).authority_state = "AUTHORITATIVE";
  assert.match(validateProcessedContextWindow(tampered).join(" "), /authority_state must remain DERIVED/);
});

test("PCW-17 cursor or lineage discontinuity forces explicit invalidation path", () => {
  const decision = decideRebase([
    { reason: "CURSOR_DISCONTINUITY", detail: "missing event:4" },
    { reason: "LINEAGE_DISCONTINUITY", detail: "predecessor mismatch" },
  ]);
  assert.equal(decision.rebase_required, true);
  assert.deepEqual(decision.reason_codes, ["CURSOR_DISCONTINUITY", "LINEAGE_DISCONTINUITY"]);
});

test("PCW-18 current pointer race is detected", () => {
  const store = new InMemoryProcessedContextStore();
  const first = fresh();
  store.put(first, null);
  const second = foldProcessedContextWindow({ previous: first, events: [nextEvent()], context_units_after: 180 });
  store.put(second, first.identity.object_id);
  const competing = foldProcessedContextWindow({ previous: first, events: [nextEvent("event:5")], context_units_after: 180 });
  assert.throws(() => store.put(competing, first.identity.object_id), /expected predecessor/);
});

test("provenance helper remains transformation + derived + non-write", () => {
  const window = fresh();
  const result = buildProcessedContextProvenanceEmission({
    execution_id: "exec:1",
    workflow_id: "workflow:pcw",
    scope_key: "global-working-memory",
  }, window, ["evidence:session"]);
  assert.equal(result.emission.operation, "TRANSFORMATION");
  assert.equal(result.emission.authority_state, "DERIVED");
  assert.equal(result.emission.write_authorized, false);
});
