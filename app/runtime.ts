import type { RuntimeStatus, StageId, WorkflowDefinition, WorkflowStage } from "./system-registry";
import type { RuntimeMode } from "../shared/runtime-mode";
import {
  getDefaultResultClass,
  resolveNextActionEnvelope,
  type NextActionEnvelope,
} from "../shared/next-actions";

export type WorkflowEvent = {
  id: string;
  timestamp: string;
  event_type: string;
  workflow_id: string;
  execution_id: string;
  scope_key: string;
  stage: string;
  node_id: StageId;
  source?: string;
  authority?: string;
  capability?: string;
  operation?: string;
  status: RuntimeStatus;
  duration?: number;
  input_summary?: string;
  output_summary?: string;
  provenance?: string;
  error?: string;
  next_stage?: string;
  next_action_envelope?: NextActionEnvelope;
};

export type EventListener = (event: WorkflowEvent) => void;

export interface WorkflowEventTransport {
  readonly mode: RuntimeMode;
  subscribe(listener: EventListener): () => void;
  start(workflow: WorkflowDefinition, scopeKey: string, executionId?: string): Promise<string>;
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
  cancel(): void | Promise<void>;
  approve(): void;
  reject(): void;
  selectNextAction?(command: string): Promise<void>;
  approveNextAction?(): Promise<void>;
  rejectNextAction?(): Promise<void>;
  spawnNextAction?(input?: Record<string, unknown>): Promise<string>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class SimulationEventTransport implements WorkflowEventTransport {
  readonly mode: RuntimeMode = "SIMULATION";
  private listeners = new Set<EventListener>();
  private cancelled = false;
  private paused = false;
  private rejected = false;
  private approvalResolver?: () => void;
  private pauseResolvers: (() => void)[] = [];
  private readonly availableWorkflowIds: Set<string>;

  constructor(availableWorkflowIds: Iterable<string> = []) {
    this.availableWorkflowIds = new Set(availableWorkflowIds);
  }

  subscribe(listener: EventListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: WorkflowEvent) { this.listeners.forEach((listener) => listener(event)); }
  private async waitWhilePaused() {
    if (!this.paused) return;
    await new Promise<void>((resolve) => this.pauseResolvers.push(resolve));
  }
  pause() { this.paused = true; }
  resume() { this.paused = false; this.pauseResolvers.splice(0).forEach((resolve) => resolve()); }
  cancel() { this.cancelled = true; this.resume(); this.approvalResolver?.(); }
  approve() { this.approvalResolver?.(); this.approvalResolver = undefined; }
  reject() { this.rejected = true; this.cancel(); }

  async start(workflow: WorkflowDefinition, scopeKey: string, executionId = crypto.randomUUID()) {
    this.cancelled = false; this.paused = false; this.rejected = false;
    const started = performance.now();
    for (let i = 0; i < workflow.stages.length; i++) {
      await this.waitWhilePaused();
      const item = workflow.stages[i];
      const next = workflow.stages[i + 1]?.id;
      if (this.cancelled) {
        this.emit(this.makeEvent("workflow.cancelled", item, workflow, scopeKey, executionId, "CANCELLED", 0, next));
        return;
      }
      if (item.id === "approval") {
        this.emit(this.makeEvent(item.eventStart, item, workflow, scopeKey, executionId, "APPROVAL REQUIRED", 0, next));
        await new Promise<void>((resolve) => { this.approvalResolver = resolve; });
        if (this.rejected || this.cancelled) {
          this.emit(this.makeEvent("approval.rejected", item, workflow, scopeKey, executionId, "CANCELLED", 0, next));
          return;
        }
        this.emit(this.makeEvent(item.eventComplete, item, workflow, scopeKey, executionId, "COMPLETED", 0, next));
        continue;
      }
      const stageStarted = performance.now();
      this.emit(this.makeEvent(item.eventStart, item, workflow, scopeKey, executionId, "ACTIVE", 0, next));
      let remaining = item.duration;
      while (remaining > 0 && !this.cancelled) {
        await this.waitWhilePaused();
        const slice = Math.min(120, remaining);
        await wait(slice);
        remaining -= slice;
      }
      if (this.cancelled) {
        this.emit(this.makeEvent("workflow.cancelled", item, workflow, scopeKey, executionId, "CANCELLED", performance.now() - stageStarted, next));
        return;
      }
      this.emit(this.makeEvent(item.eventComplete, item, workflow, scopeKey, executionId, "COMPLETED", performance.now() - stageStarted, next));
    }
    const finalStage = workflow.stages.at(-1)!;
    const resultClass = getDefaultResultClass(workflow.id);
    const targetAvailability = this.availableWorkflowIds.size > 0
      ? Object.fromEntries(Array.from(this.availableWorkflowIds, (id) => [id, { available: true }]))
      : undefined;
    const nextActions = resultClass ? resolveNextActionEnvelope({
      execution_id: executionId,
      scope_key: scopeKey,
      workflow_id: workflow.id,
      current_state: "COMPLETED",
      result_class: resultClass,
      authority_context: {
        read_from: ["SimulationEventTransport", "workflow registry snapshot"],
        authority: "Simulation only",
        write_authorized: false,
      },
      target_availability: targetAvailability,
    }) : null;

    if (nextActions) {
      this.emit(this.makeEvent(
        "next_action.generated",
        finalStage,
        workflow,
        scopeKey,
        executionId,
        "COMPLETED",
        0,
        undefined,
        nextActions,
      ));
    }
    this.emit(this.makeEvent(
      "workflow.completed",
      finalStage,
      workflow,
      scopeKey,
      executionId,
      "COMPLETED",
      performance.now() - started,
      undefined,
      nextActions ?? undefined,
    ));
    return executionId;
  }

  private makeEvent(
    type: string, stage: WorkflowStage, workflow: WorkflowDefinition, scopeKey: string,
    executionId: string, status: RuntimeStatus, duration = 0, nextStage?: string,
    nextActionEnvelope?: NextActionEnvelope,
  ): WorkflowEvent {
    const nextActionEvent = type.startsWith("next_action.");
    const read = ["source", "scope", "capability", "retrieval", "stone", "mason", "verification"].includes(stage.id);
    return {
      id: `${executionId}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      timestamp: new Date().toISOString(), event_type: type, workflow_id: workflow.id, execution_id: executionId,
      scope_key: scopeKey, stage: nextActionEvent ? "Next actions" : stage.label, node_id: nextActionEvent ? "next-action" : stage.id,
      source: nextActionEvent ? "NextActionEnvelope" : stage.source,
      authority: nextActionEvent ? "Workflow transition registry" : stage.authority,
      capability: workflow.capability,
      operation: nextActionEvent ? "Resolve legal follow-up transitions" : stage.operation,
      status,
      duration: Math.round(duration), input_summary: read ? `Bound ${scopeKey} context` : "Approved write-plan digest",
      output_summary: nextActionEvent
        ? `${nextActionEnvelope?.available_actions.length ?? 0} available · ${nextActionEnvelope?.blocked_actions.length ?? 0} blocked`
        : status === "COMPLETED" ? `${stage.label} contract satisfied` : status === "APPROVAL REQUIRED" ? "Downstream execution paused" : undefined,
      provenance: "Registry-backed simulation event · no durable state changed", next_stage: nextStage,
      ...(nextActionEnvelope ? { next_action_envelope: nextActionEnvelope } : {}),
    };
  }
}

type CockpitExecutionEnvelope = {
  schema_name: "CockpitLiveExecutionReadEnvelope";
  schema_version: string;
  transport: "LIVE_SERVER_POLL" | "LIVE_SERVER_SSE";
  execution: {
    execution_id: string;
    workflow_id: string;
    scope_key: string;
    mode: "LIVE";
    status: string;
    display_status: RuntimeStatus;
    current_stage: string | null;
  };
  events: WorkflowEvent[];
  cursor: {
    after_sequence: number;
    last_sequence: number;
    terminal: boolean;
    poll_after_ms: number;
  };
  authority_context: {
    execution_state_authority: string;
    implementation_truth: string;
  };
  provenance: { envelope_count: number; envelope_ids: string[] };
};

type SnapshotResponse = {
  execution?: { execution_id?: string; status?: string };
  error?: { code?: string; message?: string };
};

export class LiveWorkflowEventTransport implements WorkflowEventTransport {
  readonly mode: RuntimeMode = "LIVE";
  private readonly listeners = new Set<EventListener>();
  private executionId?: string;
  private afterSequence = 0;
  private kernelStatus = "QUEUED";
  private terminal = false;
  private paused = false;
  private cancelled = false;
  private driving = false;
  private workflow?: WorkflowDefinition;
  private scopeKey?: string;

  constructor(readonly endpoint = "/api/workflow-executions") {}

  subscribe(listener: EventListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: WorkflowEvent) { this.listeners.forEach((listener) => listener(event)); }

  async start(workflow: WorkflowDefinition, scopeKey: string) {
    this.workflow = workflow;
    this.scopeKey = scopeKey;
    this.afterSequence = 0;
    this.terminal = false;
    this.paused = false;
    this.cancelled = false;

    const created = await this.post({
      action: "create",
      workflow_id: workflow.id,
      scope_key: scopeKey,
      mode: "LIVE",
      input: {
        source: "aios-cockpit",
        capability_id: workflow.capability,
        requested_transport: "CockpitLiveExecutionReadEnvelope/0.1",
      },
    });
    const id = created.execution?.execution_id;
    if (!id) throw new Error(created.error?.message ?? "The workflow kernel did not return an execution ID.");
    this.executionId = id;
    await this.pull();
    void this.drive();
    return id;
  }

  async pause() {
    if (!this.executionId || this.terminal) return;
    this.paused = true;
    await this.post({ action: "pause", execution_id: this.executionId });
    await this.pull();
  }

  async resume() {
    if (!this.executionId || this.terminal) return;
    await this.post({ action: "resume", execution_id: this.executionId });
    this.paused = false;
    await this.pull();
    void this.drive();
  }

  async cancel() {
    if (!this.executionId || this.terminal) return;
    this.cancelled = true;
    await this.post({ action: "cancel", execution_id: this.executionId });
    await this.pull();
  }

  approve() {}
  reject() {}

  async selectNextAction(command: string) {
    if (!this.executionId) return;
    await this.post({ action: "select_next_action", execution_id: this.executionId, command });
    await this.pull();
  }

  async approveNextAction() {
    if (!this.executionId) return;
    await this.post({ action: "approve_next_action", execution_id: this.executionId });
    await this.pull();
  }

  async rejectNextAction() {
    if (!this.executionId) return;
    await this.post({ action: "reject_next_action", execution_id: this.executionId });
    await this.pull();
  }

  async spawnNextAction(input: Record<string, unknown> = {}) {
    if (!this.executionId) throw new Error("No live execution is active.");
    const child = await this.post({ action: "spawn_next_action", execution_id: this.executionId, input });
    const childId = child.execution?.execution_id;
    if (!childId) throw new Error(child.error?.message ?? "The workflow kernel did not create the child execution.");
    this.executionId = childId;
    this.afterSequence = 0;
    this.kernelStatus = "QUEUED";
    this.terminal = false;
    this.paused = false;
    this.cancelled = false;
    await this.pull();
    void this.drive();
    return childId;
  }

  private async drive() {
    if (this.driving || !this.executionId || this.terminal || this.cancelled) return;
    this.driving = true;
    try {
      if (this.kernelStatus === "QUEUED") {
        await this.post({ action: "start", execution_id: this.executionId });
        await this.pull();
      }
      while (!this.terminal && !this.cancelled && !this.paused && this.kernelStatus === "RUNNING") {
        await wait(520);
        if (this.paused || this.cancelled || this.terminal) break;
        await this.post({ action: "advance", execution_id: this.executionId });
        await this.pull();
      }
    } catch (error) {
      this.emitFailure(error);
    } finally {
      this.driving = false;
    }
  }

  private async pull() {
    if (!this.executionId) return;
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set("view", "cockpit");
    url.searchParams.set("execution_id", this.executionId);
    url.searchParams.set("after_sequence", String(this.afterSequence));
    const response = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const body = await response.json() as CockpitExecutionEnvelope | SnapshotResponse;
    if (!response.ok || !("cursor" in body)) {
      const failure = body as SnapshotResponse;
      throw new Error(failure.error?.message ?? `Live workflow read failed with HTTP ${response.status}.`);
    }
    this.afterSequence = body.cursor.last_sequence;
    this.kernelStatus = body.execution.status;
    this.terminal = body.cursor.terminal;
    body.events.forEach((event) => this.emit(event));
  }

  private async post(payload: Record<string, unknown>) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json() as SnapshotResponse;
    if (!response.ok) throw new Error(body.error?.message ?? `Workflow operation failed with HTTP ${response.status}.`);
    return body;
  }

  private emitFailure(error: unknown) {
    if (!this.workflow || !this.scopeKey) return;
    const message = error instanceof Error ? error.message : "Live workflow transport failed.";
    this.terminal = true;
    this.emit({
      id: `${this.executionId ?? "live"}-transport-failed-${Date.now()}`,
      timestamp: new Date().toISOString(),
      event_type: "cockpit.live_transport.failed",
      workflow_id: this.workflow.id,
      execution_id: this.executionId ?? "unassigned",
      scope_key: this.scopeKey,
      stage: "Live transport",
      node_id: "execution",
      source: "WorkflowExecutionKernel",
      authority: "GitHub implementation truth",
      capability: this.workflow.capability,
      operation: "Read live execution envelope",
      status: "FAILED",
      error: message,
      output_summary: message,
      provenance: "Transport failure observation · no authority widened",
    });
  }
}

// Optional streaming adapter retained for endpoints that expose continuous SSE.
export class SseEventTransport {
  readonly mode: RuntimeMode = "LIVE";
  constructor(readonly endpoint: string) {}
  connect(executionId: string, listener: EventListener) {
    const url = new URL(this.endpoint, window.location.origin);
    url.searchParams.set("view", "cockpit");
    url.searchParams.set("transport", "sse");
    url.searchParams.set("execution_id", executionId);
    const source = new EventSource(url);
    source.onmessage = (message) => listener(JSON.parse(message.data) as WorkflowEvent);
    return () => source.close();
  }
}
