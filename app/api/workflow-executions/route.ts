import { WorkflowKernelError } from "../../../server/workflows/kernel.ts";
import { getDurableWorkflowRuntime } from "../../../server/workflows/durable-runtime-instance.ts";
import type { DurableWorkflowRuntime } from "../../../server/workflows/durable-runtime.ts";
import {
  cockpitLiveReadSchema,
  projectCockpitLiveRead,
} from "../../../server/workflows/cockpit-read-adapter.ts";
import type { CreateExecutionRequest, JsonObject } from "../../../server/workflows/types.ts";
import type { RuntimeMode } from "../../../shared/runtime-mode.ts";

export const runtime = "edge";

type OperationBody = {
  action?: string;
  execution_id?: string;
  workflow_id?: string;
  scope_key?: string;
  command?: string;
  mode?: Extract<RuntimeMode, "LIVE" | "SIMULATION">;
  input?: JsonObject;
  output?: JsonObject;
  error?: { code?: string; message?: string };
};

const historyHeaders = (runtimeState: ReturnType<DurableWorkflowRuntime["getBackendState"]>) => ({
  "x-aios-execution-history": runtimeState.state,
  "x-aios-execution-history-backend": runtimeState.backend,
  ...(runtimeState.reason_code ? { "x-aios-execution-history-reason": runtimeState.reason_code } : {}),
});

const json = (
  body: unknown,
  status = 200,
  runtimeState?: ReturnType<DurableWorkflowRuntime["getBackendState"]>,
) => Response.json(body, {
  status,
  ...(runtimeState ? { headers: historyHeaders(runtimeState) } : {}),
});

const cockpitJson = (
  body: unknown,
  runtimeState: ReturnType<DurableWorkflowRuntime["getBackendState"]>,
) => Response.json(body, {
  headers: {
    "cache-control": "no-store",
    "x-aios-event-contract": `${cockpitLiveReadSchema.name}/${cockpitLiveReadSchema.version}`,
    ...historyHeaders(runtimeState),
  },
});

const requestedBy = (request: Request) => {
  const email = request.headers.get("oai-authenticated-user-email");
  const fullName = request.headers.get("oai-authenticated-user-full-name");
  if (fullName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { return decodeURIComponent(fullName); } catch { return email; }
  }
  return email;
};

export async function GET(request: Request) {
  const durableRuntime = await getDurableWorkflowRuntime();
  const url = new URL(request.url);
  const executionId = url.searchParams.get("execution_id");
  const cockpitView = url.searchParams.get("view") === "cockpit";
  const eventStream = url.searchParams.get("transport") === "sse"
    || request.headers.get("accept")?.includes("text/event-stream") === true;
  try {
    if (cockpitView || eventStream) {
      if (!executionId) {
        throw new WorkflowKernelError(
          "INVALID_REQUEST",
          "execution_id is required for the cockpit live read surface.",
        );
      }
      const afterSequence = parseAfterSequence(url, request);
      const snapshot = await durableRuntime.getExecution(executionId);
      if (eventStream) return cockpitEventStream(request, durableRuntime, executionId, afterSequence);
      return cockpitJson(
        projectCockpitLiveRead(snapshot, afterSequence),
        durableRuntime.getBackendState(),
      );
    }
    if (executionId) {
      const snapshot = await durableRuntime.getExecution(executionId);
      return json(snapshot, 200, durableRuntime.getBackendState());
    }
    const backendState = durableRuntime.getBackendState();
    return json({
      live_workflows: durableRuntime.listLiveWorkflows(),
      simulation_transport: "client-only",
      execution_history: backendState,
      persistence: backendState.state === "DURABLE_AVAILABLE" ? "D1_DURABLE" : "PROCESS_LOCAL_DEGRADED",
      cockpit_live_read: {
        schema_name: cockpitLiveReadSchema.name,
        schema_version: cockpitLiveReadSchema.version,
        endpoint: "/api/workflow-executions?view=cockpit&execution_id={execution_id}&after_sequence={sequence}",
        transports: ["json-poll", "sse"],
        execution_authority: "WorkflowExecutionKernel",
        durable_history_authority: "D1 when execution_history.state=DURABLE_AVAILABLE",
        connector_write_authorization: "NONE",
      },
      next_action_contract: "registry-backed",
      capability_discovery_endpoint: "/api/capabilities",
      capability_discovery_contract: "CapabilityDiscoveryEnvelope/1.0",
      capability_materialization_contract: "MaterializedCapability/1.0",
      capability_execution_authority: "NONE",
    }, 200, backendState);
  } catch (error) {
    return handleError(error, durableRuntime.getBackendState());
  }
}

