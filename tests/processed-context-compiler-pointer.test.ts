import test from "node:test";
import assert from "node:assert/strict";

import type {
  ProcessedContextWindow,
  ProcessedContextWorkingItem,
} from "../shared/processed-context-window.ts";
import {
  createFreshProcessedContextWindow,
  emptyWorkingState,
  foldProcessedContextWindow,
} from "../server/processed-context/service.ts";
import { selectProcessedContextForEnvelope } from "../server/processed-context/context-envelope-consumer.ts";
import { InMemoryProcessedContextCurrentPointerStore } from "../server/processed-context/current-pointer-store.ts";

const workingItem = (
  itemId: string,
  summary: string,
  validationState: ProcessedContextWorkingItem["validation_state"] = "VALID",
): ProcessedContextWorkingItem => ({
  item_id: itemId,
  kind: "CONSTRAINT",
  summary,
  source_pointer_ids: [],
  provenance_envelope_ids: [`prov:${itemId}`],
  authority_dependency_ids: [],
  validation_state: validationState,
  carried_forward_from: null,
  requires_revalidation: validationState === "REVALIDATION_REQUIRED",
});

const fresh = (scopeKey = "global-working-memory", continuityId = "continuity:pcw-02"): ProcessedContextWindow => {
  const state = emptyWorkingState();
  state.active_constraints = [
    workingItem("item:scope", "exact scope only"),
    workingItem("item:freshness", "authoritative source must be revalidated", "REVALIDATION_REQUIRED"),
  ];
  state.pending_next_steps = [workingItem("item:next", "compile task-relevant continuity")];

  return createFreshProcessedContextWindow({
    scope_key: scopeKey,
    continuity_id: continuityId,
    session_ids: ["session:pcw-02"],
    first_event_id: "event:1",
    through_event_id: "event:2",
    event_fingerprints: ["fp:1", "fp:2"],
    provenance_envelope_ids: ["prov:1"],
    retrieval_execution_ids: ["retrieval:1"],
    source_units_processed: 2,
    context_units_before: 800,
    context_units_after: 260,
    working_state: state,
    generated_at: "2026-09-09T14:30:00.000Z",
  });
};

const fold = (previous: ProcessedContextWindow, eventId = "event:3") => foldProcessedContextWindow({
  previous,
  events: [{
    event_id: eventId,
    session_id: "session:pcw-02",
    scope_key: previous.identity.scope_key,
    continuity_id: previous.identity.continuity_id,
    event_fingerprint: `fp:${eventId}`,
    provenance_envelope_ids: [`prov:${eventId}`],
    retrieval_execution_ids: [`retrieval:${eventId}`],
    source_units: 1,
    context_units: 200,
  }],
  generated_at: "2026-09-09T14:31:00.000Z",
  context_units_after: 180,
});

test("PCW-COMP-01 selects only requested task-relevant entries and preserves DERIVED authority", () => {
  const window = fresh();
  const projection = selectProcessedContextForEnvelope({
    window,
    scope_key: "global-working-memory",
    continuity_id: "continuity:pcw-02",
    requested_item_ids: ["item:scope", "item:next"],
  });

  assert.deepEqual(projection.selected_entries.map((entry) => entry.source_item_id), ["item:scope", "item:next"]);
  assert.equal(projection.authority_state, "DERIVED");
  assert.equal(projection.creates_authority, false);
  assert.equal(projection.satisfies_authoritative_freshness, false);
  assert.ok(projection.selected_entries.every((entry) => entry.authority_state === "DERIVED"));
  assert.ok(projection.selected_entries.every((entry) => entry.authoritative_freshness_satisfied === false));
});

test("PCW-COMP-02 exact scope and continuity boundary are mandatory", () => {
  const window = fresh();
  assert.throws(() => selectProcessedContextForEnvelope({
    window,
    scope_key: "udio-algorithms",
    continuity_id: window.identity.continuity_id,
  }), /SCOPE_MISMATCH/);
  assert.throws(() => selectProcessedContextForEnvelope({
    window,
    scope_key: window.identity.scope_key,
    continuity_id: "continuity:other",
  }), /CONTINUITY_MISMATCH/);
});

test("PCW-COMP-03 revalidation state is carried forward but never treated as authoritative freshness", () => {
  const window = fresh();
  window.freshness.revalidation_required = ["notion:authority"];
  const projection = selectProcessedContextForEnvelope({
    window,
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    requested_item_ids: ["item:freshness"],
  });
  assert.equal(projection.selected_entries[0]?.requires_authoritative_revalidation, true);
  assert.equal(projection.selected_entries[0]?.authoritative_freshness_satisfied, false);
});

test("PCW-COMP-04 invalid or non-current PCW versions cannot feed the envelope compiler", () => {
  const invalid = fresh();
  invalid.freshness.validity = "INVALID";
  assert.throws(() => selectProcessedContextForEnvelope({
    window: invalid,
    scope_key: invalid.identity.scope_key,
    continuity_id: invalid.identity.continuity_id,
  }), /WINDOW_INVALID/);

  const superseded = fresh();
  superseded.identity.lifecycle_state = "SUPERSEDED";
  assert.throws(() => selectProcessedContextForEnvelope({
    window: superseded,
    scope_key: superseded.identity.scope_key,
    continuity_id: superseded.identity.continuity_id,
  }), /WINDOW_NOT_CURRENT/);
});

test("PCW-PTR-01 current pointer is keyed by exact scope_key plus continuity_id", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const global = fresh("global-working-memory", "continuity:shared-name");
  const music = fresh("udio-algorithms", "continuity:shared-name");
  store.putCurrent(global, null);
  store.putCurrent(music, null);

  assert.equal(store.getCurrent("global-working-memory", "continuity:shared-name")?.identity.object_id, global.identity.object_id);
  assert.equal(store.getCurrent("udio-algorithms", "continuity:shared-name")?.identity.object_id, music.identity.object_id);
});

test("PCW-PTR-02 predecessor and version advance exactly one", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = fresh();
  store.putCurrent(first, null);
  const second = fold(first);
  store.putCurrent(second, first.identity.object_id);
  assert.equal(store.getCurrentPointer(first.identity.scope_key, first.identity.continuity_id)?.window_version, 2);
});

test("PCW-PTR-03 replay of the exact immutable window is idempotent", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = fresh();
  const stored = store.putCurrent(first, null);
  const replayed = store.putCurrent(structuredClone(first), null);
  assert.deepEqual(replayed, stored);
  assert.equal(store.listVersions(first.identity.scope_key, first.identity.continuity_id).length, 1);
});

test("PCW-PTR-04 stale predecessor detects a current-pointer race", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = fresh();
  store.putCurrent(first, null);
  const second = fold(first, "event:3");
  store.putCurrent(second, first.identity.object_id);
  const competitor = fold(first, "event:4");
  assert.throws(() => store.putCurrent(competitor, first.identity.object_id), /CURRENT_POINTER_RACE/);
});

test("PCW-PTR-05 first insert cannot smuggle an advanced version or predecessor", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = fresh();
  first.identity.window_version = 2;
  first.lineage.previous_window_id = "window:invented";
  assert.throws(() => store.putCurrent(first, null), /INITIAL_VERSION_INVALID/);
});
