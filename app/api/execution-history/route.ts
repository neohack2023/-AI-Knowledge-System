import { getExecutionHistoryStore } from "../../../server/workflows/durable-runtime-instance.ts";
import { listDurableExecutionHistory } from "../../../server/workflows/execution-history-store.ts";

export const runtime = "edge";

const historyHeaders = (state: { backend: string; state: string; reason_code: string | null }) => ({
  "cache-control": "no-store",
  "x-aios-execution-history": state.state,
  "x-aios-execution-history-backend": state.backend,
  ...(state.reason_code ? { "x-aios-execution-history-reason": state.reason_code } : {}),
});

const json = (body: unknown, status: number, state: { backend: string; state: string; reason_code: string | null }) =>
  Response.json(body, { status, headers: historyHeaders(state) });

export async function GET(request: Request) {
  const store = await getExecutionHistoryStore();
  const state = store.getBackendState();
  const url = new URL(request.url);
  const scopeKey = url.searchParams.get("scope_key")?.trim() || "global-working-memory";
  const capabilityId = url.searchParams.get("capability_id")?.trim() || undefined;
  const modeRaw = url.searchParams.get("mode")?.trim() || undefined;
  const limitRaw = url.searchParams.get("limit")?.trim() || "25";

  if (modeRaw !== undefined && modeRaw !== "LIVE" && modeRaw !== "SIMULATION") {
    return json({ error: { code: "INVALID_HISTORY_MODE", message: "mode must be LIVE or SIMULATION." } }, 400, state);
  }

  if (!/^\d+$/.test(limitRaw)) {
    return json({ error: { code: "INVALID_HISTORY_LIMIT", message: "limit must be an integer from 1 through 200." } }, 400, state);
  }
  const limit = Number.parseInt(limitRaw, 10);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    return json({ error: { code: "INVALID_HISTORY_LIMIT", message: "limit must be an integer from 1 through 200." } }, 400, state);
  }

  if (state.state !== "DURABLE_AVAILABLE") {
    return json({
      execution_history: state,
      persistence: "PROCESS_LOCAL_DEGRADED",
      scope_key: scopeKey,
      executions: [],
      boundary: "Durable history listing is unavailable until the Sites D1 binding is live and healthy.",
    }, 503, state);
  }

  try {
    const executions = await listDurableExecutionHistory(store, {
      scope_key: scopeKey,
      ...(capabilityId ? { capability_id: capabilityId } : {}),
      ...(modeRaw ? { mode: modeRaw } : {}),
      limit,
    });
    const latestState = store.getBackendState();
    return json({
      execution_history: latestState,
      persistence: "D1_DURABLE",
      scope_key: scopeKey,
      executions,
    }, 200, latestState);
  } catch (error) {
    const latestState = store.getBackendState();
    return json({
      execution_history: latestState,
      persistence: "PROCESS_LOCAL_DEGRADED",
      scope_key: scopeKey,
      executions: [],
      error: {
        code: "DURABLE_HISTORY_LIST_FAILED",
        message: error instanceof Error ? error.message : "Durable execution history list failed.",
      },
    }, 503, latestState);
  }
}
