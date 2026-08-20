import assert from "node:assert/strict";
import test from "node:test";
import {
  ExecutionHistoryContractError,
  assertDurableExecutionHistoryBundle,
  assertDurablePersistenceAvailable,
  assertExecutionHistoryModeConsistency,
  assertJsonSafe,
  executionHistorySchema,
  type DurableExecutionEvent,
  type DurableExecutionHistoryBundle,
  type DurableExecutionLink,
  type DurableExecutionRecord,
} from "../shared/execution-history.ts";
import {
  UnavailableExecutionHistoryStore,
  persistDurableExecutionHistory,
} from "../server/workflows/execution-history-store.ts";

const execution = (overrides: Partial<DurableExecutionRecord> = {}): DurableExecutionRecord => ({
  schema_name: executionHistorySchema.name,
  schema_version: executionHistorySchema.version,
  execution_id: "exec-p0-2-fixture-001",
  scope_key: "global-working-memory",
  capability_id: "cap:canonical-state-reconciler",
  workflow_id: "wf:fixture",
  trace_id: "trace-fixture-001",
  requested_by: "fixture",
  parent_execution_id: null,
  mode: "LIVE",
  status: "COMPLETED",
  created_at: "2026-08-20T23:00:00.000Z",
  started_at: "2026-08-20T23:00:01.000Z",
  completed_at: "2026-08-20T23:00:02.000Z",
  current_stage: "completed",
  input: { fixture: true },
  output: { result: "PASS" },
  error: null,
  result_class: "PASS",
  authority_owner: "WorkflowExecutionKernel",
  authority_domain: "workflow-execution-state",
  authority_state: "execution_truth",
  ...overrides,
});

const event = (
  record: DurableExecutionRecord,
  sequence = 1,
  overrides: Partial<DurableExecutionEvent> = {},
): DurableExecutionEvent => ({
  execution_id: record.execution_id,
  scope_key: record.scope_key,
  capability_id: record.capability_id,
  event_id: `evt-${sequence}`,
  workflow_id: record.workflow_id,
  event_type: "workflow.execution.completed",
  status: record.status,
  stage: record.current_stage,
  sequence,
  emitted_at: "2026-08-20T23:00:02.000Z",
  data: { sequence },
  ...overrides,
});

const link = (
  record: DurableExecutionRecord,
  overrides: Partial<DurableExecutionLink> = {},
): DurableExecutionLink => ({
  execution_id: record.execution_id,
  scope_key: record.scope_key,
  capability_id: record.capability_id,
  link_id: "link-receipt-001",
  link_type: "RECEIPT",
  target_id: "receipt-fixture-001",
  source_system: "Notion",
  authority_owner: "Notion",
  authority_domain: "project-memory",
  authority_state: "authoritative",
  created_at: "2026-08-20T23:00:03.000Z",
  metadata: { relation: "closure" },
  ...overrides,
});

const bundle = (): DurableExecutionHistoryBundle => {
  const record = execution();
  return {
    execution: record,
    events: [event(record, 1), event(record, 2, { event_type: "receipt.linked" })],
    links: [link(record)],
  };
};

const expectCode = (code: ExecutionHistoryContractError["code"]) => (error: unknown) => {
  assert.ok(error instanceof ExecutionHistoryContractError);
  assert.equal(error.code, code);
  return true;
};

test("B02.1 accepts a valid execution triple with ordered events and authority-preserving links", () => {
  assert.doesNotThrow(() => assertDurableExecutionHistoryBundle(bundle()));
});

test("B02.1 rejects an event attached to the right execution id but wrong scope", () => {
  const candidate = bundle();
  candidate.events[0] = { ...candidate.events[0], scope_key: "music-generation" };
  assert.throws(
    () => assertDurableExecutionHistoryBundle(candidate),
    expectCode("EXECUTION_HISTORY_BINDING_MISMATCH"),
  );
});

test("B02.1 rejects a link attached to the right execution id but wrong capability", () => {
  const candidate = bundle();
  candidate.links[0] = { ...candidate.links[0], capability_id: "cap:other" };
  assert.throws(
    () => assertDurableExecutionHistoryBundle(candidate),
    expectCode("EXECUTION_HISTORY_BINDING_MISMATCH"),
  );
});

test("B02.1 rejects duplicate event sequence positions", () => {
  const candidate = bundle();
  candidate.events[1] = { ...candidate.events[1], sequence: 1 };
  assert.throws(
    () => assertDurableExecutionHistoryBundle(candidate),
    expectCode("EXECUTION_HISTORY_DUPLICATE_SEQUENCE"),
  );
});

test("B02.1 rejects duplicate event ids independently of sequence", () => {
  const candidate = bundle();
  candidate.events[1] = { ...candidate.events[1], event_id: candidate.events[0].event_id };
  assert.throws(
    () => assertDurableExecutionHistoryBundle(candidate),
    expectCode("EXECUTION_HISTORY_DUPLICATE_EVENT_ID"),
  );
});

test("B02.1 rejects LIVE and SIMULATION histories sharing one execution id", () => {
  const live = execution({ mode: "LIVE" });
  const simulation = execution({ mode: "SIMULATION" });
  assert.throws(
    () => assertExecutionHistoryModeConsistency(live, simulation),
    expectCode("EXECUTION_HISTORY_MODE_COLLISION"),
  );
});

test("B02.1 rejects identity drift even when execution mode is unchanged", () => {
  const existing = execution();
  const incoming = execution({ capability_id: "cap:other" });
  assert.throws(
    () => assertExecutionHistoryModeConsistency(existing, incoming),
    expectCode("EXECUTION_HISTORY_BINDING_MISMATCH"),
  );
});

test("B02.1 rejects JSON payload values that JSON.stringify would silently discard", () => {
  assert.throws(
    () => assertJsonSafe({ safe: true, hidden: undefined }),
    expectCode("EXECUTION_HISTORY_JSON_UNSAFE"),
  );
});

test("B02.1 rejects circular JSON payloads", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(
    () => assertJsonSafe(circular),
    expectCode("EXECUTION_HISTORY_JSON_UNSAFE"),
  );
});

test("B02.1 treats an unavailable D1 binding as durability unavailable", () => {
  assert.throws(
    () => assertDurablePersistenceAvailable({
      backend: "D1",
      state: "DURABLE_UNAVAILABLE",
      reason_code: "D1_BINDING_UNAVAILABLE",
    }),
    expectCode("EXECUTION_HISTORY_DURABILITY_UNAVAILABLE"),
  );
});

test("B02.1 unavailable store never falls back to process memory while claiming durability", async () => {
  const store = new UnavailableExecutionHistoryStore();
  await assert.rejects(
    persistDurableExecutionHistory(store, bundle()),
    expectCode("EXECUTION_HISTORY_DURABILITY_UNAVAILABLE"),
  );
});
