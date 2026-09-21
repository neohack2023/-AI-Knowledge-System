export const AIOS_MODELS = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
export type AiosModel = typeof AIOS_MODELS[number];

export const isAiosModel = (value: unknown): value is AiosModel =>
  typeof value === "string" && AIOS_MODELS.includes(value as AiosModel);

const timeoutSignal = (milliseconds: number) => AbortSignal.timeout(milliseconds);

export async function validateOpenAiKey(apiKey: string, model: AiosModel) {
  const response = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: timeoutSignal(8_000),
  });
  return response.ok;
}

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function askOpenAi({
  apiKey, model, messages, scopeKey,
}: {
  apiKey: string;
  model: AiosModel;
  messages: ChatMessage[];
  scopeKey: string;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1200,
      instructions: [
        "You are Ask AIOS, the read-only operator assistant inside AI Knowledge System.",
        `Resolved scope: ${scopeKey}.`,
        "Authority state: GitHub owns implementation truth; Notion and Drive have not been accessed by this chat request.",
        "Do not claim connector retrieval, durable writes, approvals, or execution that did not occur.",
        "Answer clearly, identify assumptions, and keep write_authorization=NONE.",
      ].join("\n"),
      input: messages.map((message) => ({ role: message.role, content: message.content })),
    }),
    signal: timeoutSignal(35_000),
  });
  if (!response.ok) throw new Error(`OPENAI_${response.status}`);
  const payload = await response.json() as {
    id?: string;
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };
  const text = payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");
  return { responseId: payload.id ?? crypto.randomUUID(), text, usage: payload.usage ?? null };
}
