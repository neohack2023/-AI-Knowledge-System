import assert from "node:assert/strict";
import test from "node:test";
import {
  AIOS_SESSION_COOKIE, createAiSession, expiredSessionCookie, openAiSession,
  readCookie, sameOrigin, sealAiSession, sessionCookie,
} from "../server/llm/session.ts";
import { admitChatRequest, forgetChatSession } from "../server/llm/rate-limit.ts";

const secret = "synthetic-test-secret-with-more-than-thirty-two-characters";
const apiKey = `sk-test-${"A".repeat(40)}`;

test("AI session is encrypted, bounded, and recoverable only with the server secret", async () => {
  const now = Date.parse("2026-08-11T20:00:00Z");
  const session = createAiSession(apiKey, "gpt-5.6-luna", now);
  const sealed = await sealAiSession(session, secret);
  assert.ok(!sealed.includes(apiKey));
  assert.equal(await openAiSession(sealed, "wrong-secret-that-is-still-long-enough-12345", now), null);
  assert.equal((await openAiSession(sealed, secret, now))?.apiKey, apiKey);
  assert.equal(await openAiSession(sealed, secret, session.expiresAt), null);
});

test("session cookie is HttpOnly, strict, expiring, and parseable without exposing raw key", async () => {
  const sealed = await sealAiSession(createAiSession(apiKey, "gpt-5.6-luna"), secret);
  const header = sessionCookie(sealed, true);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Secure/);
  assert.ok(!header.includes(apiKey));
  const request = new Request("https://example.test/api/ai-connection", { headers: { cookie: header } });
  assert.equal(readCookie(request, AIOS_SESSION_COOKIE), sealed);
  assert.match(expiredSessionCookie(true), /Max-Age=0/);
});

test("cross-origin mutations are rejected", () => {
  assert.equal(sameOrigin(new Request("https://example.test/api/llm/chat", { headers: { origin: "https://example.test" } })), true);
  assert.equal(sameOrigin(new Request("https://example.test/api/llm/chat", { headers: { origin: "https://attacker.invalid" } })), false);
});

test("session request guard bounds bursts and can be destroyed on disconnect", () => {
  const sessionId = "session-rate-test";
  for (let index = 0; index < 8; index += 1) assert.equal(admitChatRequest(sessionId, 1_000).admitted, true);
  assert.equal(admitChatRequest(sessionId, 1_000).admitted, false);
  forgetChatSession(sessionId);
  assert.equal(admitChatRequest(sessionId, 1_000).admitted, true);
  forgetChatSession(sessionId);
});
