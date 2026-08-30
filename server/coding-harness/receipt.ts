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
const isJsonObject = (value: unknown): value is JsonObject => value !== null && typeof value === "object" && !Array.isArray(value);
const repositoryName = /^[^/]+\/[^/]+$/;
const gitSha = /^[0-9a-f]{40}$/i;

const obligationInputFields = new Set(["obligation_id", "description", "required"]);
const codingHarnessReceiptFields = new Set([
  "schema_version",
  "verifier_acceptance_schema",
  "repository",
  "head_sha",
  "base_sha",
  "profile",
  "environment",
  "changed_paths",
  "checks",
  "artifacts",
  "known_regressions_loaded",
  "failed_reason_codes",
  "obligations",
  "verifier_acceptances",
  "terminal_status",
  "receipt_digest",
]);

const validateAllowedFields = (
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  field: string,
  issues: string[],
) => {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push(`${field} contains unknown field ${key}`);
  }
};

const validateRequiredFields = (
  record: Record<string, unknown>,
  required: ReadonlySet<string>,
  field: string,
  issues: string[],
) => {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) issues.push(`${field} missing required field ${key}`);
  }
};

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

const validateJsonObjectList = (value: unknown, field: string, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return;
  }
  value.forEach((entry, index) => {
    if (!isJsonObject(entry)) issues.push(`${field}[${index}] must be an object`);
  });
};

const validateObligations = (value: unknown, issues: string[]): Set<string> => {
  const obligationIds = new Set<string>();
  if (!Array.isArray(value)) {
    issues.push("obligations must be an array");
    return obligationIds;
  }
  if (value.length === 0) {
    issues.push("at least one obligation is required");
    return obligationIds;
  }

  let hasRequired = false;
  value.forEach((entry, index) => {
    if (!isJsonObject(entry)) {
      issues.push(`obligations[${index}] must be an object`);
      return;
    }

    validateAllowedFields(entry, obligationInputFields, `obligations[${index}]`, issues);

    const obligationId = entry.obligation_id;
    if (!nonEmpty(obligationId)) {
      issues.push("obligation_id must be a non-empty string");
    } else {
      const rawId = obligationId as string;
      const normalizedId = rawId.trim();
      if (rawId !== normalizedId) issues.push("obligation_id must not have leading or trailing whitespace");
      if (obligationIds.has(normalizedId)) issues.push(`duplicate obligation ${normalizedId}`);
      obligationIds.add(normalizedId);
    }

    if (!nonEmpty(entry.description)) {
      issues.push(`obligation ${nonEmpty(obligationId) ? (obligationId as string) : "<missing>"} needs a description`);
    }
    if (typeof entry.required !== "boolean") {
      issues.push(`obligation ${nonEmpty(obligationId) ? (obligationId as string) : "<missing>"} required must be boolean`);
    }
    if (entry.required === true) hasRequired = true;
  });

  if (!hasRequired) issues.push("at least one obligation must be required");
  return obligationIds;
};

const validateInput = (input: CodingHarnessReceiptInput): string[] => {
  const issues: string[] = [];
  if (!nonEmpty(input.repository) || !repositoryName.test(input.repository)) issues.push("repository must be owner/repo");
  if (!gitSha.test(input.head_sha)) issues.push("head_sha must be an exact 40-character Git SHA");
  if (input.base_sha !== undefined && input.base_sha !== null && !gitSha.test(input.base_sha)) {
    issues.push("base_sha must be null or an exact 40-character Git SHA");
  }
  if (!codingHarnessProfiles.includes(input.profile)) issues.push(`profile must be one of ${codingHarnessProfiles.join(" | ")}`);

  const obligationIds = validateObligations(input.obligations, issues);

  if (!Array.isArray(input.verifier_acceptances)) {
    issues.push("verifier_acceptances must be an array");
  } else {
    const acceptanceIds = new Set<string>();
    input.verifier_acceptances.forEach((receipt, index) => {
      if (!isJsonObject(receipt)) {
        issues.push(`verifier_acceptances[${index}] must be an object`);
        return;
      }
      const receiptIssues = validateVerifierAcceptanceReceipt(receipt);
      const acceptanceId = nonEmpty(receipt.acceptance_id) ? (receipt.acceptance_id as string) : "<missing>";
      issues.push(...receiptIssues.map((issue) => `acceptance ${acceptanceId}: ${issue}`));
      if (acceptanceId !== "<missing>") {
        if (acceptanceIds.has(acceptanceId)) issues.push(`duplicate acceptance_id ${acceptanceId}`);
        acceptanceIds.add(acceptanceId);
      }
      if (receipt.artifact_or_object_id !== input.repository) {
        issues.push(`acceptance ${acceptanceId}: artifact_or_object_id must equal harness repository`);
      }
      if (receipt.artifact_version_or_head !== input.head_sha) {
        issues.push(`acceptance ${acceptanceId}: artifact_version_or_head must equal harness head_sha`);
      }
      if (!obligationIds.has(receipt.obligation_id as string)) {
        issues.push(`acceptance ${acceptanceId}: obligation ${String(receipt.obligation_id ?? "<missing>")} is not declared by the harness receipt`);
      }
    });
  }

  validateStringList(input.changed_paths ?? [], "changed_paths", issues);
  validateStringList(input.known_regressions_loaded ?? [], "known_regressions_loaded", issues);
  validateStringList(input.failed_reason_codes ?? [], "failed_reason_codes", issues);
  if (input.checks !== undefined) validateJsonObjectList(input.checks, "checks", issues);
  if (input.artifacts !== undefined) validateJsonObjectList(input.artifacts, "artifacts", issues);
  if (input.environment !== undefined && !isJsonObject(input.environment)) issues.push("environment must be an object");
  return issues;
};

