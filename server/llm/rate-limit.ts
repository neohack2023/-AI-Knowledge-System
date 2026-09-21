const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const windows = new Map<string, { startedAt: number; count: number }>();

export function admitChatRequest(sessionId: string, now = Date.now()) {
  const existing = windows.get(sessionId);
  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    windows.set(sessionId, { startedAt: now, count: 1 });
    return { admitted: true, retryAfterSeconds: 0 };
  }
  if (existing.count >= MAX_REQUESTS_PER_WINDOW) {
    return { admitted: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - existing.startedAt)) / 1000)) };
  }
  existing.count += 1;
  return { admitted: true, retryAfterSeconds: 0 };
}

export function forgetChatSession(sessionId: string) {
  windows.delete(sessionId);
}
