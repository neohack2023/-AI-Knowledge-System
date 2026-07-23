import { InternalDiagnosticWorkflowHandler } from "./diagnostic-handler.ts";
import {
  getDefaultResultClass,
  resolveNextActionEnvelope,
  type NextActionSelection,
} from "../../shared/next-actions.ts";
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
      allowed_scope_keys: handler.allowed_scope_keys,
      supports_pause: handler.supports_pause,
      supports_cancel: handler.supports_cancel,
      next_actions: getDefaultResultClass(handler.workflow_id) !== null,
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
      parent_execution_id: request.parent_execution_id ?? null,
      mode: "LIVE",
      status: "QUEUED",
      created_at: now,
      started_at: null,
      completed_at: null,
      current_stage: null,
      input: request.input ?? {},
      output: null,
      error: null,
      result_class: null,
      next_action_envelope: null,
      selected_next_action: null,
    };

    this.executions.set(execution.execution_id, execution);
    this.events.set(execution.execution_id, []);

    const handler = this.handlers.get(request.workflow_id);
    if (!handler) {
      this.transitionToFailure(execution, {
        code: "LIVE_HANDLER_UNAVAILABLE",
        message: `No LIVE WorkflowHandler is registered for '${request.workflow_id}'.`,
      });
      return this.snapshot(execution.execution_id);
    }

    if (!this.handlerAllowsScope(handler, request.scope_key)) {
      this.transitionToFailure(execution, {
        code: "LIVE_SCOPE_UNAVAILABLE",
        message: `Workflow '${request.workflow_id}' is not registered for scope '${request.scope_key}'.`,
      });
      return this.snapshot(execution.execution_id);
    }

    this.emit(execution, "workflow.execution.created", {
      mode: "LIVE",
      parent_execution_id: execution.parent_execution_id,
    });
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
    execution.next_action_envelope = null;
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
    execution.result_class = typeof output.result_class === "string"
      ? output.result_class
      : getDefaultResultClass(execution.workflow_id);
    this.emit(execution, "workflow.execution.completed");
    this.generateNextActions(execution);
    return this.snapshot(executionId);
  }

  selectNextAction(executionId: string, command: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    this.assertStatus(execution, ["COMPLETED"], "select a next action for");
    const envelope = execution.next_action_envelope;
    if (!envelope) throw new WorkflowKernelError("NEXT_ACTIONS_UNAVAILABLE", "This execution has no next-action envelope.", 409);

    const blocked = envelope.blocked_actions.find((candidate) => candidate.command === command);
    if (blocked) throw new WorkflowKernelError("NEXT_ACTION_BLOCKED", blocked.blocked_reason, 409);

    const selected = envelope.available_actions.find((candidate) => candidate.command === command);
    if (!selected) throw new WorkflowKernelError("NEXT_ACTION_NOT_FOUND", `Next action '${command}' is not valid for this result.`, 404);

    const now = new Date().toISOString();
    execution.selected_next_action = {
      command: selected.command,
      target_workflow_id: selected.target_workflow_id ?? null,
      selected_at: now,
      decision: selected.requires_approval ? "PENDING_APPROVAL" : "SELECTED",
      decided_at: selected.requires_approval ? null : now,
      child_execution_id: null,
    };

    this.emit(
      execution,
      selected.requires_approval ? "next_action.approval_required" : "next_action.selected",
      {
        command: selected.command,
        autonomy: selected.autonomy,
        target_workflow_id: selected.target_workflow_id ?? null,
        terminal: selected.terminal ?? false,
      },
    );
    return this.snapshot(executionId);
  }

  approveNextAction(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    const selection = this.requirePendingNextAction(execution);
    selection.decision = "APPROVED";
    selection.decided_at = new Date().toISOString();
    this.emit(execution, "next_action.approved", {
      command: selection.command,
      target_workflow_id: selection.target_workflow_id,
    });
    return this.snapshot(executionId);
  }

  rejectNextAction(executionId: string): ExecutionSnapshot {
    const execution = this.requireExecution(executionId);
    const selection = this.requirePendingNextAction(execution);
    selection.decision = "REJECTED";
    selection.decided_at = new Date().toISOString();
    this.emit(execution, "next_action.rejected", {
      command: selection.command,
      target_workflow_id: selection.target_workflow_id,
    });
    return this.snapshot(executionId);
  }

  spawnSelectedNextAction(executionId: string, input: JsonObject = {}): ExecutionSnapshot {
    const parent = this.requireExecution(executionId);
    const selection = parent.selected_next_action;
    if (!selection) throw new WorkflowKernelError("NEXT_ACTION_NOT_SELECTED", "Select a next action before spawning a follow-up execution.", 409);
    if (selection.decision === "PENDING_APPROVAL") throw new WorkflowKernelError("NEXT_ACTION_APPROVAL_REQUIRED", "Approve the selected next action before spawning it.", 409);
    if (selection.decision === "REJECTED") throw new WorkflowKernelError("NEXT_ACTION_REJECTED", "The selected next action was rejected.", 409);
    if (!selection.target_workflow_id) throw new WorkflowKernelError("NEXT_ACTION_NOT_SPAWNABLE", "The selected next action does not target another workflow.", 409);
    if (selection.child_execution_id) return this.snapshot(selection.child_execution_id);

    const child = this.createExecution({
      workflow_id: selection.target_workflow_id,
      scope_key: parent.scope_key,
      requested_by: parent.requested_by,
      parent_execution_id: parent.execution_id,
      mode: "LIVE",
      input: {
        ...input,
        follow_up: {
          parent_execution_id: parent.execution_id,
          command: selection.command,
        },
      },
    });

    if (child.execution.status === "FAILED") {
      throw new WorkflowKernelError(
        child.execution.error?.code ?? "NEXT_ACTION_SPAWN_FAILED",
        child.execution.error?.message ?? "The follow-up execution could not be created.",
        409,
      );
    }

    selection.child_execution_id = child.execution.execution_id;
    this.emit(parent, "next_action.execution_created", {
      command: selection.command,
      child_execution_id: child.execution.execution_id,
      target_workflow_id: selection.target_workflow_id,
    });
    return child;
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
    if (result.result_class) execution.result_class = result.result_class;
    if (result.status === "COMPLETED") {
      execution.completed_at = new Date().toISOString();
      execution.result_class ??= getDefaultResultClass(execution.workflow_id);
    }
    this.emit(execution, result.event_type, result.event_data);
    if (result.status === "COMPLETED") this.generateNextActions(execution);
    return this.snapshot(execution.execution_id);
  }

  private generateNextActions(execution: WorkflowExecution) {
    const resultClass = execution.result_class ?? getDefaultResultClass(execution.workflow_id);
    if (!resultClass) return;
    execution.result_class = resultClass;

    const targetAvailability = Object.fromEntries(
      Array.from(this.handlers.entries(), ([workflowId, handler]) => {
        const available = this.handlerAllowsScope(handler, execution.scope_key);
        return [workflowId, {
          available,
          ...(available ? {} : { reason: `Target workflow '${workflowId}' is not registered for scope '${execution.scope_key}'.` }),
        }];
      }),
    );
    execution.next_action_envelope = resolveNextActionEnvelope({
      execution_id: execution.execution_id,
      scope_key: execution.scope_key,
      workflow_id: execution.workflow_id,
      current_state: execution.status,
      result_class: resultClass,
      authority_context: {
        read_from: ["server workflow kernel", "registered LIVE handler"],
        authority: "Server runtime execution state",
        write_authorized: false,
      },
      target_availability: targetAvailability,
    });

    if (execution.next_action_envelope) {
      this.emit(execution, "next_action.generated", {
        result_class: resultClass,
        recommended_action: execution.next_action_envelope.recommended_action,
        available_commands: execution.next_action_envelope.available_actions.map((candidate) => candidate.command),
        blocked_commands: execution.next_action_envelope.blocked_actions.map((candidate) => candidate.command),
      });
    }
  }

  private transitionToFailure(execution: WorkflowExecution, error: WorkflowExecutionError) {
    execution.status = "FAILED";
    execution.error = error;
    execution.completed_at = new Date().toISOString();
    execution.next_action_envelope = null;
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
    if (!this.handlerAllowsScope(handler, execution.scope_key)) {
      throw new WorkflowKernelError("LIVE_SCOPE_UNAVAILABLE", `Workflow '${execution.workflow_id}' is not registered for scope '${execution.scope_key}'.`, 409);
    }
    return handler;
  }

  private handlerAllowsScope(handler: WorkflowHandler, scopeKey: string) {
    return handler.allowed_scope_keys.includes("*") || handler.allowed_scope_keys.includes(scopeKey);
  }

  private requirePendingNextAction(execution: WorkflowExecution): NextActionSelection {
    const selection = execution.selected_next_action;
    if (!selection || selection.decision !== "PENDING_APPROVAL") {
      throw new WorkflowKernelError("NEXT_ACTION_NOT_PENDING", "No next action is waiting for approval.", 409);
    }
    return selection;
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
