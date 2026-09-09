import test from "node:test";
import assert from "node:assert/strict";

import type {
  CanonicalStateProjection,
  ReconciliationAuthorityState,
  ReconciliationProjectionStatus,
  ReconciliationSourceSystem,
} from "../shared/canonical-state-reconciliation.ts";
import type {
  ProcessedContextPointer,
  ProcessedContextWindow,
  ProcessedContextWorkingItem,
} from "../shared/processed-context-window.ts";
import {
  createFreshProcessedContextWindow,
  emptyWorkingState,
  foldProcessedContextWindow,
} from "../server/processed-context/service.ts";
import { InMemoryProcessedContextCurrentPointerStore } from "../server/processed-context/current-pointer-store.ts";
import {
  advanceNotionDriveProcessedContextPointer,
  compileNotionDriveProcessedContext,
  NotionDriveProcessedContextHarnessError,
  type NotionDriveConnectorEdge,
} from "../server/processed-context/notion-drive-harness.ts";

const workingItem = (
  itemId: string,
  kind: ProcessedContextWorkingItem["kind"],
  summary: string,
  authorityDependencyIds: string[] = [],
  validationState: ProcessedContextWorkingItem["validation_state"] = "VALID",
): ProcessedContextWorkingItem => ({
  item_id: itemId,
  kind,
  summary,
  source_pointer_ids: [...authorityDependencyIds],
  provenance_envelope_ids: [`prov:${itemId}`],
  authority_dependency_ids: [...authorityDependencyIds],
  validation_state: validationState,
  carried_forward_from: null,
  requires_revalidation: validationState === "REVALIDATION_REQUIRED",
});

const notionPointer: ProcessedContextPointer = {
  pointer_id: "dep:notion:memory",
  source_system: "Notion",
  source_id: "notion:global-working-memory",
  source_version: "41",
  source_fingerprint: "fp:notion:41",
  authority_owner: "Notion",
  authority_domain: "project-memory",
  authority_state: "AUTHORITATIVE",
};

const drivePointer: ProcessedContextPointer = {
  pointer_id: "dep:drive:runtime",
  source_system: "Google_Drive",
  source_id: "drive:00-runtime",
  source_version: "17",
  source_fingerprint: "fp:drive:17",
  authority_owner: "Google_Drive",
  authority_domain: "runtime-control-plane",
  authority_state: "SHADOW",
};

const freshWindow = (
  scopeKey = "global-working-memory",
  continuityId = "continuity:pcw-harness-03",
): ProcessedContextWindow => {
  const state = emptyWorkingState();
  state.active_constraints = [
    workingItem(
      "item:notion",
      "CONSTRAINT",
      "Notion project-memory authority must be refreshed before relying on this state.",
      [notionPointer.pointer_id],
      "REVALIDATION_REQUIRED",
    ),
    workingItem(
      "item:drive",
      "ARTIFACT",
      "Drive runtime mirror must be refreshed before relying on current runtime state.",
      [drivePointer.pointer_id],
      "REVALIDATION_REQUIRED",
    ),
    workingItem("item:stable", "ESTABLISHED_STATE", "Stable derived continuity note."),
  ];
  state.unresolved_conflicts = [
    workingItem(
      "item:conflict",
      "UNRESOLVED_CONFLICT",
      "A connector authority conflict is still unresolved.",
      [notionPointer.pointer_id],
      "UNRESOLVED",
    ),
  ];

  const window = createFreshProcessedContextWindow({
    scope_key: scopeKey,
    continuity_id: continuityId,
    session_ids: ["session:pcw-harness-03"],
    first_event_id: "event:1",
    through_event_id: "event:2",
    event_fingerprints: ["fp:event:1", "fp:event:2"],
    provenance_envelope_ids: ["prov:pcw-harness-03"],
    retrieval_execution_ids: ["retrieval:pcw-harness-03"],
    source_units_processed: 2,
    context_units_before: 900,
    context_units_after: 280,
    working_state: state,
    generated_at: "2026-09-09T15:00:00.000Z",
  });

  window.source_pointers = [structuredClone(notionPointer), structuredClone(drivePointer)];
  window.freshness.dependency_states = [
    {
      source_pointer_id: notionPointer.pointer_id,
      freshness_requirement: "CURRENT",
      last_validated_version: notionPointer.source_version,
      current_state: "STALE",
      revalidation_reason: "fixture requires current Notion authority edge",
    },
    {
      source_pointer_id: drivePointer.pointer_id,
      freshness_requirement: "CURRENT",
      last_validated_version: drivePointer.source_version,
      current_state: "STALE",
      revalidation_reason: "fixture requires current Drive runtime edge",
    },
  ];
  window.freshness.revalidation_required = [notionPointer.pointer_id, drivePointer.pointer_id];
  return window;
};

