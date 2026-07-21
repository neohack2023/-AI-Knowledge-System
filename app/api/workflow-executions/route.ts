import { workflowExecutionKernel, WorkflowKernelError } from "../../../server/workflows/kernel.ts";
import type { CreateExecutionRequest, JsonObject } from "../../../server/workflows/types.ts";
import type { RuntimeMode } from "../../../shared/runtime-mode.ts";

export const runtime = "edge";

type OperationBody = {
  action?: string;
  execution_id?: string;
  workflow_id?: string;
  scope_key?: string;
  mode?: Extract<RuntimeMode, "LIVE" | "SIMULATION">;
  input?: JsonObject;
  output?: JsonObject;
  error?: { code?: string; message?: string };
};

const json = (body: unknown, status = 200) => Response.json(body, { status });

const requestedBy = (request: Request) => {
  const email = request.headers.get("oai-authenticated-user-email");
  const fullName = request.headers.get("oai-authenticated-user-full-name");
  if (fullName && request.headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { return decodeURIComponent(fullName); } catch { return email; }
  }
  return email;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const executionId = url.searchParams.get("execution_id");
  try {
    if (executionId) return json(workflowExecutionKernel.getExecution(executionId));
    return json({ live_workflows: workflowExecutionKernel.listLiveWorkflows(), simulation_transport: "client-only" });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
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
        const snapshot = workflowExecutionKernel.createExecution(createRequest);
        return json(snapshot, snapshot.execution.status === "FAILED" ? 409 : 201);
      }
      case "execute": {
        if (!body.workflow_id || !body.scope_key || !body.mode) {
          throw new WorkflowKernelError("INVALID_REQUEST", "workflow_id, scope_key, and mode are required.");
        }
        const created = workflowExecutionKernel.createExecution({
          workflow_id: body.workflow_id,
          scope_key: body.scope_key,
          requested_by: requestedBy(request),
          mode: body.mode,
          input: body.input ?? {},
        });
        if (created.execution.status === "FAILED") return json(created, 409);
        return json(await workflowExecutionKernel.runToCompletion(created.execution.execution_id), 201);
      }
      case "start": return json(await workflowExecutionKernel.start(requireId(body)));
      case "advance": return json(await workflowExecutionKernel.advance(requireId(body)));
      case "pause": return json(workflowExecutionKernel.pause(requireId(body)));
      case "resume": return json(workflowExecutionKernel.resume(requireId(body)));
      case "cancel": return json(workflowExecutionKernel.cancel(requireId(body)));
      case "fail": return json(workflowExecutionKernel.fail(requireId(body), {
        code: body.error?.code ?? "MANUAL_FAILURE",
        message: body.error?.message ?? "Execution failed by request.",
      }));
      case "complete": return json(workflowExecutionKernel.complete(requireId(body), body.output ?? {}));
      default: throw new WorkflowKernelError("UNKNOWN_OPERATION", "Unknown workflow execution operation.");
    }
  } catch (error) {
    return handleError(error);
  }
}

const requireId = (body: OperationBody) => {
  if (!body.execution_id) throw new WorkflowKernelError("INVALID_REQUEST", "execution_id is required.");
  return body.execution_id;
};

const handleError = (error: unknown) => {
  if (error instanceof WorkflowKernelError) {
    return json({ error: { code: error.code, message: error.message } }, error.httpStatus);
  }
  return json({ error: { code: "INTERNAL_ERROR", message: "Workflow kernel request failed." } }, 500);
};