const compareCodeUnits = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => compareCodeUnits(left, right))
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
  if (!isJsonObject(input)) {
    throw new CodingHarnessReceiptValidationError(["receipt input must be an object"]);
  }
  const issues = validateInput(input as CodingHarnessReceiptInput);
  if (issues.length > 0) throw new CodingHarnessReceiptValidationError(issues);

  const obligations: CodingHarnessObligation[] = input.obligations.map((obligation) => {
    const resolution = resolveObligationAcceptance(input.verifier_acceptances, input.head_sha, obligation.obligation_id);
    return {
      obligation_id: obligation.obligation_id,
      description: obligation.description,
      required: obligation.required,
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
  if (!isJsonObject(input)) {
    throw new CodingHarnessReceiptValidationError(["execution input must be an object"]);
  }
  if (!Array.isArray(input.verifier_acceptance_inputs)) {
    throw new CodingHarnessReceiptValidationError(["verifier_acceptance_inputs must be an array"]);
  }
  const { verifier_acceptance_inputs, ...harnessInput } = input;
  const verifier_acceptances = verifier_acceptance_inputs.map(createVerifierAcceptanceReceipt);
  return createCodingHarnessReceipt({ ...harnessInput, verifier_acceptances } as CodingHarnessReceiptInput);
};

export const verifyCodingHarnessReceipt = async (receipt: CodingHarnessReceipt): Promise<string[]> => {
  const issues: string[] = [];
  if (!isJsonObject(receipt)) return ["receipt must be an object"];
  validateAllowedFields(receipt, codingHarnessReceiptFields, "receipt", issues);
  validateRequiredFields(receipt, codingHarnessReceiptFields, "receipt", issues);

  const projectedObligations: CodingHarnessObligationInput[] = [];
  if (!Array.isArray(receipt.obligations)) {
    issues.push("receipt obligations must be an array");
  } else {
    receipt.obligations.forEach((obligation, index) => {
      if (!isJsonObject(obligation)) {
        issues.push(`receipt obligations[${index}] must be an object`);
        return;
      }
      projectedObligations.push({
        obligation_id: obligation.obligation_id as string,
        description: obligation.description as string,
        required: obligation.required as boolean,
      });
    });
  }

  issues.push(...validateInput({
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
    obligations: projectedObligations,
    verifier_acceptances: receipt.verifier_acceptances,
  }));

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
    obligations: projectedObligations,
    verifier_acceptances: receipt.verifier_acceptances,
  }).catch(() => null);

  if (!rebuilt) return issues.length > 0 ? issues : ["receipt could not be mechanically rebuilt"];
  if (receipt.schema_version !== rebuilt.schema_version) issues.push("schema_version mismatch");
  if (receipt.verifier_acceptance_schema !== rebuilt.verifier_acceptance_schema) issues.push("verifier_acceptance_schema mismatch");
  if (receipt.terminal_status !== rebuilt.terminal_status) issues.push(`terminal_status must be mechanically derived as ${rebuilt.terminal_status}`);
  if (JSON.stringify(stableValue(receipt.obligations)) !== JSON.stringify(stableValue(rebuilt.obligations))) {
    issues.push("obligation resolutions do not match mechanical recomputation");
  }
  const { receipt_digest, ...providedBody } = receipt;
  if (receipt_digest !== await sha256(providedBody)) issues.push("receipt_digest mismatch");
  return issues;
};