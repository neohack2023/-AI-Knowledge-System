import { verticalSliceRuntime, VerticalSliceError } from "../../../server/vertical-slice/runtime.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const traceId = url.searchParams.get("trace_id");
    if (traceId) return json(verticalSliceRuntime.get(traceId));
    const limit = Number(url.searchParams.get("limit") ?? 25);
    return json({
      schema_name: "AiosVerticalSliceObservability",
      schema_version: "1.0",
      persistence: "PROCESS_LOCAL_EPHEMERAL",
      route: "request -> scope -> capability -> retrieval -> packet -> result -> receipt",
      traces: verticalSliceRuntime.list(Number.isFinite(limit) ? limit : 25),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const trace = await verticalSliceRuntime.execute({
      request_text: typeof body.request_text === "string" ? body.request_text : "",
      requested_scope: typeof body.requested_scope === "string" ? body.requested_scope : "",
    });
    return json(trace, trace.status === "COMPLETED" ? 201 : 409);
  } catch (error) {
    return handleError(error);
  }
}

const handleError = (error: unknown) => {
  if (error instanceof VerticalSliceError) {
    return json({ error: { code: error.code, message: error.message } }, error.httpStatus);
  }
  return json({ error: { code: "AIOS_RUNTIME_INTERNAL_ERROR", message: "Runtime request failed." } }, 500);
};
