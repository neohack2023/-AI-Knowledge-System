import { askOpenAi, isAiosModel } from "../../../../server/llm/openai.ts";
import { AIOS_SESSION_COOKIE, openAiSession, readCookie, sameOrigin } from "../../../../server/llm/session.ts";
import { admitChatRequest } from "../../../../server/llm/rate-limit.ts";

const noStore = { "cache-control": "no-store" };
const allowedScopes = new Set(["global-working-memory", "udio-algorithms", "girls-of-gaming", "github:neohack2023/Looper"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "ORIGIN_REJECTED" }, { status: 403, headers: noStore });
  const secret = process.env.AIOS_SESSION_SECRET?.trim() ?? "";
  const session = await openAiSession(readCookie(request, AIOS_SESSION_COOKIE), secret);
  if (!session || !isAiosModel(session.model)) return Response.json({ error: "AI_CONNECTION_REQUIRED" }, { status: 401, headers: noStore });
  const admission = admitChatRequest(session.sessionId);
  if (!admission.admitted) return Response.json(
    { error: "AIOS_SESSION_RATE_LIMITED" },
    { status: 429, headers: { ...noStore, "retry-after": String(admission.retryAfterSeconds) } },
  );
  let body: { scope_key?: unknown; messages?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  const scopeKey = typeof body.scope_key === "string" && allowedScopes.has(body.scope_key) ? body.scope_key : "global-working-memory";
  const messages = Array.isArray(body.messages) ? body.messages.slice(-8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const role = "role" in item && (item.role === "user" || item.role === "assistant") ? item.role : null;
    const content = "content" in item && typeof item.content === "string" ? item.content.trim().slice(0, 4_000) : "";
    return role && content ? [{ role, content }] : [];
  }) : [];
  if (!messages.length || messages.at(-1)?.role !== "user" || messages.reduce((sum, message) => sum + message.content.length, 0) > 12_000) {
    return Response.json({ error: "INVALID_CHAT_INPUT" }, { status: 400, headers: noStore });
  }
  try {
    const result = await askOpenAi({ apiKey: session.apiKey, model: session.model, messages, scopeKey });
    return Response.json({
      message: result.text,
      response_id: result.responseId,
      model: session.model,
      usage: result.usage,
      authority_state: "READ_ONLY",
      write_authorization: "NONE",
      scope_key: scopeKey,
      sources: ["AIOS policy envelope", "Repository-defined scope registry snapshot"],
      connector_access: { notion: false, google_drive: false, github_live: false },
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OPENAI_REQUEST_FAILED";
    const status = code === "OPENAI_401" ? 401 : code === "OPENAI_429" ? 429 : 502;
    return Response.json({ error: status === 401 ? "OPENAI_AUTH_FAILED" : status === 429 ? "OPENAI_RATE_LIMITED" : "OPENAI_REQUEST_FAILED" }, { status, headers: noStore });
  }
}
