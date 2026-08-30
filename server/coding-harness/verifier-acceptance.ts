export const verifierAuthorityClasses = [
  "HARD_KERNEL",
  "DETERMINISTIC_TASK_NATIVE",
  "EXACT_COMPARATOR",
  "EXECUTABLE_SCOPED",
  "HUMAN_GOVERNED",
  "MODEL_ADVISORY",
] as const;

export const verifierFreshnessStates = ["CURRENT", "STALE", "UNKNOWN"] as const;
export const verifierCoverageStates = ["COMPLETE_FOR_OBLIGATION", "PARTIAL", "UNKNOWN"] as const;
export const verifierResults = ["PASS", "FAIL", "PARTIAL", "BLOCKED", "UNKNOWN"] as const;
export const terminalAcceptanceEffects = ["ACCEPT", "REJECT", "NO_TERMINAL_EFFECT", "ESCALATE"] as const;

export type VerifierAuthorityClass = (typeof verifierAuthorityClasses)[number];
export type VerifierFreshnessState = (typeof verifierFreshnessStates)[number];
export type VerifierCoverageState = (typeof verifierCoverageStates)[number];
export type VerifierResult = (typeof verifierResults)[number];
export type TerminalAcceptanceEffect = (typeof terminalAcceptanceEffects)[number];

export type VerifierAcceptanceInput = {
  acceptance_id: string;
  scope_key: string;
  task_id: string;
  artifact_or_object_id: string;
  artifact_version_or_head: string;
  artifact_digest: string;
  obligation_id: string;
  obligation_description: string;
  verifier_id: string;
  verifier_version: string;
  verifier_authority_class: VerifierAuthorityClass;
  verifier_input_digest: string;
  verifier_freshness_state: VerifierFreshnessState;
  coverage_state: VerifierCoverageState;
  result: VerifierResult;
  higher_priority_verifier_ids?: string[];
  lower_priority_evidence_ids?: string[];
  retry_allowed: boolean;
  repair_feedback_pointer?: string | null;
  receipt_pointer?: string | null;
};

export type VerifierAcceptanceReceipt = VerifierAcceptanceInput & {
  schema: "aios_verifier_acceptance_v0_1";
  terminal_acceptance_effect: TerminalAcceptanceEffect;
  higher_priority_verifier_ids: string[];
  lower_priority_evidence_ids: string[];
  repair_feedback_pointer: string | null;
  receipt_pointer: string | null;
};

export type ObligationResolutionState = "ACCEPTED" | "REJECTED" | "PARTIAL" | "BLOCKED" | "OPEN";

export type ObligationResolution = {
  obligation_id: string;
  artifact_version_or_head: string;
  state: ObligationResolutionState;
  decisive_acceptance_ids: string[];
  advisory_acceptance_ids: string[];
  reason_codes: string[];
};

export class VerifierAcceptanceValidationError extends Error {
  readonly code = "VERIFIER_ACCEPTANCE_INVALID";
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Verifier acceptance input is invalid: ${issues.join("; ")}`);
    this.name = "VerifierAcceptanceValidationError";
    this.issues = issues;
  }
}

const asNonEmptyString = (value: unknown) => typeof value === "string" && value.trim().length > 0;
const oneOf = <T extends readonly string[]>(value: unknown, allowed: T): value is T[number] => (
  typeof value === "string" && (allowed as readonly string[]).includes(value)
);

const validateStringList = (value: unknown, field: string, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array`);
    return;
  }
  const normalized = new Set<string>();
  for (const entry of value) {
    if (!asNonEmptyString(entry)) {
      issues.push(`${field} must contain non-empty string identifiers`);
      continue;
    }
    const key = (entry as string).trim();
    if (normalized.has(key)) issues.push(`${field} contains duplicate identifier ${key}`);
    normalized.add(key);
  }
};

