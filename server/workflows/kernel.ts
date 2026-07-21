import { InternalDiagnosticWorkflowHandler } from "./diagnostic-handler.ts";
import type {
  CreateExecutionRequest,
  ExecutionEvent,
  ExecutionSnapshot,
  HandlerResult,
  JsonObject,
  WorkflowExecution,
  WorkflowExecutionError,
  WorkflowHandler,
} from "./types.ts";

const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const controllableStatuses = new Set(["QUEUED", "RUNNING", "WAITING", "APPROVAL_REQUIRED", "PAUSED"]);

export class WorkflowKernelError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 400) {
    super(message);
  }
}

export class WorkflowExecutionKernel {
  private readonly executions = new Map<string, WorkflowExecution>();
  private readonly events = new Map<string, ExecutionEvent[]>();
  private readonly handlers = new Map<string, WorkflowHandler>();

  constructor(handlers: WorkflowHandler[] = [new InternalDiagnosticWorkflowHandler()]) {
    handlers.forEach((handler) => this.handlers.set(handler.workflow_id, handler));
  }

  listLiveWorkflows() {
    return Array.from(this.handlers.values(), (handler) => ({
      workflow_id: handler.workflow_id,
      version: handler.version,
      supports_pause: handler.supports_pause,
      supports_cancel: handler.supports_cancel,
    }));
  }

  createExecution(request: CreateExecutionRequest): ExecutionSnapshot {
    if (request.mode !== "LIVE") {
      throw new WorkflowKernelError(
        "SIMULATION_TRANSPORT_SEPARATE",
        "SIMULATION is owned by SimulationEventTransport and is not executed by the server kernel.",
        409,
      );
    }

    const now = new Date().toISOString();
    const execution: WorkflowExecution = {
      execution_id: crypto.randomUUID(),
      workflow_id: request.workflow_id,
      scope_key: request.scope_key,
      requested_by: request.requested_by ?? null,
      mode: "LIVE",
      status: "QUEUED",
      created_at: now,
      started_at: null,
      completed_at: null,
      current_stage: null,
      input: request.input ?? {},
      output: null,
      error: null,
    };

    this.executions.set(execution.execution_id, execution);
    this.events.set(execution.execution_id, []);

    if (!this.handlers.has(request.workflow_id)) {
      this.transitionToFailure(execution, {
        code: "LIVE_HANDLER_UNAVAILABLE",
        message: `No LIVE WorkflowHandler is registered for '${request.workflow_id}'.`,
      });
      return this.snapshot(execution.execution_id);
    }

    this.emit(execution, "workflow.execution.created", { mode: "LIVE" });
    return this.snapshot(execution.execution_id);
  }

  getExecution(executionId: string): ExecutionSnapshot {
    return this.snapshot(executionId);
  }

  async start(executionId: string): Promise<ExecutionSnapshot> {
    const execution = this.requireExecution(executionId);
    this.assertStatus(execution, ["QUEUED"], "start");
    const handler = this.requireHandler(execution);
    execution.status = "RUNNING";
    execution.started_at = new Date().toISOString();
    execution.current_stage = "start";
    this.emit(execution, "workflow.execution.started");
    return this.applyHandlerResult(execution, await this.invoke(execution, () => handler.start(this.context(execution))));
  }

  async advance(executionId: string): Promise<ExecutionSnapshot> {
    const execution = this.requireExecution(executionId);
    this.assertStatus(execution, ["RUNNING"], "advance");
    const handler = this.requireHandler(execution);
    return this.applyHandlerResult(execution, await this.invoke(execution, () => handler.advance(this.context(execution))));
  }

  async runToCompletion(executionId: string): Promise<ExecutionSnapshot> {
    let snapshot = await this.start(executionId);
    while (snapshot.execution.status === "RUNNING") snapshot = await this.advance(executionId);
    return snapshot;
  }

  pause(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    const handler = this.requireHandler(execution);
    if (!handler.supports_pause) throw new WorkflowKernelError("PAUSE_UNSUPPORTED", "This workflow does not support pause.", 409);
    this.assertStatus(execution, ["RUNNING", "WAITING"], "pause");
    execution.status = "PAUSED";
    this.emit(execution, "workflow.execution.paused");
    return this.snapshot(executionId);
  }

  resume(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    this.assertStatus(execution, ["PAUSED"], "resume");
    execution.status = "RUNNING";
    this.emit(execution, "workflow.execution.resumed");
    return this.snapshot(executionId);
  }

