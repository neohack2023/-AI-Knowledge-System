const SESSION_VERSION = 1;
export const AIOS_SESSION_COOKIE = "aios_ai_session";
export const AIOS_SESSION_TTL_SECONDS = 30 * 60;

export type AiSession = {
  version: number;
  sessionId: string;
  apiKey: string;
  model: string;
  keySuffix: string;
  createdAt: number;
  expiresAt: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const fromBase64Url = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function encryptionKey(secret: string) {
  if (secret.trim().length < 32) throw new Error("AIOS_SESSION_SECRET must contain at least 32 characters.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealAiSession(session: AiSession, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(secret),
    encoder.encode(JSON.stringify(session)),
  );
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

export async function openAiSession(value: string | undefined, secret: string, now = Date.now()) {
  if (!value) return null;
  try {
    const [ivValue, ciphertextValue, extra] = value.split(".");
    if (!ivValue || !ciphertextValue || extra) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(ivValue) },
      await encryptionKey(secret),
      fromBase64Url(ciphertextValue),
    );
    const parsed = JSON.parse(decoder.decode(plaintext)) as AiSession;
    if (parsed.version !== SESSION_VERSION || parsed.expiresAt <= now || !parsed.apiKey.startsWith("sk-")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createAiSession(apiKey: string, model: string, now = Date.now()): AiSession {
  return {
    version: SESSION_VERSION,
    sessionId: crypto.randomUUID(),
    apiKey,
    model,
    keySuffix: apiKey.slice(-4),
    createdAt: now,
    expiresAt: now + AIOS_SESSION_TTL_SECONDS * 1000,
  };
}

export function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function sessionCookie(value: string, secure = true) {
  return [
    `${AIOS_SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${AIOS_SESSION_TTL_SECONDS}`,
  ].filter(Boolean).join("; ");
}

export function expiredSessionCookie(secure = true) {
  return [
    `${AIOS_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    "Max-Age=0",
  ].filter(Boolean).join("; ");
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
