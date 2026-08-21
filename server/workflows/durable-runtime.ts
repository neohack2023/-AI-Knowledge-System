import {
  assertDurableExecutionHistoryBundle,
  type DurableExecutionHistoryBundle,
  type DurableExecutionLink,
  type ExecutionHistoryBackendState,
  type JsonObject as DurableJsonObject,
} from "../../shared/execution-history.ts";
import type { NextActionEnvelope, NextActionSelection } from "../../shared/next-actions.ts";
import type { ContextProvenanceEnvelope } from "../provenance/types.ts";
import type { RuntimeCapabilityDefinition } from "../capabilities/types.ts";
import {
  ExecutionHistoryConflictError,
  persistManyDurableExecutionHistories,
  readDurableExecutionHistoryById,
  type ExecutionHistoryStore,
} from "./execution-history-store.ts";
import {
  WorkflowExecutionKernel,
  WorkflowKernelError,
} from "./kernel.ts";
import type {
  CreateExecutionRequest,
  ExecutionSnapshot,
  JsonObject,
  WorkflowExecutionError,
} from "./types.ts";

export type CapabilityIdResolver = (workflowId: string) => string | null;

const executionAuthority = {
  authority_owner: "WorkflowExecutionKernel",
  authority_domain: "server-runtime-execution-state",
  authority_state: "execution_truth" as const,
};

const provenanceAuthorityState = (
  state: ContextProvenanceEnvelope["authority_state"],
): DurableExecutionLink["authority_state"] => {
  if (state === "AUTHORITATIVE") return "authoritative";
  if (state === "SHADOW") return "shadow";
  return "observational";
};

const asDurableObject = (value: unknown) => value as DurableJsonObject;

export const snapshotToDurableHistory = (
  snapshot: ExecutionSnapshot,
  capabilityId: string,
): DurableExecutionHistoryBundle => {
  const execution = snapshot.execution;
  const traceId = snapshot.provenance_envelopes.find((envelope) => envelope.trace_id)?.trace_id ?? null;
  const identity = {
    execution_id: execution.execution_id,
    scope_key: execution.scope_key,
    capability_id: capabilityId,
  };
  const links: DurableExecutionLink[] = snapshot.provenance_envelopes.map((envelope) => ({
    ...identity,
    link_id: `provenance:${envelope.envelope_id}`,
    link_type: "PROVENANCE",
    target_id: envelope.envelope_id,
    source_system: "runtime",
    authority_owner: envelope.authority_owner,
    authority_domain: envelope.authority_domain,
    authority_state: provenanceAuthorityState(envelope.authority_state),
    created_at: envelope.emitted_at,
    metadata: asDurableObject({
      kind: "CONTEXT_PROVENANCE_ENVELOPE",
      envelope,
    }),
  }));

  links.push({
    ...identity,
    link_id: `runtime-state:${execution.execution_id}`,
    link_type: "RELATED_EXECUTION",
    target_id: execution.execution_id,
    source_system: "runtime",
    ...executionAuthority,
    created_at: execution.completed_at ?? execution.started_at ?? execution.created_at,
    metadata: asDurableObject({
      kind: "KERNEL_STATE",
      next_action_envelope: execution.next_action_envelope,
      selected_next_action: execution.selected_next_action,
    }),
  });

  if (execution.parent_execution_id) {
    links.push({
      ...identity,
      link_id: `parent:${execution.execution_id}:${execution.parent_execution_id}`,
      link_type: "RELATED_EXECUTION",
      target_id: execution.parent_execution_id,
      source_system: "runtime",
      ...executionAuthority,
      created_at: execution.created_at,
      metadata: { kind: "PARENT_EXECUTION" },
    });
  }

  const bundle: DurableExecutionHistoryBundle = {
    execution: {
      schema_name: "AIOSDurableExecutionHistory",
      schema_version: "0.1",
      ...identity,
      workflow_id: execution.workflow_id,
      trace_id: traceId,
      requested_by: execution.requested_by,
      parent_execution_id: execution.parent_execution_id,
      mode: execution.mode,
      status: execution.status,
      created_at: execution.created_at,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      current_stage: execution.current_stage,
      input: asDurableObject(execution.input),
      output: execution.output === null ? null : asDurableObject(execution.output),
      error: execution.error,
      result_class: execution.result_class,
      ...executionAuthority,
    },
    events: snapshot.events.map((event) => ({
      ...identity,
      event_id: event.event_id,
      workflow_id: event.workflow_id,
      event_type: event.event_type,
      status: event.status,
      stage: event.stage,
      sequence: event.sequence,
      emitted_at: event.emitted_at,
      data: event.data ? asDurableObject(event.data) : null,
    })),
    links,
  };
  assertDurableExecutionHistoryBundle(bundle);
  return bundle;
};