const connectorProjection = (
  sourceSystem: ReconciliationSourceSystem,
  sourceId: string,
  authorityState: ReconciliationAuthorityState,
  status: ReconciliationProjectionStatus,
  edgeId: string,
): CanonicalStateProjection => ({
  projection_class: sourceSystem === "Notion" ? "scope" : "runtime",
  adapter_id: `fixture:${edgeId}`,
  source_system: sourceSystem,
  source_id: sourceId,
  source_version: "current",
  source_fingerprint: `fp:${edgeId}`,
  provenance_envelope_id: `prov:${edgeId}`,
  missing_provenance_reason: null,
  authority_owner: sourceSystem,
  authority_domain: sourceSystem === "Notion" ? "project-memory" : "runtime-control-plane",
  authority_state: authorityState,
  freshness_anchor: `fresh:${edgeId}`,
  supersedes: null,
  status,
  reason_codes: status === "FRESH" || status === "UNCHANGED" ? [] : [`FIXTURE_${status}`],
  observed_claims: {},
});

const edge = (
  edgeId: string,
  sourceSystem: "Notion" | "Google_Drive",
  sourceId: string,
  authorityState: ReconciliationAuthorityState,
  status: ReconciliationProjectionStatus,
  dependencyIds: string[],
  scopeKey = "global-working-memory",
): NotionDriveConnectorEdge => ({
  edge_id: edgeId,
  scope_key: scopeKey,
  projection: connectorProjection(sourceSystem, sourceId, authorityState, status, edgeId),
  satisfies_authority_dependency_ids: [...dependencyIds],
});

const fold = (previous: ProcessedContextWindow, eventId = "event:3") => foldProcessedContextWindow({
  previous,
  events: [{
    event_id: eventId,
    session_id: "session:pcw-harness-03",
    scope_key: previous.identity.scope_key,
    continuity_id: previous.identity.continuity_id,
    event_fingerprint: `fp:${eventId}`,
    provenance_envelope_ids: [`prov:${eventId}`],
    retrieval_execution_ids: [`retrieval:${eventId}`],
    source_units: 1,
    context_units: 180,
  }],
  generated_at: "2026-09-09T15:01:00.000Z",
  context_units_after: 150,
});

test("PCW-HARNESS-01 exact scoped current-pointer lookup feeds the harness context", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [],
    requested_item_ids: ["item:stable"],
  });

  assert.equal(compiled.continuity_source, "CURRENT_PCW");
  assert.equal(compiled.current_pointer?.window_id, window.identity.object_id);
  assert.deepEqual(compiled.processed_context?.selected_entries.map((entry) => entry.source_item_id), ["item:stable"]);
});

test("PCW-HARNESS-02 missing current PCW yields connector-only context without fabricated continuity", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const notion = edge(
    "edge:notion",
    "Notion",
    notionPointer.source_id,
    "authoritative",
    "FRESH",
    [notionPointer.pointer_id],
  );

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: "global-working-memory",
    continuity_id: "continuity:missing",
    connector_edges: [notion],
  });

  assert.equal(compiled.continuity_source, "NONE");
  assert.equal(compiled.current_pointer, null);
  assert.equal(compiled.processed_context, null);
  assert.equal(compiled.connector_edges.length, 1);
});

test("PCW-HARNESS-03 selected task continuity remains DERIVED and never satisfies authoritative freshness itself", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [],
    requested_item_ids: ["item:notion"],
  });

  assert.equal(compiled.processed_context?.authority_state, "DERIVED");
  assert.equal(compiled.processed_context?.satisfies_authoritative_freshness, false);
  assert.equal(compiled.freshness.pcw_satisfies_authoritative_freshness, false);
  assert.equal(compiled.authority_state, "DERIVED_WITH_SEPARATE_CONNECTOR_EDGES");
});

test("PCW-HARNESS-04 sibling scope and continuity do not leak current PCW state", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const siblingScope = compileNotionDriveProcessedContext(store, {
    scope_key: "udio-algorithms",
    continuity_id: window.identity.continuity_id,
    connector_edges: [],
  });
  const siblingContinuity = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: "continuity:sibling",
    connector_edges: [],
  });

  assert.equal(siblingScope.continuity_source, "NONE");
  assert.equal(siblingContinuity.continuity_source, "NONE");

  assert.throws(
    () => compileNotionDriveProcessedContext(store, {
      scope_key: window.identity.scope_key,
      continuity_id: window.identity.continuity_id,
      connector_edges: [edge(
        "edge:wrong-scope",
        "Notion",
        notionPointer.source_id,
        "authoritative",
        "FRESH",
        [notionPointer.pointer_id],
        "udio-algorithms",
      )],
      requested_item_ids: ["item:notion"],
    }),
    (error: unknown) => error instanceof NotionDriveProcessedContextHarnessError
      && error.code === "PCW_HARNESS_CONNECTOR_SCOPE_MISMATCH",
  );
});

