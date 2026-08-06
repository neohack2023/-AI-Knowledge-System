export const securityReportEvidenceHygieneCheckIds = [
  "engagement_identity",
  "declared_scope",
  "methodology",
  "stable_finding_ids",
  "impact_and_remediation",
  "per_action_operator_attribution",
  "per_action_utc_timestamps",
  "evidence_hash_manifest",
  "chain_of_custody",
  "public_release_redaction",
  "limitations_and_assumptions",
  "retest_readiness",
  "unsupported_clean_pass_claim",
] as const;

export type SecurityReportEvidenceHygieneCheckId =
  (typeof securityReportEvidenceHygieneCheckIds)[number];

export const securityReportEvidenceHygieneStates = [
  "PASS",
  "PASS_WITH_GAPS",
  "PARTIAL",
  "INCOMPLETE",
  "MISSING",
  "FAIL",
  "CRITICAL_FAIL",
  "NONE",
] as const;

export type SecurityReportEvidenceHygieneState =
  (typeof securityReportEvidenceHygieneStates)[number];

export type SanitizedSecurityReportObservation = {
  check_id: SecurityReportEvidenceHygieneCheckId;
  state: SecurityReportEvidenceHygieneState;
  finding_code: string;
  evidence_pointers: string[];
  observed: string[];
  missing: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type SanitizedSecurityReportDocumentEnvelope = {
  document_id: string;
  provider: string;
  engagement: string;
  media_type: "application/pdf" | "text/plain" | "application/vnd.google-apps.document";
  source_pointer: string;
  source_classification: string;
  sanitized_extract: true;
  extraction_digest: string;
  observations: SanitizedSecurityReportObservation[];
};

export type SecurityReportEvidenceHygieneSimulationInput = {
  schema_name: "SecurityReportEvidenceHygieneSimulationInput";
  schema_version: "1.0";
  execution_id: string;
  mode: "SIMULATION";
  scope_key: "global-working-memory";
  candidate_id: "skill-candidate:validate-security-report-evidence-hygiene:v0.2";
  baseline_id: "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03";
  document: SanitizedSecurityReportDocumentEnvelope;
};

export type SecurityReportEvidenceHygieneObservabilityRecord = {
  check_id: SecurityReportEvidenceHygieneCheckId;
  state: SecurityReportEvidenceHygieneState;
  finding_code: string;
  evidence_pointers: string[];
  observed: string[];
  missing: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source_fact_class: "SANITIZED_SOURCE_OBSERVATION";
};

export type SecurityReportEvidenceHygieneEvent = {
  event_id: string;
  sequence: number;
  event_type: string;
  emitted_at: string;
  data: Record<string, unknown>;
};

export type SecurityReportEvidenceHygieneSimulationOutput = {
  schema_name: "SecurityReportEvidenceHygieneSimulationOutput";
  schema_version: "1.0";
  execution_id: string;
  candidate_id: SecurityReportEvidenceHygieneSimulationInput["candidate_id"];
  baseline_id: SecurityReportEvidenceHygieneSimulationInput["baseline_id"];
  mode: "SIMULATION";
  lifecycle_lane: "EXPERIMENTAL_READ_ONLY";
  handler_id: "handler:security-report-evidence-hygiene:1.0.0";
  handler_version: "1.0.0";
  document_id: string;
  source_classification: string;
  input_digest: string;
  observability_records: SecurityReportEvidenceHygieneObservabilityRecord[];
  events: SecurityReportEvidenceHygieneEvent[];
  scope_isolation: "PASS";
  source_mutation: false;
  external_effects: 0;
  network_accessed: false;
  credential_use: false;
  runtime_binding: "SIMULATION_ONLY";
  result: "REPLAY_COMPLETED";
};

export const securityReportEvidenceHygieneInputSchema = {
  $id: "aios://capabilities/security-report-evidence-hygiene/input/1.0.0",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_name",
    "schema_version",
    "execution_id",
    "mode",
    "scope_key",
    "candidate_id",
    "baseline_id",
    "document",
  ],
  properties: {
    schema_name: { const: "SecurityReportEvidenceHygieneSimulationInput" },
    schema_version: { const: "1.0" },
    execution_id: { type: "string", minLength: 1 },
    mode: { const: "SIMULATION" },
    scope_key: { const: "global-working-memory" },
    candidate_id: { const: "skill-candidate:validate-security-report-evidence-hygiene:v0.2" },
    baseline_id: { const: "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03" },
    document: {
      type: "object",
      additionalProperties: false,
      required: [
        "document_id",
        "provider",
        "engagement",
        "media_type",
        "source_pointer",
        "source_classification",
        "sanitized_extract",
        "extraction_digest",
        "observations",
      ],
      properties: {
        document_id: { type: "string", minLength: 1 },
        provider: { type: "string", minLength: 1 },
        engagement: { type: "string", minLength: 1 },
        media_type: {
          enum: ["application/pdf", "text/plain", "application/vnd.google-apps.document"],
        },
        source_pointer: { type: "string", minLength: 1 },
        source_classification: { type: "string", minLength: 1 },
        sanitized_extract: { const: true },
        extraction_digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
        observations: {
          type: "array",
          minItems: 13,
          maxItems: 13,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "check_id",
              "state",
              "finding_code",
              "evidence_pointers",
              "observed",
              "missing",
              "confidence",
            ],
            properties: {
              check_id: { enum: [...securityReportEvidenceHygieneCheckIds] },
              state: { enum: [...securityReportEvidenceHygieneStates] },
              finding_code: { type: "string", minLength: 1 },
              evidence_pointers: { type: "array", items: { type: "string", minLength: 1 } },
              observed: { type: "array", items: { type: "string", minLength: 1 } },
              missing: { type: "array", items: { type: "string", minLength: 1 } },
              confidence: { enum: ["HIGH", "MEDIUM", "LOW"] },
            },
          },
        },
      },
    },
  },
} as const;

