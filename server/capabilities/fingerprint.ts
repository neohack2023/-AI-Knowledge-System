const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));

export const sha256Fingerprint = async (value: unknown) => {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
};

export const capabilitySchemaFingerprint = (definition: {
  capability_id: string;
  version: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}) => sha256Fingerprint({
  capability_id: definition.capability_id,
  version: definition.version,
  input_schema: definition.input_schema,
  output_schema: definition.output_schema,
});