export const validateVerifierAcceptanceInput = (input: unknown): string[] => {
  const issues: string[] = [];
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return ["input must be an object"];
  }
  const record = input as Record<string, unknown>;
  for (const field of [
    "acceptance_id",
    "scope_key",
    "task_id",
    "artifact_or_object_id",
    "artifact_version_or_head",
    "artifact_digest",
    "obligation_id",
    "obligation_description",
    "verifier_id",
    "verifier_version",
    "verifier_input_digest",
  ]) {
    if (!asNonEmptyString(record[field])) issues.push(`${field} must be a non-empty string`);
  }
  if (!oneOf(record.verifier_authority_class, verifierAuthorityClasses)) {
    issues.push(`verifier_authority_class must be one of ${verifierAuthorityClasses.join(" | ")}`);
  }
  if (!oneOf(record.verifier_freshness_state, verifierFreshnessStates)) {
    issues.push(`verifier_freshness_state must be one of ${verifierFreshnessStates.join(" | ")}`);
  }
  if (!oneOf(record.coverage_state, verifierCoverageStates)) {
    issues.push(`coverage_state must be one of ${verifierCoverageStates.join(" | ")}`);
  }
  if (!oneOf(record.result, verifierResults)) {
    issues.push(`result must be one of ${verifierResults.join(" | ")}`);
  }
  if (typeof record.retry_allowed !== "boolean") issues.push("retry_allowed must be boolean");

  validateStringList(record.higher_priority_verifier_ids ?? [], "higher_priority_verifier_ids", issues);
  validateStringList(record.lower_priority_evidence_ids ?? [], "lower_priority_evidence_ids", issues);

  for (const field of ["repair_feedback_pointer", "receipt_pointer"]) {
    const value = record[field];
    if (value !== undefined && value !== null && !asNonEmptyString(value)) {
      issues.push(`${field} must be null or a non-empty string`);
    }
  }

  return issues;
};

const deriveTerminalEffect = (input: VerifierAcceptanceInput): TerminalAcceptanceEffect => {
  if (input.verifier_authority_class === "MODEL_ADVISORY") return "NO_TERMINAL_EFFECT";
  if (input.verifier_freshness_state !== "CURRENT") return "ESCALATE";

  switch (input.result) {
    case "FAIL":
      return "REJECT";
    case "BLOCKED":
    case "UNKNOWN":
      return "ESCALATE";
    case "PARTIAL":
      return "NO_TERMINAL_EFFECT";
    case "PASS":
      return input.coverage_state === "COMPLETE_FOR_OBLIGATION" ? "ACCEPT" : "NO_TERMINAL_EFFECT";
  }
};

export const createVerifierAcceptanceReceipt = (input: VerifierAcceptanceInput): VerifierAcceptanceReceipt => {
  const issues = validateVerifierAcceptanceInput(input);
  if (issues.length > 0) throw new VerifierAcceptanceValidationError(issues);

  return {
    ...input,
    schema: "aios_verifier_acceptance_v0_1",
    higher_priority_verifier_ids: [...(input.higher_priority_verifier_ids ?? [])],
    lower_priority_evidence_ids: [...(input.lower_priority_evidence_ids ?? [])],
    repair_feedback_pointer: input.repair_feedback_pointer ?? null,
    receipt_pointer: input.receipt_pointer ?? null,
    terminal_acceptance_effect: deriveTerminalEffect(input),
  };
};

export const validateVerifierAcceptanceReceipt = (receipt: unknown): string[] => {
  const issues = validateVerifierAcceptanceInput(receipt);
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) return issues;
  const record = receipt as Record<string, unknown>;
  if (record.schema !== "aios_verifier_acceptance_v0_1") {
    issues.push("schema must equal aios_verifier_acceptance_v0_1");
  }
  if (!oneOf(record.terminal_acceptance_effect, terminalAcceptanceEffects)) {
    issues.push(`terminal_acceptance_effect must be one of ${terminalAcceptanceEffects.join(" | ")}`);
  }
  if (issues.length === 0) {
    const expected = deriveTerminalEffect(record as unknown as VerifierAcceptanceInput);
    if (record.terminal_acceptance_effect !== expected) {
      issues.push(`terminal_acceptance_effect must be mechanically derived as ${expected}`);
    }
  }
  return issues;
};

