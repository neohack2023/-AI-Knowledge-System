import {
  createVerifierAcceptanceReceipt,
  resolveObligationAcceptance,
  validateVerifierAcceptanceReceipt,
  type ObligationResolutionState,
  type VerifierAcceptanceInput,
  type VerifierAcceptanceReceipt,
} from "./verifier-acceptance.ts";

export const codingHarnessProfiles = ["FAST", "PR", "FULL", "NIGHTLY"] as const;
export const codingHarnessTerminalStatuses = ["PASS", "FAIL", "PARTIAL", "FLAKY", "BLOCKED"] as const;

export type CodingHarnessProfile = (typeof codingHarnessProfiles)[number];
export type CodingHarnessTerminalStatus = (typeof codingHarnessTerminalStatuses)[number];
export type JsonObject = Record<string, unknown>;

export type CodingHarnessObligationInput = {
  obligation_id: string;
  description: string;
  required: boolean;
};

export type CodingHarnessObligation = CodingHarnessObligationInput & {
  state: ObligationResolutionState;
  acceptance_ids: string[];
  advisory_acceptance_ids: string[];
  reason_codes: string[];
};

export type CodingHarnessReceiptInput = {
  repository: string;
  head_sha: string;
  base_sha?: string | null;
  profile: CodingHarnessProfile;
  environment?: JsonObject;
  changed_paths?: string[];
  checks?: JsonObject[];
  artifacts?: JsonObject[];
  known_regressions_loaded?: string[];
  failed_reason_codes?: string[];
  obligations: CodingHarnessObligationInput[];
  verifier_acceptances: VerifierAcceptanceReceipt[];
};

export type CodingHarnessExecutionInput = Omit<CodingHarnessReceiptInput, "verifier_acceptances"> & {
  verifier_acceptance_inputs: VerifierAcceptanceInput[];
};

export type CodingHarnessReceipt = {
  schema_version: "aios-coding-harness/v0.1";
  verifier_acceptance_schema: "aios_verifier_acceptance_v0_1";
  repository: string;
  head_sha: string;
  base_sha: string | null;
  profile: CodingHarnessProfile;
  environment: JsonObject;
  changed_paths: string[];
  checks: JsonObject[];
  artifacts: JsonObject[];
  known_regressions_loaded: string[];
  failed_reason_codes: string[];
  obligations: CodingHarnessObligation[];
  verifier_acceptances: VerifierAcceptanceReceipt[];
  terminal_status: CodingHarnessTerminalStatus;
  receipt_digest: string;
};

export class CodingHarnessReceiptValidationError extends Error {
  readonly code = "CODING_HARNESS_RECEIPT_INVALID";
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`CodingHarness receipt input is invalid: ${issues.join("; ")}`);
    this.name = "CodingHarnessReceiptValidationError";
    this.issues = issues;
  }
}

const nonEmpty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const repositoryName = /^[^/]+\/[^/]+$/;
const gitSha = /^[0-9a-f]{40}$/i;

const validateStringList = (value: unknown, field: string, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return;
  }
  const seen = new Set<string>();
  for (const entry of value) {
    if (!nonEmpty(entry)) {
      issues.push(`${field} must contain non-empty strings`);
      continue;
    }
    const normalized = (entry as string).trim();
    if (seen.has(normalized)) issues.push(`${field} contains duplicate ${normalized}`);
    seen.add(normalized);
  }
};