export const securityReportEvidenceHygieneOutputSchema = {
  $id: "aios://capabilities/security-report-evidence-hygiene/output/1.0.0",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_name",
    "schema_version",
    "execution_id",
    "candidate_id",
    "baseline_id",
    "mode",
    "lifecycle_lane",
    "handler_id",
    "handler_version",
    "document_id",
    "source_classification",
    "input_digest",
    "observability_records",
    "events",
    "scope_isolation",
    "source_mutation",
    "external_effects",
    "network_accessed",
    "credential_use",
    "runtime_binding",
    "result",
  ],
  properties: {
    schema_name: { const: "SecurityReportEvidenceHygieneSimulationOutput" },
    schema_version: { const: "1.0" },
    execution_id: { type: "string" },
    candidate_id: { const: "skill-candidate:validate-security-report-evidence-hygiene:v0.2" },
    baseline_id: { const: "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03" },
    mode: { const: "SIMULATION" },
    lifecycle_lane: { const: "EXPERIMENTAL_READ_ONLY" },
    handler_id: { const: "handler:security-report-evidence-hygiene:1.0.0" },
    handler_version: { const: "1.0.0" },
    document_id: { type: "string" },
    source_classification: { type: "string" },
    input_digest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    observability_records: { type: "array", minItems: 13, maxItems: 13 },
    events: { type: "array", minItems: 15 },
    scope_isolation: { const: "PASS" },
    source_mutation: { const: false },
    external_effects: { const: 0 },
    network_accessed: { const: false },
    credential_use: { const: false },
    runtime_binding: { const: "SIMULATION_ONLY" },
    result: { const: "REPLAY_COMPLETED" },
  },
} as const;

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