export const durableHistoryToSnapshot = (
  bundle: DurableExecutionHistoryBundle,
): ExecutionSnapshot => {
  assertDurableExecutionHistoryBundle(bundle);
  if (bundle.execution.mode !== "LIVE") {
    throw new WorkflowKernelError(
      "DURABLE_MODE_NOT_LIVE",
      "SIMULATION history cannot be hydrated into the LIVE workflow kernel.",
      409,
    );
  }
  const runtimeState = bundle.links.find((link) =>
    link.link_type === "RELATED_EXECUTION"
    && link.target_id === bundle.execution.execution_id
    && link.metadata.kind === "KERNEL_STATE"
  );
  const nextActionEnvelope = (runtimeState?.metadata.next_action_envelope ?? null) as NextActionEnvelope | null;
  const selectedNextAction = (runtimeState?.metadata.selected_next_action ?? null) as NextActionSelection | null;
  const provenance = bundle.links
    .filter((link) => link.link_type === "PROVENANCE" && link.metadata.kind === "CONTEXT_PROVENANCE_ENVELOPE")
    .map((link) => link.metadata.envelope as unknown as ContextProvenanceEnvelope);

  return {
    execution: {
      execution_id: bundle.execution.execution_id,
      workflow_id: bundle.execution.workflow_id,
      scope_key: bundle.execution.scope_key,
      requested_by: bundle.execution.requested_by,
      parent_execution_id: bundle.execution.parent_execution_id,
      mode: "LIVE",
      status: bundle.execution.status,
      created_at: bundle.execution.created_at,
      started_at: bundle.execution.started_at,
      completed_at: bundle.execution.completed_at,
      current_stage: bundle.execution.current_stage,
      input: bundle.execution.input as JsonObject,
      output: bundle.execution.output as JsonObject | null,
      error: bundle.execution.error,
      result_class: bundle.execution.result_class,
      next_action_envelope: nextActionEnvelope,
      selected_next_action: selectedNextAction,
    },
    events: bundle.events.map((event) => ({
      event_id: event.event_id,
      execution_id: event.execution_id,
      workflow_id: event.workflow_id,
      scope_key: event.scope_key,
      event_type: event.event_type,
      status: event.status,
      stage: event.stage,
      sequence: event.sequence,
      emitted_at: event.emitted_at,
      ...(event.data ? { data: event.data as JsonObject } : {}),
    })),
    provenance_envelopes: provenance,
  };
};

export class DurableWorkflowRuntime {
  constructor(
    private readonly kernel: WorkflowExecutionKernel,
    private readonly store: ExecutionHistoryStore,
    private readonly resolveCapabilityId: CapabilityIdResolver,
  ) {}

  listLiveWorkflows() {
    return this.kernel.listLiveWorkflows();
  }

  getBackendState(): ExecutionHistoryBackendState {
    return this.store.getBackendState();
  }

  async createExecution(request: CreateExecutionRequest): Promise<ExecutionSnapshot> {
    if (request.mode !== "LIVE") return this.kernel.createExecution(request);
    const capabilityId = this.requireCapabilityForLiveHandler(request.workflow_id);
    const snapshot = this.kernel.createExecution(request);
    if (!capabilityId) return snapshot;
    try {
      await this.persistIfAvailable([snapshotToDurableHistory(snapshot, capabilityId)]);
      return snapshot;
    } catch (error) {
      this.kernel.discardExecution(snapshot.execution.execution_id);
      throw this.persistenceFailure(error);
    }
  }

