import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDurableExecutionHistoryBundle,
  assertExecutionHistoryModeConsistency,
  type DurableExecutionHistoryBundle,
  type DurableExecutionRecord,
  type ExecutionHistoryBackendState,
  type ExecutionHistoryIdentity,
} from "../shared/execution-history.ts";
import {
  UnavailableExecutionHistoryStore,
  type ExecutionHistoryListQuery,
  type ExecutionHistoryStore,
} from "../server/workflows/execution-history-store.ts";
import {
  DurableWorkflowRuntime,
  durableHistoryToSnapshot,
  snapshotToDurableHistory,
} from "../server/workflows/durable-runtime.ts";
import { WorkflowExecutionKernel, WorkflowKernelError } from "../server/workflows/kernel.ts";

const CAPABILITY = "cap:internal-runtime-diagnostic";
const resolver = (workflowId: string) =>
  workflowId === "internal-runtime-diagnostic" ? CAPABILITY : null;

class MemoryExecutionHistoryStore implements ExecutionHistoryStore {
  readonly backend = "D1" as const;
  readonly bundles = new Map<string, DurableExecutionHistoryBundle>();
  persistManyCallSizes: number[] = [];
  failWrites = false;

  getBackendState(): ExecutionHistoryBackendState {
    return { backend: "D1", state: "DURABLE_AVAILABLE", reason_code: null };
  }

  async persist(bundle: DurableExecutionHistoryBundle) {
    await this.persistMany([bundle]);
  }

  async persistMany(bundles: DurableExecutionHistoryBundle[]) {
    this.persistManyCallSizes.push(bundles.length);
    if (this.failWrites) throw new Error("D1 synthetic write failure");
    for (const bundle of bundles) {
      assertDurableExecutionHistoryBundle(bundle);
      const existing = this.bundles.get(bundle.execution.execution_id);
      if (existing) assertExecutionHistoryModeConsistency(existing.execution, bundle.execution);
    }
    for (const bundle of bundles) {
      this.bundles.set(bundle.execution.execution_id, structuredClone(bundle));
    }
  }

  async get(identity: ExecutionHistoryIdentity) {
    const bundle = this.bundles.get(identity.execution_id);
    if (!bundle) return null;
    if (
      bundle.execution.scope_key !== identity.scope_key
      || bundle.execution.capability_id !== identity.capability_id
    ) return null;
    return structuredClone(bundle);
  }

  async getByExecutionId(executionId: string) {
    return structuredClone(this.bundles.get(executionId) ?? null);
  }

  async list(query: ExecutionHistoryListQuery): Promise<DurableExecutionRecord[]> {
    return Array.from(this.bundles.values())
      .map((bundle) => bundle.execution)
      .filter((execution) =>
        execution.scope_key === query.scope_key
        && (!query.capability_id || execution.capability_id === query.capability_id)
        && (!query.mode || execution.mode === query.mode)
      )
      .slice(0, query.limit ?? 100)
      .map((record) => structuredClone(record));
  }
}

const createRuntime = (store: ExecutionHistoryStore, kernel = new WorkflowExecutionKernel()) =>
  new DurableWorkflowRuntime(kernel, store, resolver);

const executeDiagnostic = async (runtime: DurableWorkflowRuntime, input = { proof: true }) => {
  const created = await runtime.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
    input,
  });
  return runtime.runToCompletion(created.execution.execution_id);
};

test("B02.2 snapshot bundle round-trip preserves exact kernel state", async () => {
  const kernel = new WorkflowExecutionKernel();
  const completed = await kernel.runToCompletion(
    kernel.createExecution({
      workflow_id: "internal-runtime-diagnostic",
      scope_key: "global-working-memory",
      mode: "LIVE",
      input: { alpha: 1 },
    }).execution.execution_id,
  );
  kernel.selectNextAction(completed.execution.execution_id, "RERUN_DIAGNOSTIC");
  const selected = kernel.getExecution(completed.execution.execution_id);
  const bundle = snapshotToDurableHistory(selected, CAPABILITY);
  assertDurableExecutionHistoryBundle(bundle);
  assert.deepEqual(durableHistoryToSnapshot(bundle), selected);
});