test("PCW-HARNESS-05 fresh Notion authoritative edge satisfies only its matching authority dependency", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [edge(
      "edge:notion-current",
      "Notion",
      notionPointer.source_id,
      "authoritative",
      "FRESH",
      [notionPointer.pointer_id],
    )],
    requested_item_ids: ["item:notion"],
  });

  const resolution = compiled.freshness.dependency_resolutions[0];
  assert.equal(resolution?.dependency_id, notionPointer.pointer_id);
  assert.equal(resolution?.expected_authority_state, "authoritative");
  assert.equal(resolution?.satisfied, true);
  assert.deepEqual(resolution?.matching_edge_ids, ["edge:notion-current"]);
  assert.equal(compiled.freshness.selected_dependencies_satisfied, true);
});

test("PCW-HARNESS-06 fresh Drive shadow edge remains SHADOW and cannot impersonate Notion authority", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const drive = edge(
    "edge:drive-current",
    "Google_Drive",
    drivePointer.source_id,
    "shadow",
    "FRESH",
    [drivePointer.pointer_id, notionPointer.pointer_id],
  );

  const driveCompiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [drive],
    requested_item_ids: ["item:drive"],
  });
  const notionCompiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [drive],
    requested_item_ids: ["item:notion"],
  });

  assert.equal(driveCompiled.connector_edges[0]?.projection.authority_state, "shadow");
  assert.equal(driveCompiled.freshness.dependency_resolutions[0]?.expected_authority_state, "shadow");
  assert.equal(driveCompiled.freshness.dependency_resolutions[0]?.satisfied, true);
  assert.equal(notionCompiled.freshness.dependency_resolutions[0]?.satisfied, false);
});

test("PCW-HARNESS-07 stale or unknown connector edges never satisfy revalidation", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  for (const status of ["STALE", "UNKNOWN"] as const) {
    const compiled = compileNotionDriveProcessedContext(store, {
      scope_key: window.identity.scope_key,
      continuity_id: window.identity.continuity_id,
      connector_edges: [edge(
        `edge:notion-${status.toLowerCase()}`,
        "Notion",
        notionPointer.source_id,
        "authoritative",
        status,
        [notionPointer.pointer_id],
      )],
      requested_item_ids: ["item:notion"],
    });
    assert.equal(compiled.freshness.dependency_resolutions[0]?.satisfied, false);
    assert.deepEqual(compiled.freshness.unresolved_dependency_ids, [notionPointer.pointer_id]);
  }
});

test("PCW-HARNESS-08 PCW alone cannot clear a required connector freshness dependency", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [],
    requested_item_ids: ["item:notion"],
  });

  assert.equal(compiled.freshness.pcw_satisfies_authoritative_freshness, false);
  assert.equal(compiled.freshness.dependency_resolutions[0]?.satisfied, false);
  assert.equal(compiled.freshness.selected_dependencies_satisfied, false);
});

test("PCW-HARNESS-09 unresolved PCW conflicts remain unresolved in compiled harness context", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [edge(
      "edge:notion-current",
      "Notion",
      notionPointer.source_id,
      "authoritative",
      "FRESH",
      [notionPointer.pointer_id],
    )],
    requested_item_ids: ["item:conflict"],
  });

  assert.deepEqual(compiled.unresolved_conflict_item_ids, ["item:conflict"]);
  assert.equal(compiled.processed_context?.selected_entries[0]?.validation_state, "UNRESOLVED");
});

test("PCW-HARNESS-10 guarded pointer advance preserves exact replay idempotency", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = freshWindow();
  advanceNotionDriveProcessedContextPointer(store, first, null);
  const second = fold(first);
  const advanced = advanceNotionDriveProcessedContextPointer(store, second, first.identity.object_id);
  const replayed = advanceNotionDriveProcessedContextPointer(store, structuredClone(second), first.identity.object_id);

  assert.deepEqual(replayed, advanced);
  assert.equal(store.listVersions(first.identity.scope_key, first.identity.continuity_id).length, 2);
});

test("PCW-HARNESS-11 wrong predecessor fails visibly through the validated pointer guard", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const first = freshWindow();
  advanceNotionDriveProcessedContextPointer(store, first, null);
  const second = fold(first);

  assert.throws(
    () => advanceNotionDriveProcessedContextPointer(store, second, null),
    (error: unknown) => (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: string }).code === "PROCESSED_CONTEXT_CURRENT_POINTER_RACE"
    ),
  );
});

test("PCW-HARNESS-12 harness output cannot authorize durable writes even with authoritative connector evidence", () => {
  const store = new InMemoryProcessedContextCurrentPointerStore();
  const window = freshWindow();
  store.putCurrent(window, null);

  const compiled = compileNotionDriveProcessedContext(store, {
    scope_key: window.identity.scope_key,
    continuity_id: window.identity.continuity_id,
    connector_edges: [edge(
      "edge:notion-current",
      "Notion",
      notionPointer.source_id,
      "authoritative",
      "FRESH",
      [notionPointer.pointer_id],
    )],
    requested_item_ids: ["item:notion"],
  });

  assert.equal(compiled.creates_authority, false);
  assert.equal(compiled.authorizes_write, false);
  assert.equal(compiled.write_authorization, "NONE");
  assert.equal(compiled.processed_context?.creates_authority, false);
});