const validateInput = (input: CodingHarnessReceiptInput): string[] => {
  const issues: string[] = [];
  if (!nonEmpty(input.repository) || !repositoryName.test(input.repository)) issues.push("repository must be owner/repo");
  if (!gitSha.test(input.head_sha)) issues.push("head_sha must be an exact 40-character Git SHA");
  if (input.base_sha !== undefined && input.base_sha !== null && !gitSha.test(input.base_sha)) {
    issues.push("base_sha must be null or an exact 40-character Git SHA");
  }
  if (!codingHarnessProfiles.includes(input.profile)) issues.push(`profile must be one of ${codingHarnessProfiles.join(" | ")}`);
  if (!Array.isArray(input.obligations) || input.obligations.length === 0) issues.push("at least one obligation is required");
  if (Array.isArray(input.obligations) && !input.obligations.some((obligation) => obligation.required)) {
    issues.push("at least one obligation must be required");
  }
  const obligationIds = new Set<string>();
  for (const obligation of input.obligations ?? []) {
    if (!nonEmpty(obligation.obligation_id)) issues.push("obligation_id must be a non-empty string");
    if (!nonEmpty(obligation.description)) issues.push(`obligation ${obligation.obligation_id || "<missing>"} needs a description`);
    if (typeof obligation.required !== "boolean") issues.push(`obligation ${obligation.obligation_id || "<missing>"} required must be boolean`);
    if (obligationIds.has(obligation.obligation_id)) issues.push(`duplicate obligation ${obligation.obligation_id}`);
    obligationIds.add(obligation.obligation_id);
  }

  if (!Array.isArray(input.verifier_acceptances)) issues.push("verifier_acceptances must be an array");
  const acceptanceIds = new Set<string>();
  for (const receipt of input.verifier_acceptances ?? []) {
    const receiptIssues = validateVerifierAcceptanceReceipt(receipt);
    issues.push(...receiptIssues.map((issue) => `acceptance ${receipt.acceptance_id || "<missing>"}: ${issue}`));
    if (acceptanceIds.has(receipt.acceptance_id)) issues.push(`duplicate acceptance_id ${receipt.acceptance_id}`);
    acceptanceIds.add(receipt.acceptance_id);
    if (receipt.artifact_or_object_id !== input.repository) {
      issues.push(`acceptance ${receipt.acceptance_id}: artifact_or_object_id must equal harness repository`);
    }
    if (receipt.artifact_version_or_head !== input.head_sha) {
      issues.push(`acceptance ${receipt.acceptance_id}: artifact_version_or_head must equal harness head_sha`);
    }
    if (!obligationIds.has(receipt.obligation_id)) {
      issues.push(`acceptance ${receipt.acceptance_id}: obligation ${receipt.obligation_id} is not declared by the harness receipt`);
    }
  }

  validateStringList(input.changed_paths ?? [], "changed_paths", issues);
  validateStringList(input.known_regressions_loaded ?? [], "known_regressions_loaded", issues);
  validateStringList(input.failed_reason_codes ?? [], "failed_reason_codes", issues);
  if (input.checks !== undefined && !Array.isArray(input.checks)) issues.push("checks must be an array");
  if (input.artifacts !== undefined && !Array.isArray(input.artifacts)) issues.push("artifacts must be an array");
  if (input.environment !== undefined && (input.environment === null || typeof input.environment !== "object" || Array.isArray(input.environment))) {
    issues.push("environment must be an object");
  }
  return issues;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

const sha256 = async (value: unknown) => {
  const encoded = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

const terminalStatusFor = (obligations: readonly CodingHarnessObligation[], checks: readonly JsonObject[]): CodingHarnessTerminalStatus => {
  const required = obligations.filter((obligation) => obligation.required);
  if (required.some((obligation) => obligation.state === "REJECTED")) return "FAIL";
  if (required.some((obligation) => obligation.state === "BLOCKED")) return "BLOCKED";
  if (required.some((obligation) => obligation.state !== "ACCEPTED")) return "PARTIAL";
  const hasFlakyCheck = checks.some((check) => check.status === "FLAKY");
  return hasFlakyCheck ? "FLAKY" : "PASS";
};

export const createCodingHarnessReceipt = async (input: CodingHarnessReceiptInput): Promise<CodingHarnessReceipt> => {
  const issues = validateInput(input);
  if (issues.length > 0) throw new CodingHarnessReceiptValidationError(issues);

  const obligations: CodingHarnessObligation[] = input.obligations.map((obligation) => {
    const resolution = resolveObligationAcceptance(input.verifier_acceptances, input.head_sha, obligation.obligation_id);
    return {
      ...obligation,
      state: resolution.state,
      acceptance_ids: resolution.decisive_acceptance_ids,
      advisory_acceptance_ids: resolution.advisory_acceptance_ids,
      reason_codes: resolution.reason_codes,
    };
  });

  const body = {
    schema_version: "aios-coding-harness/v0.1" as const,
    verifier_acceptance_schema: "aios_verifier_acceptance_v0_1" as const,
    repository: input.repository,
    head_sha: input.head_sha,
    base_sha: input.base_sha ?? null,
    profile: input.profile,
    environment: input.environment ?? {},
    changed_paths: [...(input.changed_paths ?? [])],
    checks: [...(input.checks ?? [])],
    artifacts: [...(input.artifacts ?? [])],
    known_regressions_loaded: [...(input.known_regressions_loaded ?? [])],
    failed_reason_codes: [...(input.failed_reason_codes ?? [])],
    obligations,
    verifier_acceptances: input.verifier_acceptances.map((receipt) => ({ ...receipt })),
    terminal_status: terminalStatusFor(obligations, input.checks ?? []),
  };

  return {
    ...body,
    receipt_digest: await sha256(body),
  };
};

export const createCodingHarnessExecutionReceipt = async (
  input: CodingHarnessExecutionInput,
): Promise<CodingHarnessReceipt> => {
  const { verifier_acceptance_inputs, ...harnessInput } = input;
  const verifier_acceptances = verifier_acceptance_inputs.map(createVerifierAcceptanceReceipt);
  return createCodingHarnessReceipt({ ...harnessInput, verifier_acceptances });
};

export const verifyCodingHarnessReceipt = async (receipt: CodingHarnessReceipt): Promise<string[]> => {
  const issues = validateInput({
    repository: receipt.repository,
    head_sha: receipt.head_sha,
    base_sha: receipt.base_sha,
    profile: receipt.profile,
    environment: receipt.environment,
    changed_paths: receipt.changed_paths,
    checks: receipt.checks,
    artifacts: receipt.artifacts,
    known_regressions_loaded: receipt.known_regressions_loaded,
    failed_reason_codes: receipt.failed_reason_codes,
    obligations: receipt.obligations.map(({ obligation_id, description, required }) => ({ obligation_id, description, required })),
    verifier_acceptances: receipt.verifier_acceptances,
  });

  const rebuilt = await createCodingHarnessReceipt({
    repository: receipt.repository,
    head_sha: receipt.head_sha,
    base_sha: receipt.base_sha,
    profile: receipt.profile,
    environment: receipt.environment,
    changed_paths: receipt.changed_paths,
    checks: receipt.checks,
    artifacts: receipt.artifacts,
    known_regressions_loaded: receipt.known_regressions_loaded,
    failed_reason_codes: receipt.failed_reason_codes,
    obligations: receipt.obligations.map(({ obligation_id, description, required }) => ({ obligation_id, description, required })),
    verifier_acceptances: receipt.verifier_acceptances,
  }).catch(() => null);

  if (!rebuilt) return issues.length > 0 ? issues : ["receipt could not be mechanically rebuilt"];
  if (receipt.schema_version !== rebuilt.schema_version) issues.push("schema_version mismatch");
  if (receipt.verifier_acceptance_schema !== rebuilt.verifier_acceptance_schema) issues.push("verifier_acceptance_schema mismatch");
  if (receipt.terminal_status !== rebuilt.terminal_status) issues.push(`terminal_status must be mechanically derived as ${rebuilt.terminal_status}`);
  if (JSON.stringify(receipt.obligations) !== JSON.stringify(rebuilt.obligations)) issues.push("obligation resolutions do not match mechanical recomputation");
  const { receipt_digest, ...providedBody } = receipt;
  if (receipt_digest !== await sha256(providedBody)) issues.push("receipt_digest mismatch");
  return issues;
};