test("B02.2 fresh kernel hydrates completed execution, provenance, events, and next-action state from durable history", async () => {
  const store = new MemoryExecutionHistoryStore();
  const firstRuntime = createRuntime(store);
  const completed = await executeDiagnostic(firstRuntime, { alpha: 1, beta: 2 });
  await firstRuntime.selectNextAction(completed.execution.execution_id, "RERUN_DIAGNOSTIC");
  const beforeRestart = await firstRuntime.getExecution(completed.execution.execution_id);

  const restartedRuntime = createRuntime(store, new WorkflowExecutionKernel());
  const afterRestart = await restartedRuntime.getExecution(completed.execution.execution_id);

  assert.deepEqual(afterRestart, beforeRestart);
  assert.equal(afterRestart.execution.status, "COMPLETED");
  assert.equal(afterRestart.execution.selected_next_action?.command, "RERUN_DIAGNOSTIC");
  assert.equal(afterRestart.provenance_envelopes.length, 2);
  assert.ok(afterRestart.events.some((event) => event.event_type === "next_action.selected"));
});

test("B02.2 hydrated execution can continue through the same kernel transition rules", async () => {
  const store = new MemoryExecutionHistoryStore();
  const firstRuntime = createRuntime(store);
  const created = await firstRuntime.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
    input: { restart: true },
  });

  const restartedRuntime = createRuntime(store, new WorkflowExecutionKernel());
  const started = await restartedRuntime.start(created.execution.execution_id);
  assert.equal(started.execution.status, "RUNNING");
  assert.equal(started.events[0].sequence, 1);
  assert.equal(started.events[1].sequence, 2);

  const completed = await restartedRuntime.runToCompletion(created.execution.execution_id);
  assert.equal(completed.execution.status, "COMPLETED");
  assert.equal(completed.execution.output?.diagnostic, "PASS");
});

test("B02.2 follow-up creation persists parent and child in one store transaction boundary", async () => {
  const store = new MemoryExecutionHistoryStore();
  const runtime = createRuntime(store);
  const completed = await executeDiagnostic(runtime);
  await runtime.selectNextAction(completed.execution.execution_id, "RERUN_DIAGNOSTIC");
  const child = await runtime.spawnSelectedNextAction(completed.execution.execution_id, { child: true });

  assert.equal(store.persistManyCallSizes.at(-1), 2);
  assert.ok(store.bundles.has(completed.execution.execution_id));
  assert.ok(store.bundles.has(child.execution.execution_id));
  assert.equal(
    store.bundles.get(completed.execution.execution_id)?.execution.scope_key,
    store.bundles.get(child.execution.execution_id)?.execution.scope_key,
  );
});

test("B02.2 D1 write failure rolls a kernel transition back to the last durable snapshot", async () => {
  const store = new MemoryExecutionHistoryStore();
  const kernel = new WorkflowExecutionKernel();
  const runtime = createRuntime(store, kernel);
  const created = await runtime.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
  });
  const started = await runtime.start(created.execution.execution_id);
  const before = structuredClone(started);
  store.failWrites = true;

  await assert.rejects(
    () => runtime.pause(created.execution.execution_id),
    (error: unknown) => error instanceof WorkflowKernelError && error.code === "DURABLE_HISTORY_WRITE_FAILED",
  );
  assert.deepEqual(kernel.getExecution(created.execution.execution_id), before);
});

test("B02.2 missing D1 binding is explicit degraded mode and is never mistaken for restart-safe history", async () => {
  const unavailable = new UnavailableExecutionHistoryStore("D1_BINDING_UNAVAILABLE");
  const runtime = createRuntime(unavailable);
  const created = await runtime.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
  });
  assert.equal(runtime.getBackendState().state, "DURABLE_UNAVAILABLE");
  assert.equal(runtime.getBackendState().reason_code, "D1_BINDING_UNAVAILABLE");

  const restarted = createRuntime(unavailable, new WorkflowExecutionKernel());
  await assert.rejects(
    () => restarted.getExecution(created.execution.execution_id),
    (error: unknown) => error instanceof WorkflowKernelError && error.code === "EXECUTION_NOT_FOUND",
  );
});