  async getExecution(executionId: string): Promise<ExecutionSnapshot> {
    if (this.persistenceAvailable()) {
      try {
        const bundle = await readDurableExecutionHistoryById(this.store, executionId);
        if (bundle) return this.kernel.restoreExecution(durableHistoryToSnapshot(bundle));
      } catch (error) {
        if (error instanceof WorkflowKernelError) throw error;
        throw this.persistenceReadFailure(error);
      }
    }
    return this.kernel.getExecution(executionId);
  }

  async getProvenanceEnvelope(executionId: string, envelopeId: string, expectedScopeKey?: string) {
    await this.getExecution(executionId);
    return this.kernel.getProvenanceEnvelope(executionId, envelopeId, expectedScopeKey);
  }

  async start(executionId: string) {
    return this.mutate(executionId, () => this.kernel.start(executionId));
  }

  async advance(executionId: string) {
    return this.mutate(executionId, () => this.kernel.advance(executionId));
  }

  async runToCompletion(executionId: string) {
    let snapshot = await this.start(executionId);
    while (snapshot.execution.status === "RUNNING") snapshot = await this.advance(executionId);
    return snapshot;
  }

  async pause(executionId: string) {
    return this.mutate(executionId, () => this.kernel.pause(executionId));
  }

  async resume(executionId: string) {
    return this.mutate(executionId, () => this.kernel.resume(executionId));
  }

  async cancel(executionId: string) {
    return this.mutate(executionId, () => this.kernel.cancel(executionId));
  }

  async fail(executionId: string, error: WorkflowExecutionError) {
    return this.mutate(executionId, () => this.kernel.fail(executionId, error));
  }

  async complete(executionId: string, output: JsonObject = {}) {
    return this.mutate(executionId, () => this.kernel.complete(executionId, output));
  }

  async selectNextAction(executionId: string, command: string) {
    return this.mutate(executionId, () => this.kernel.selectNextAction(executionId, command));
  }

  async approveNextAction(executionId: string) {
    return this.mutate(executionId, () => this.kernel.approveNextAction(executionId));
  }

  async rejectNextAction(executionId: string) {
    return this.mutate(executionId, () => this.kernel.rejectNextAction(executionId));
  }

  async spawnSelectedNextAction(executionId: string, input: JsonObject = {}) {
    const beforeParent = await this.getExecution(executionId);
    const parentCapability = this.requireCapabilityId(beforeParent.execution.workflow_id);
    let child: ExecutionSnapshot | null = null;
    try {
      child = this.kernel.spawnSelectedNextAction(executionId, input);
      const parent = this.kernel.getExecution(executionId);
      const childCapability = this.requireCapabilityId(child.execution.workflow_id);
      await this.persistIfAvailable([
        snapshotToDurableHistory(parent, parentCapability),
        snapshotToDurableHistory(child, childCapability),
      ]);
      return child;
    } catch (error) {
      if (child) this.kernel.discardExecution(child.execution.execution_id);
      if (this.isPersistenceError(error)) {
        await this.restoreLatestDurableOrFallback(executionId, beforeParent);
        throw this.persistenceFailure(error);
      }
      this.kernel.restoreExecution(beforeParent);
      throw error;
    }
  }

