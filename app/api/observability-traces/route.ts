import { cognitionTraceStore } from "../../../server/observability/trace-store.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const traceId = url.searchParams.get("trace_id");
  const executionId = url.searchParams.get("execution_id");

  if (traceId && executionId) {
    return json({ error: { code: "INVALID_REQUEST", message: "Provide trace_id or execution_id, not both." } }, 400);
  }

  const trace = traceId
    ? cognitionTraceStore.getTrace(traceId)
    : executionId
      ? cognitionTraceStore.getTraceByExecution(executionId)
      : cognitionTraceStore.getLatestTrace();

  return json({
    trace,
    observability: {
      read_only: true,
      persistence: "PROCESS_LOCAL",
      source_read_and_authority_are_distinct: true,
      missing_observations_are_reported_as_unobserved_not_inferred: true,
    },
  });
}
