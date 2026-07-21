import type { RuntimeStatus, StageId, WorkflowDefinition, WorkflowStage } from "./system-registry";
import type { RuntimeMode } from "../shared/runtime-mode";

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
};

export type EventListener = (event: WorkflowEvent) => void;

export interface WorkflowEventTransport {
  readonly mode: RuntimeMode;
  subscribe(listener: EventListener): () => void;
  start(workflow: WorkflowDefinition, scopeKey: string, executionId: string): void;
  pause(): void;
  resume(): void;
  cancel(): void;
  approve(): void;
  reject(): void;
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

  async start(workflow: WorkflowDefinition, scopeKey: string, executionId: string) {
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
    this.emit(this.makeEvent("workflow.completed", finalStage, workflow, scopeKey, executionId, "COMPLETED", performance.now() - started));
  }

  private makeEvent(
    type: string, stage: WorkflowStage, workflow: WorkflowDefinition, scopeKey: string,
    executionId: string, status: RuntimeStatus, duration = 0, nextStage?: string,
  ): WorkflowEvent {
    const read = ["source", "scope", "capability", "retrieval", "stone", "mason", "verification"].includes(stage.id);
    return {
      id: `${executionId}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
      timestamp: new Date().toISOString(), event_type: type, workflow_id: workflow.id, execution_id: executionId,
      scope_key: scopeKey, stage: stage.label, node_id: stage.id, source: stage.source,
      authority: stage.authority, capability: workflow.capability, operation: stage.operation, status,
      duration: Math.round(duration), input_summary: read ? `Bound ${scopeKey} context` : "Approved write-plan digest",
      output_summary: status === "COMPLETED" ? `${stage.label} contract satisfied` : status === "APPROVAL REQUIRED" ? "Downstream execution paused" : undefined,
      provenance: "Registry-backed simulation event · no durable state changed", next_stage: nextStage,
    };
  }
}

// Production adapter boundary. Point this at a server-sent-event endpoint once runtime telemetry is available.
export class SseEventTransport {
  readonly mode: RuntimeMode = "LIVE";
  constructor(readonly endpoint: string) {}
  connect(executionId: string, listener: EventListener) {
    const source = new EventSource(`${this.endpoint}?execution_id=${encodeURIComponent(executionId)}`);
    source.onmessage = (message) => listener(JSON.parse(message.data) as WorkflowEvent);
    return () => source.close();
  }
}