export const resolveObligationAcceptance = (
  receipts: readonly VerifierAcceptanceReceipt[],
  artifactVersionOrHead: string,
  obligationId: string,
): ObligationResolution => {
  const matching = receipts.filter((receipt) => (
    receipt.artifact_version_or_head === artifactVersionOrHead
    && receipt.obligation_id === obligationId
  ));

  const advisory = matching.filter((receipt) => receipt.terminal_acceptance_effect === "NO_TERMINAL_EFFECT");
  const terminalCandidates = matching.filter((receipt) => receipt.terminal_acceptance_effect !== "NO_TERMINAL_EFFECT");
  const terminal = terminalCandidates.filter((receipt) => !receipt.higher_priority_verifier_ids.some((higherVerifierId) => (
    terminalCandidates.some((candidate) => candidate.verifier_id === higherVerifierId)
  )));

  const decisiveIds = terminal.map((receipt) => receipt.acceptance_id);
  const advisoryIds = advisory.map((receipt) => receipt.acceptance_id);

  if (terminalCandidates.length > 0 && terminal.length === 0) {
    return {
      obligation_id: obligationId,
      artifact_version_or_head: artifactVersionOrHead,
      state: "BLOCKED",
      decisive_acceptance_ids: terminalCandidates.map((receipt) => receipt.acceptance_id),
      advisory_acceptance_ids: advisoryIds,
      reason_codes: ["VERIFIER_PRIORITY_CYCLE_OR_NO_MAXIMAL_OWNER"],
    };
  }

  if (terminal.length === 0) {
    const hasPartial = matching.some((receipt) => (
      receipt.result === "PARTIAL"
      || receipt.coverage_state === "PARTIAL"
      || (receipt.result === "PASS" && receipt.coverage_state !== "COMPLETE_FOR_OBLIGATION")
    ));
    return {
      obligation_id: obligationId,
      artifact_version_or_head: artifactVersionOrHead,
      state: hasPartial ? "PARTIAL" : "OPEN",
      decisive_acceptance_ids: [],
      advisory_acceptance_ids: advisoryIds,
      reason_codes: [hasPartial ? "OBLIGATION_ONLY_PARTIALLY_PROVED" : "NO_TERMINAL_ACCEPTANCE_EVIDENCE"],
    };
  }

  if (terminal.some((receipt) => receipt.terminal_acceptance_effect === "ESCALATE")) {
    return {
      obligation_id: obligationId,
      artifact_version_or_head: artifactVersionOrHead,
      state: "BLOCKED",
      decisive_acceptance_ids: decisiveIds,
      advisory_acceptance_ids: advisoryIds,
      reason_codes: ["VERIFIER_FRESHNESS_IDENTITY_OR_EXECUTION_BLOCKED"],
    };
  }

  const effects = new Set(terminal.map((receipt) => receipt.terminal_acceptance_effect));
  if (effects.size > 1) {
    return {
      obligation_id: obligationId,
      artifact_version_or_head: artifactVersionOrHead,
      state: "BLOCKED",
      decisive_acceptance_ids: decisiveIds,
      advisory_acceptance_ids: advisoryIds,
      reason_codes: ["VERIFIER_CONFLICT_UNRESOLVED"],
    };
  }

  const [effect] = effects;
  return {
    obligation_id: obligationId,
    artifact_version_or_head: artifactVersionOrHead,
    state: effect === "ACCEPT" ? "ACCEPTED" : "REJECTED",
    decisive_acceptance_ids: decisiveIds,
    advisory_acceptance_ids: advisoryIds,
    reason_codes: [effect === "ACCEPT" ? "OBLIGATION_PROVED_BY_DECLARED_VERIFIER" : "OBLIGATION_REJECTED_BY_DECLARED_VERIFIER"],
  };
};
