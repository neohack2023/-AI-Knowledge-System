import { AIOS_MODELS, isAiosModel, validateOpenAiKey } from "../../../server/llm/openai.ts";
import {
  AIOS_SESSION_COOKIE, createAiSession, expiredSessionCookie, openAiSession, readCookie,
  sameOrigin, sealAiSession, sessionCookie,
} from "../../../server/llm/session.ts";
import { forgetChatSession } from "../../../server/llm/rate-limit.ts";

const noStore = { "cache-control": "no-store" };
const secret = () => process.env.AIOS_SESSION_SECRET?.trim() ?? "";
const secureCookie = (request: Request) => new URL(request.url).protocol === "https:";

export async function GET(request: Request) {
  const session = await openAiSession(readCookie(request, AIOS_SESSION_COOKIE), secret());
  return Response.json({
    connected: Boolean(session),
    model: session?.model ?? AIOS_MODELS[0],
    key_suffix: session?.keySuffix ?? null,
    expires_at: session ? new Date(session.expiresAt).toISOString() : null,
    credential_mode: "SESSION_ONLY",
  }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "ORIGIN_REJECTED" }, { status: 403, headers: noStore });
  if (!secret()) return Response.json({ error: "SESSION_SERVICE_UNAVAILABLE" }, { status: 503, headers: noStore });
  let body: { api_key?: unknown; model?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "INVALID_JSON" }, { status: 400, headers: noStore }); }
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  const model = isAiosModel(body.model) ? body.model : AIOS_MODELS[0];
  if (!apiKey.startsWith("sk-") || apiKey.length < 24 || apiKey.length > 512) {
    return Response.json({ error: "INVALID_API_KEY" }, { status: 400, headers: noStore });
  }
  try {
    if (!await validateOpenAiKey(apiKey, model)) {
      return Response.json({ error: "OPENAI_AUTH_FAILED" }, { status: 401, headers: noStore });
    }
    const session = createAiSession(apiKey, model);
    const sealed = await sealAiSession(session, secret());
    const response = Response.json({
      connected: true, model, key_suffix: session.keySuffix,
      expires_at: new Date(session.expiresAt).toISOString(), credential_mode: "SESSION_ONLY",
    }, { headers: noStore });
    response.headers.set("set-cookie", sessionCookie(sealed, secureCookie(request)));
    return response;
  } catch {
    return Response.json({ error: "OPENAI_CONNECTION_UNAVAILABLE" }, { status: 502, headers: noStore });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "ORIGIN_REJECTED" }, { status: 403, headers: noStore });
  const session = await openAiSession(readCookie(request, AIOS_SESSION_COOKIE), secret());
  if (session) forgetChatSession(session.sessionId);
  const response = Response.json({ connected: false, credential_mode: "SESSION_ONLY" }, { headers: noStore });
  response.headers.set("set-cookie", expiredSessionCookie(secureCookie(request)));
  return response;
}