  cancel(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    const handler = this.handlers.get(execution.workflow_id);
    if (handler && !handler.supports_cancel) throw new WorkflowKernelError("CANCEL_UNSUPPORTED", "This workflow does not support cancellation.", 409);
    if (!controllableStatuses.has(execution.status)) {
      throw new WorkflowKernelError("INVALID_TRANSITION", `Cannot cancel an execution in ${execution.status}.`, 409);
    }
    execution.status = "CANCELLED";
    execution.completed_at = new Date().toISOString();
    this.emit(execution, "workflow.execution.cancelled");
    return this.snapshot(executionId);
  }

  fail(executionId: string, error: WorkflowExecutionError): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    if (terminalStatuses.has(execution.status)) throw new WorkflowKernelError("INVALID_TRANSITION", `Cannot fail an execution in ${execution.status}.`, 409);
    this.transitionToFailure(execution, error);
    return this.snapshot(executionId);
  }

  complete(executionId: string, output: JsonObject = {}): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    this.assertStatus(execution, ["RUNNING", "WAITING", "APPROVAL_REQUIRED"], "complete");
    execution.status = "COMPLETED";
    execution.current_stage = "completed";
    execution.completed_at = new Date().toISOString();
    execution.output = output;
    this.emit(execution, "workflow.execution.completed");
    return this.snapshot(executionId);
  }

  private context(execution: WorkflowExecution) {
    return { execution: structuredClone(execution), now: () => new Date().toISOString() };
  }

  private async invoke(execution: WorkflowExecution, operation: () => Promise<HandlerResult>) {
    try {
      return await operation();
    } catch (error) {
      const failure = { code: "HANDLER_FAILED", message: error instanceof Error ? error.message : "Workflow handler failed." };
      this.transitionToFailure(execution, failure);
      throw new WorkflowKernelError(failure.code, failure.message, 500);
    }
  }

  private applyHandlerResult(execution: WorkflowExecution, result: HandlerResult): ExecutionSnapshot {
    execution.status = result.status;
    execution.current_stage = result.current_stage;
    if (result.output) execution.output = result.output;
    if (result.status === "COMPLETED") execution.completed_at = new Date().toISOString();
    this.emit(execution, result.event_type, result.event_data);
    return this.snapshot(execution.execution_id);
  }

  private transitionToFailure(execution: WorkflowExecution, error: WorkflowExecutionError) {
    execution.status = "FAILED";
    execution.error = error;
    execution.completed_at = new Date().toISOString();
    this.emit(execution, "workflow.execution.failed", { error_code: error.code });
  }

  private requireExecution(executionId: string) {
    const execution = this.executions.get(executionId);
    if (!execution) throw new WorkflowKernelError("EXECUTION_NOT_FOUND", "Workflow execution was not found.", 404);
    return execution;
  }

  private requireHandler(execution: WorkflowExecution) {
    const handler = this.handlers.get(execution.workflow_id);
    if (!handler) throw new WorkflowKernelError("LIVE_HANDLER_UNAVAILABLE", "No LIVE handler is registered.", 409);
    return handler;
  }

  private assertStatus(execution: WorkflowExecution, allowed: WorkflowExecution["status"][], operation: string) {
    if (!allowed.includes(execution.status)) {
      throw new WorkflowKernelError("INVALID_TRANSITION", `Cannot ${operation} an execution in ${execution.status}.`, 409);
    }
  }

  private emit(execution: WorkflowExecution, eventType: string, data?: JsonObject) {
    const events = this.events.get(execution.execution_id) ?? [];
    events.push({
      event_id: crypto.randomUUID(),
      execution_id: execution.execution_id,
      workflow_id: execution.workflow_id,
      scope_key: execution.scope_key,
      event_type: eventType,
      status: execution.status,
      stage: execution.current_stage,
      sequence: events.length + 1,
      emitted_at: new Date().toISOString(),
      ...(data ? { data } : {}),
    });
    this.events.set(execution.execution_id, events);
  }

  private snapshot(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    return {
      execution: structuredClone(execution),
      events: structuredClone(this.events.get(executionId) ?? []),
    };
  }
}

type KernelGlobal = typeof globalThis & { __aiKnowledgeWorkflowKernel?: WorkflowExecutionKernel };
const kernelGlobal = globalThis as KernelGlobal;

export const workflowExecutionKernel = kernelGlobal.__aiKnowledgeWorkflowKernel ??= new WorkflowExecutionKernel();
