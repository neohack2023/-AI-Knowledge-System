import {
  habitusAdaptiveRetrievalInputSchema,
  habitusAdaptiveRetrievalOutputSchema,
} from "./habitus-adaptive-retrieval.ts";
import {
  securityReportEvidenceHygieneInputSchema,
  securityReportEvidenceHygieneOutputSchema,
} from "./security-report-evidence-hygiene.ts";

export type ExperimentalReadOnlyRegistryEntry = {
  schema_name: "ExperimentalReadOnlyRegistryEntry";
  schema_version: "1.0";
  capability_id: string;
  candidate_id: string;
  name: string;
  description: string;
  lifecycle_status: "EXPERIMENTAL";
  read_write_mode: "READ_ONLY";
  execution_modes: readonly ["SIMULATION"];
  scope_allowlist: readonly string[];
  media_types: readonly string[];
  handler_ref: string;
  input_schema_ref: string;
  output_schema_ref: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  autonomy_band: "A0";
  reversibility: "FULLY_REVERSIBLE";
  blast_radius: "PROCESS_LOCAL";
  network_access: "NONE";
  external_effects: "NONE";
  runtime_binding_status: "BOUND_SIMULATION_ONLY";
  validation_refs: readonly string[];
  source_authority: "GITHUB_EXECUTION_TRUTH";
};

export const securityReportEvidenceHygieneExperimentalEntry: ExperimentalReadOnlyRegistryEntry = {
  schema_name: "ExperimentalReadOnlyRegistryEntry",
  schema_version: "1.0",
  capability_id: "cap:security-report-evidence-hygiene",
  candidate_id: "skill-candidate:validate-security-report-evidence-hygiene:v0.2",
  name: "Validate Security Report Evidence Hygiene",
  description: "Validates sanitized PDF or document extraction envelopes and emits deterministic evidence-hygiene observability records without network access, credential use, source mutation, or external effects.",
  lifecycle_status: "EXPERIMENTAL",
  read_write_mode: "READ_ONLY",
  execution_modes: ["SIMULATION"],
  scope_allowlist: ["global-working-memory"],
  media_types: ["application/pdf", "text/plain", "application/vnd.google-apps.document"],
  handler_ref: "api:/api/experimental/security-report-evidence-hygiene#simulate",
  input_schema_ref: "aios://capabilities/security-report-evidence-hygiene/input/1.0.0",
  output_schema_ref: "aios://capabilities/security-report-evidence-hygiene/output/1.0.0",
  input_schema: securityReportEvidenceHygieneInputSchema,
  output_schema: securityReportEvidenceHygieneOutputSchema,
  autonomy_band: "A0",
  reversibility: "FULLY_REVERSIBLE",
  blast_radius: "PROCESS_LOCAL",
  network_access: "NONE",
  external_effects: "NONE",
  runtime_binding_status: "BOUND_SIMULATION_ONLY",
  validation_refs: [
    "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-01",
    "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-02",
    "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-03",
    "SFVAL-20260806-SEC-REPORT-EVIDENCE-HYGIENE-04",
  ],
  source_authority: "GITHUB_EXECUTION_TRUTH",
};

export const habitusAdaptiveRetrievalExperimentalEntry: ExperimentalReadOnlyRegistryEntry = {
  schema_name: "ExperimentalReadOnlyRegistryEntry",
  schema_version: "1.0",
  capability_id: "cap:habitus-adaptive-retrieval-benchmark",
  candidate_id: "EXP-HABITUS-001A",
  name: "Habitus Adaptive Retrieval Benchmark",
  description: "Runs the frozen five-arm EXP-HABITUS-001A retrieval benchmark behind exact-scope, graph-non-authority, and authority-admission gates with no network access or external effects.",
  lifecycle_status: "EXPERIMENTAL",
  read_write_mode: "READ_ONLY",
  execution_modes: ["SIMULATION"],
  scope_allowlist: ["global-working-memory"],
  media_types: ["application/json"],
  handler_ref: "module:server/capabilities/experimental/habitus-adaptive-retrieval-fixture#runExpHabitus001aSimulation",
  input_schema_ref: "aios://capabilities/habitus-adaptive-retrieval/input/1.0.0",
  output_schema_ref: "aios://capabilities/habitus-adaptive-retrieval/output/1.0.0",
  input_schema: habitusAdaptiveRetrievalInputSchema,
  output_schema: habitusAdaptiveRetrievalOutputSchema,
  autonomy_band: "A0",
  reversibility: "FULLY_REVERSIBLE",
  blast_radius: "PROCESS_LOCAL",
  network_access: "NONE",
  external_effects: "NONE",
  runtime_binding_status: "BOUND_SIMULATION_ONLY",
  validation_refs: [
    "STONE-20260829-GLOBAL-HABITUS-001",
    "EXP-HABITUS-001A-FIXTURE-V1",
    "MASON-EPISODE-20260829-GLOBAL-070",
  ],
  source_authority: "GITHUB_EXECUTION_TRUTH",
};

export const experimentalReadOnlyCapabilityRegistry = [
  securityReportEvidenceHygieneExperimentalEntry,
] as const;

// Keep benchmark-only experiments out of the ordinary experimental capability
// list until promotion. They remain discoverable through the combined catalog.
export const experimentalReadOnlyBenchmarkRegistry = [
  habitusAdaptiveRetrievalExperimentalEntry,
] as const;

export const experimentalReadOnlyCapabilityCatalog = [
  ...experimentalReadOnlyCapabilityRegistry,
  ...experimentalReadOnlyBenchmarkRegistry,
] as const;

export const getExperimentalReadOnlyCapability = (capabilityId: string) =>
  experimentalReadOnlyCapabilityCatalog.find((entry) => entry.capability_id === capabilityId) ?? null;