const sha256 = async (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

const hasUnsafeSecretMaterial = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return [
    /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
    /(?:password|passwd|pwd)\s*[:=]\s*["']?[^<\s][^\s,"'}]{7,}/i,
    /(?:session|xsrf|csrf|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{20,}/i,
  ].some((pattern) => pattern.test(serialized));
};

const validateInput = (input: SecurityReportEvidenceHygieneSimulationInput) => {
  if (input.mode !== "SIMULATION") throw new Error("EXPERIMENTAL_SIMULATION_ONLY");
  if (input.scope_key !== "global-working-memory") throw new Error("SCOPE_NOT_ALLOWED");
  if (input.document.sanitized_extract !== true) throw new Error("SANITIZED_EXTRACT_REQUIRED");
  if (hasUnsafeSecretMaterial(input)) throw new Error("SENSITIVE_INPUT_BLOCKED");

  const seen = new Set<SecurityReportEvidenceHygieneCheckId>();
  for (const observation of input.document.observations) {
    if (!securityReportEvidenceHygieneCheckIds.includes(observation.check_id)) {
      throw new Error(`UNKNOWN_CHECK:${observation.check_id}`);
    }
    if (seen.has(observation.check_id)) throw new Error(`DUPLICATE_CHECK:${observation.check_id}`);
    seen.add(observation.check_id);
  }
  const missing = securityReportEvidenceHygieneCheckIds.filter((checkId) => !seen.has(checkId));
  if (missing.length) throw new Error(`MISSING_CHECKS:${missing.join(",")}`);
};

export const observabilityProjection = (
  output: Pick<SecurityReportEvidenceHygieneSimulationOutput, "observability_records">,
) => Object.fromEntries(
  output.observability_records.map((record) => [record.check_id, {
    state: record.state,
    finding_code: record.finding_code,
  }]),
);

export const runSecurityReportEvidenceHygieneSimulation = async (
  input: SecurityReportEvidenceHygieneSimulationInput,
  now: () => string = () => new Date().toISOString(),
): Promise<SecurityReportEvidenceHygieneSimulationOutput> => {
  validateInput(input);
  const inputDigest = await sha256(input);
  const emittedAt = now();
  let sequence = 0;
  const events: SecurityReportEvidenceHygieneEvent[] = [];
  const emit = (eventType: string, data: Record<string, unknown>) => {
    sequence += 1;
    events.push({
      event_id: `${input.execution_id}:${sequence}`,
      sequence,
      event_type: eventType,
      emitted_at: emittedAt,
      data,
    });
  };

  emit("skill.experimental.execution.started", {
    candidate_id: input.candidate_id,
    lifecycle_lane: "EXPERIMENTAL_READ_ONLY",
    mode: input.mode,
    scope_key: input.scope_key,
  });
  emit("document.read_only.bound", {
    document_id: input.document.document_id,
    media_type: input.document.media_type,
    source_classification: input.document.source_classification,
    sanitized_extract: true,
    network_accessed: false,
  });

  const byCheck = new Map(input.document.observations.map((observation) => [observation.check_id, observation]));
  const records = securityReportEvidenceHygieneCheckIds.map((checkId) => {
    const observation = byCheck.get(checkId)!;
    const record: SecurityReportEvidenceHygieneObservabilityRecord = {
      ...structuredClone(observation),
      source_fact_class: "SANITIZED_SOURCE_OBSERVATION",
    };
    emit("skill.observability.check.completed", {
      check_id: record.check_id,
      state: record.state,
      finding_code: record.finding_code,
      evidence_pointer_count: record.evidence_pointers.length,
      missing_field_count: record.missing.length,
      confidence: record.confidence,
    });
    return record;
  });

  emit("skill.experimental.execution.completed", {
    candidate_id: input.candidate_id,
    result: "REPLAY_COMPLETED",
    checks_emitted: records.length,
    source_mutation: false,
    external_effects: 0,
    network_accessed: false,
    credential_use: false,
  });

  return {
    schema_name: "SecurityReportEvidenceHygieneSimulationOutput",
    schema_version: "1.0",
    execution_id: input.execution_id,
    candidate_id: input.candidate_id,
    baseline_id: input.baseline_id,
    mode: "SIMULATION",
    lifecycle_lane: "EXPERIMENTAL_READ_ONLY",
    handler_id: "handler:security-report-evidence-hygiene:1.0.0",
    handler_version: "1.0.0",
    document_id: input.document.document_id,
    source_classification: input.document.source_classification,
    input_digest: inputDigest,
    observability_records: records,
    events,
    scope_isolation: "PASS",
    source_mutation: false,
    external_effects: 0,
    network_accessed: false,
    credential_use: false,
    runtime_binding: "SIMULATION_ONLY",
    result: "REPLAY_COMPLETED",
  };
};