  private async mutate(
    executionId: string,
    operation: () => ExecutionSnapshot | Promise<ExecutionSnapshot>,
  ): Promise<ExecutionSnapshot> {
    const before = await this.getExecution(executionId);
    const capabilityId = this.requireCapabilityId(before.execution.workflow_id);
    let after: ExecutionSnapshot;

    try {
      after = await operation();
    } catch (error) {
      let current: ExecutionSnapshot | null = null;
      try { current = this.kernel.getExecution(executionId); } catch { current = null; }
      if (current && JSON.stringify(current) !== JSON.stringify(before)) {
        try {
          await this.persistIfAvailable([snapshotToDurableHistory(current, capabilityId)]);
        } catch (persistError) {
          await this.restoreLatestDurableOrFallback(executionId, before);
          throw this.persistenceFailure(persistError);
        }
      }
      throw error;
    }

    try {
      await this.persistIfAvailable([snapshotToDurableHistory(after, capabilityId)]);
      return after;
    } catch (error) {
      await this.restoreLatestDurableOrFallback(executionId, before);
      throw this.persistenceFailure(error);
    }
  }

  private async restoreLatestDurableOrFallback(executionId: string, fallback: ExecutionSnapshot) {
    if (this.persistenceAvailable()) {
      try {
        const bundle = await readDurableExecutionHistoryById(this.store, executionId);
        if (bundle) {
          this.kernel.restoreExecution(durableHistoryToSnapshot(bundle));
          return;
        }
      } catch {
        // Preserve the last known-good local snapshot when the durable read itself is unavailable.
      }
    }
    this.kernel.restoreExecution(fallback);
  }

  private requireCapabilityForLiveHandler(workflowId: string) {
    const capabilityId = this.resolveCapabilityId(workflowId);
    if (capabilityId) return capabilityId;
    const hasLiveHandler = this.kernel.listLiveWorkflows().some((workflow) => workflow.workflow_id === workflowId);
    if (hasLiveHandler) {
      throw new WorkflowKernelError(
        "DURABLE_CAPABILITY_UNRESOLVED",
        `LIVE workflow '${workflowId}' has no exact active capability_id binding for durable history.`,
        409,
      );
    }
    return null;
  }

  private requireCapabilityId(workflowId: string) {
    const capabilityId = this.resolveCapabilityId(workflowId);
    if (!capabilityId) {
      throw new WorkflowKernelError(
        "DURABLE_CAPABILITY_UNRESOLVED",
        `Workflow '${workflowId}' has no exact active capability_id binding for durable history.`,
        409,
      );
    }
    return capabilityId;
  }

  private persistenceAvailable() {
    return this.store.getBackendState().state === "DURABLE_AVAILABLE";
  }

  private async persistIfAvailable(bundles: DurableExecutionHistoryBundle[]) {
    const state = this.store.getBackendState();
    if (state.state !== "DURABLE_AVAILABLE") {
      if (state.reason_code === "D1_BINDING_UNAVAILABLE") return;
      throw new Error(`Durable execution history unavailable (${state.reason_code ?? "UNKNOWN"}).`);
    }
    await persistManyDurableExecutionHistories(this.store, bundles);
  }

  private isPersistenceError(error: unknown) {
    return error instanceof ExecutionHistoryConflictError
      || (error instanceof Error && (
        error.message.includes("D1")
        || error.message.includes("Durable execution history")
        || error.message.includes("EXECUTION_HISTORY")
      ));
  }

  private persistenceFailure(error: unknown) {
    if (error instanceof ExecutionHistoryConflictError) {
      return new WorkflowKernelError(
        "DURABLE_HISTORY_CONFLICT",
        error.message,
        409,
      );
    }
    return new WorkflowKernelError(
      "DURABLE_HISTORY_WRITE_FAILED",
      error instanceof Error ? error.message : "Durable execution history write failed.",
      503,
    );
  }

  private persistenceReadFailure(error: unknown) {
    return new WorkflowKernelError(
      "DURABLE_HISTORY_READ_FAILED",
      error instanceof Error ? error.message : "Durable execution history read failed.",
      503,
    );
  }
}

export const capabilityResolverFromRegistry = (capabilities: RuntimeCapabilityDefinition[]): CapabilityIdResolver =>
  (workflowId) => {
    const matches = capabilities.filter((capability) =>
      capability.workflow_id === workflowId && capability.status === "ACTIVE"
    );
    return matches.length === 1 ? matches[0].capability_id : null;
  };