export async function POST(request: Request) {
  const durableRuntime = await getDurableWorkflowRuntime();
  try {
    const body = await request.json() as OperationBody;
    switch (body.action) {
      case "create": {
        if (!body.workflow_id || !body.scope_key || !body.mode) {
          throw new WorkflowKernelError("INVALID_REQUEST", "workflow_id, scope_key, and mode are required.");
        }
        const createRequest: CreateExecutionRequest = {
          workflow_id: body.workflow_id,
          scope_key: body.scope_key,
          requested_by: requestedBy(request),
          mode: body.mode,
          input: body.input ?? {},
        };
        const snapshot = await durableRuntime.createExecution(createRequest);
        return json(snapshot, snapshot.execution.status === "FAILED" ? 409 : 201, durableRuntime.getBackendState());
      }
      case "execute": {
        if (!body.workflow_id || !body.scope_key || !body.mode) {
          throw new WorkflowKernelError("INVALID_REQUEST", "workflow_id, scope_key, and mode are required.");
        }
        const created = await durableRuntime.createExecution({
          workflow_id: body.workflow_id,
          scope_key: body.scope_key,
          requested_by: requestedBy(request),
          mode: body.mode,
          input: body.input ?? {},
        });
        if (created.execution.status === "FAILED") return json(created, 409, durableRuntime.getBackendState());
        return json(await durableRuntime.runToCompletion(created.execution.execution_id), 201, durableRuntime.getBackendState());
      }
      case "start": return json(await durableRuntime.start(requireId(body)), 200, durableRuntime.getBackendState());
      case "advance": return json(await durableRuntime.advance(requireId(body)), 200, durableRuntime.getBackendState());
      case "pause": return json(await durableRuntime.pause(requireId(body)), 200, durableRuntime.getBackendState());
      case "resume": return json(await durableRuntime.resume(requireId(body)), 200, durableRuntime.getBackendState());
      case "cancel": return json(await durableRuntime.cancel(requireId(body)), 200, durableRuntime.getBackendState());
      case "fail": return json(await durableRuntime.fail(requireId(body), {
        code: body.error?.code ?? "MANUAL_FAILURE",
        message: body.error?.message ?? "Execution failed by request.",
      }), 200, durableRuntime.getBackendState());
      case "complete": return json(await durableRuntime.complete(requireId(body), body.output ?? {}), 200, durableRuntime.getBackendState());
      case "select_next_action": {
        if (!body.command) throw new WorkflowKernelError("INVALID_REQUEST", "command is required.");
        return json(await durableRuntime.selectNextAction(requireId(body), body.command), 200, durableRuntime.getBackendState());
      }
      case "approve_next_action": return json(await durableRuntime.approveNextAction(requireId(body)), 200, durableRuntime.getBackendState());
      case "reject_next_action": return json(await durableRuntime.rejectNextAction(requireId(body)), 200, durableRuntime.getBackendState());
      case "spawn_next_action": return json(await durableRuntime.spawnSelectedNextAction(requireId(body), body.input ?? {}), 201, durableRuntime.getBackendState());
      default: throw new WorkflowKernelError("UNKNOWN_OPERATION", "Unknown workflow execution operation.");
    }
  } catch (error) {
    return handleError(error, durableRuntime.getBackendState());
  }
}

const requireId = (body: OperationBody) => {
  if (!body.execution_id) throw new WorkflowKernelError("INVALID_REQUEST", "execution_id is required.");
  return body.execution_id;
};

const parseAfterSequence = (url: URL, request: Request) => {
  const raw = url.searchParams.get("after_sequence") ?? request.headers.get("last-event-id") ?? "0";
  if (!/^\d+$/.test(raw)) {
    throw new WorkflowKernelError("INVALID_REQUEST", "after_sequence must be a non-negative integer.");
  }
  const sequence = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(sequence)) {
    throw new WorkflowKernelError("INVALID_REQUEST", "after_sequence must be a non-negative safe integer.");
  }
  return sequence;
};

const cockpitEventStream = (
  request: Request,
  durableRuntime: DurableWorkflowRuntime,
  executionId: string,
  initialSequence: number,
) => {
  const encoder = new TextEncoder();
  let cursor = initialSequence;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: string) => controller.enqueue(encoder.encode(value));
      write("retry: 1000\n\n");
      const deadline = Date.now() + 25_000;
      try {
        while (!cancelled && !request.signal.aborted) {
          const projection = projectCockpitLiveRead(
            await durableRuntime.getExecution(executionId),
            cursor,
          );
          for (const event of projection.events) {
            cursor += 1;
            write(`id: ${cursor}\ndata: ${JSON.stringify(event)}\n\n`);
          }
          if (projection.cursor.terminal || Date.now() >= deadline) break;
          write(`: heartbeat ${projection.generated_at}\n\n`);
          await new Promise((resolve) => setTimeout(resolve, projection.cursor.poll_after_ms));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() { cancelled = true; },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-aios-event-contract": `${cockpitLiveReadSchema.name}/${cockpitLiveReadSchema.version}`,
      ...historyHeaders(durableRuntime.getBackendState()),
    },
  });
};

const handleError = (
  error: unknown,
  runtimeState?: ReturnType<DurableWorkflowRuntime["getBackendState"]>,
) => {
  if (error instanceof WorkflowKernelError) {
    return json({ error: { code: error.code, message: error.message } }, error.httpStatus, runtimeState);
  }
  return json({ error: { code: "INTERNAL_ERROR", message: "Workflow kernel request failed." } }, 500, runtimeState);
};
