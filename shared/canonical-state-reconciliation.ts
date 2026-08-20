export const canonicalReconciliationSchema = "aios_canonical_state_reconciliation_v0_1" as const;
export const canonicalReconcilerCapabilityId = "cap:canonical-state-reconciler" as const;

export const reconciliationProjectionClasses = [
  "scope",
  "handoff",
  "runtime",
  "ledger",
  "interface",
  "registry",
] as const;

export const reconciliationProjectionStatuses = [
  "FRESH",
  "UNCHANGED",
  "STALE",
  "DRIFTED",
  "UNKNOWN",
  "UNAVAILABLE",
] as const;

export const reconciliationOverallStates = [
  "HEALTHY",
  "DEGRADED",
  "DRIFTED",
  "BLOCKED",
] as const;

export const reconciliationAuthorityStates = [
  "authoritative",
  "shadow",
  "execution_truth",
  "observational",
] as const;

export const reconciliationSourceSystems = [
  "Notion",
  "Google_Drive",
  "GitHub",
  "runtime",
] as const;

export const reconciliationFindingClasses = [
  "NO_DRIFT",
  "STALE_PROJECTION",
  "AUTHORITY_DRIFT",
  "POINTER_DRIFT",
  "SCHEMA_DRIFT",
  "UNAVAILABLE",
  "UNKNOWN",
  "PROJECTION_DRIFT",
  "SCOPE_ISOLATION_VIOLATION",
] as const;

export const reconciliationSeverities = ["INFO", "WARN", "FAIL"] as const;

export type ReconciliationProjectionClass = (typeof reconciliationProjectionClasses)[number];
export type ReconciliationProjectionStatus = (typeof reconciliationProjectionStatuses)[number];
export type ReconciliationOverallState = (typeof reconciliationOverallStates)[number];
export type ReconciliationAuthorityState = (typeof reconciliationAuthorityStates)[number];
export type ReconciliationSourceSystem = (typeof reconciliationSourceSystems)[number];
export type ReconciliationFindingClass = (typeof reconciliationFindingClasses)[number];
export type ReconciliationSeverity = (typeof reconciliationSeverities)[number];

export type CanonicalStateProjection = {
  projection_class: ReconciliationProjectionClass;
  adapter_id: string;
  source_system: ReconciliationSourceSystem;
  source_id: string;
  source_version: string | null;
  source_fingerprint: string | null;
  provenance_envelope_id: string | null;
  missing_provenance_reason: string | null;
  authority_owner: string;
  authority_domain: string;
  authority_state: ReconciliationAuthorityState;
  freshness_anchor: string;
  supersedes: string | null;
  status: ReconciliationProjectionStatus;
  reason_codes: string[];
  observed_claims: Record<string, unknown>;
};

export type CanonicalStateFinding = {
  finding_id: string;
  drift_class: ReconciliationFindingClass;
  severity: ReconciliationSeverity;
  projection_classes: ReconciliationProjectionClass[];
  source_ids: string[];
  reason_code: string;
  blocks_current_state: boolean;
};

export type CanonicalStateReconciliation = {
  schema: typeof canonicalReconciliationSchema;
  reconciliation_id: string;
  execution_id: string;
  scope_key: string;
  capability_id: typeof canonicalReconcilerCapabilityId;
  generated_at: string;
  mode: "READ_ONLY";
  write_authorization: "NONE";
  mutation_performed: false;
  projection_requirements: ReconciliationProjectionClass[];
  projections: CanonicalStateProjection[];
  findings: CanonicalStateFinding[];
  overall_state: ReconciliationOverallState;
  fail_visible: boolean;
};

const nonEmpty = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown) => value === null || typeof value === "string";

const uniqueNonEmptyStrings = (value: unknown, field: string, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push(`${field} must be an array of non-empty strings.`);
    return [] as string[];
  }
  if (value.some((item) => !nonEmpty(item))) {
    issues.push(`${field} must contain only non-empty strings.`);
  }
  const normalized = value.filter(nonEmpty).map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) {
    issues.push(`${field} must not contain duplicate values.`);
  }
  return normalized;
};

const exactProjectionSet = (value: unknown, issues: string[]) => {
  if (!Array.isArray(value)) {
    issues.push("projection_requirements must be an array containing the six canonical projection classes.");
    return;
  }

  const normalized = value.filter((item): item is string => typeof item === "string");
  const invalid = normalized.filter((item) => !reconciliationProjectionClasses.includes(item as ReconciliationProjectionClass));
  if (invalid.length > 0 || normalized.length !== value.length) {
    issues.push(`projection_requirements may contain only: ${reconciliationProjectionClasses.join(", ")}.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    issues.push("projection_requirements must not contain duplicate classes.");
  }
  const actual = new Set(normalized);
  if (
    actual.size !== reconciliationProjectionClasses.length
    || reconciliationProjectionClasses.some((projectionClass) => !actual.has(projectionClass))
  ) {
    issues.push("projection_requirements must contain all six canonical projection classes exactly once.");
  }
};

const validateProjection = (value: unknown, index: number): string[] => {
  const issues: string[] = [];
  const prefix = `projections[${index}]`;
  if (!isRecord(value)) return [`${prefix} must be an object.`];

  const projectionClass = value.projection_class;
  if (!reconciliationProjectionClasses.includes(projectionClass as ReconciliationProjectionClass)) {
    issues.push(`${prefix}.projection_class must be one of: ${reconciliationProjectionClasses.join(", ")}.`);
  }

  for (const field of ["adapter_id", "source_id", "authority_owner", "authority_domain", "freshness_anchor"] as const) {
    if (!nonEmpty(value[field])) issues.push(`${prefix}.${field} is required.`);
  }

  if (!reconciliationSourceSystems.includes(value.source_system as ReconciliationSourceSystem)) {
    issues.push(`${prefix}.source_system must be one of: ${reconciliationSourceSystems.join(", ")}.`);
  }

  if (!reconciliationAuthorityStates.includes(value.authority_state as ReconciliationAuthorityState)) {
    issues.push(`${prefix}.authority_state must be one of: ${reconciliationAuthorityStates.join(", ")}.`);
  }

  if (!reconciliationProjectionStatuses.includes(value.status as ReconciliationProjectionStatus)) {
    issues.push(`${prefix}.status must be one of: ${reconciliationProjectionStatuses.join(", ")}.`);
  }

  for (const field of ["source_version", "source_fingerprint", "provenance_envelope_id", "missing_provenance_reason", "supersedes"] as const) {
    if (!isNullableString(value[field])) issues.push(`${prefix}.${field} must be a string or null.`);
  }

  const reasonCodes = uniqueNonEmptyStrings(value.reason_codes, `${prefix}.reason_codes`, issues);
  const status = value.status as ReconciliationProjectionStatus;
  if (["STALE", "DRIFTED", "UNKNOWN", "UNAVAILABLE"].includes(status) && reasonCodes.length === 0) {
    issues.push(`${prefix}.reason_codes must explain non-current projection status ${status}.`);
  }

  const provenanceId = value.provenance_envelope_id;
  const missingReason = value.missing_provenance_reason;
  if (provenanceId === null) {
    if (!nonEmpty(missingReason)) {
      issues.push(`${prefix}.missing_provenance_reason is required when provenance_envelope_id is null.`);
    }
    if (status === "FRESH" || status === "UNCHANGED") {
      issues.push(`${prefix}.status cannot be ${status} without provenance_envelope_id.`);
    }
  } else if (nonEmpty(provenanceId) && missingReason !== null) {
    issues.push(`${prefix}.missing_provenance_reason must be null when provenance_envelope_id is present.`);
  } else if (!nonEmpty(provenanceId)) {
    issues.push(`${prefix}.provenance_envelope_id must be a non-empty string or null.`);
  }

  if (!isRecord(value.observed_claims)) {
    issues.push(`${prefix}.observed_claims must be an object.`);
  }

  return issues;
};

const validateFinding = (value: unknown, index: number): string[] => {
  const issues: string[] = [];
  const prefix = `findings[${index}]`;
  if (!isRecord(value)) return [`${prefix} must be an object.`];

  for (const field of ["finding_id", "reason_code"] as const) {
    if (!nonEmpty(value[field])) issues.push(`${prefix}.${field} is required.`);
  }
  if (!reconciliationFindingClasses.includes(value.drift_class as ReconciliationFindingClass)) {
    issues.push(`${prefix}.drift_class must be a registered reconciliation finding class.`);
  }
  if (!reconciliationSeverities.includes(value.severity as ReconciliationSeverity)) {
    issues.push(`${prefix}.severity must be one of: ${reconciliationSeverities.join(", ")}.`);
  }

  if (!Array.isArray(value.projection_classes)) {
    issues.push(`${prefix}.projection_classes must be an array.`);
  } else if (value.projection_classes.some((item) => !reconciliationProjectionClasses.includes(item as ReconciliationProjectionClass))) {
    issues.push(`${prefix}.projection_classes contains an unknown projection class.`);
  }

  uniqueNonEmptyStrings(value.source_ids, `${prefix}.source_ids`, issues);
  if (typeof value.blocks_current_state !== "boolean") {
    issues.push(`${prefix}.blocks_current_state must be boolean.`);
  }
  return issues;
};

export class CanonicalStateReconciliationValidationError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

export const validateCanonicalStateReconciliation = (input: unknown): string[] => {
  const issues: string[] = [];
  if (!isRecord(input)) return ["reconciliation must be an object."];

  if (input.schema !== canonicalReconciliationSchema) {
    issues.push(`schema must be ${canonicalReconciliationSchema}.`);
  }
  for (const field of ["reconciliation_id", "execution_id", "scope_key"] as const) {
    if (!nonEmpty(input[field])) issues.push(`${field} is required.`);
  }
  if (input.capability_id !== canonicalReconcilerCapabilityId) {
    issues.push(`capability_id must be ${canonicalReconcilerCapabilityId}.`);
  }
  if (!nonEmpty(input.generated_at) || Number.isNaN(Date.parse(input.generated_at as string))) {
    issues.push("generated_at must be a valid timestamp string.");
  }
  if (input.mode !== "READ_ONLY") issues.push('mode must be "READ_ONLY" in Build 01.');
  if (input.write_authorization !== "NONE") issues.push('write_authorization must remain "NONE" in Build 01.');
  if (input.mutation_performed !== false) issues.push("mutation_performed must be false in Build 01.");

  exactProjectionSet(input.projection_requirements, issues);

  const projectionClasses: string[] = [];
  if (!Array.isArray(input.projections)) {
    issues.push("projections must be an array containing one normalized record for each required class.");
  } else {
    input.projections.forEach((projection, index) => {
      issues.push(...validateProjection(projection, index));
      if (isRecord(projection) && typeof projection.projection_class === "string") {
        projectionClasses.push(projection.projection_class);
      }
    });

    for (const requiredClass of reconciliationProjectionClasses) {
      const count = projectionClasses.filter((projectionClass) => projectionClass === requiredClass).length;
      if (count !== 1) issues.push(`projections must contain exactly one ${requiredClass} projection; observed ${count}.`);
    }
    const unknownClasses = projectionClasses.filter(
      (projectionClass) => !reconciliationProjectionClasses.includes(projectionClass as ReconciliationProjectionClass),
    );
    if (unknownClasses.length > 0) issues.push("projections contains unknown projection classes.");
  }

  if (!Array.isArray(input.findings)) {
    issues.push("findings must be an array.");
  } else {
    input.findings.forEach((finding, index) => issues.push(...validateFinding(finding, index)));
  }

  if (!reconciliationOverallStates.includes(input.overall_state as ReconciliationOverallState)) {
    issues.push(`overall_state must be one of: ${reconciliationOverallStates.join(", ")}.`);
  }
  if (typeof input.fail_visible !== "boolean") issues.push("fail_visible must be boolean.");

  const projections = Array.isArray(input.projections) ? input.projections.filter(isRecord) : [];
  const allCurrent = projections.length === reconciliationProjectionClasses.length
    && projections.every((projection) => projection.status === "FRESH" || projection.status === "UNCHANGED");
  const failFinding = Array.isArray(input.findings)
    && input.findings.some((finding) => isRecord(finding) && finding.severity === "FAIL");

  if (input.overall_state === "HEALTHY" && !allCurrent) {
    issues.push("overall_state cannot be HEALTHY unless all six projections are FRESH or UNCHANGED.");
  }
  if (input.overall_state === "HEALTHY" && failFinding) {
    issues.push("overall_state cannot be HEALTHY while a FAIL finding is present.");
  }
  if (input.overall_state !== "HEALTHY" && reconciliationOverallStates.includes(input.overall_state as ReconciliationOverallState) && input.fail_visible !== true) {
    issues.push("fail_visible must be true whenever overall_state is not HEALTHY.");
  }

  return issues;
};

export const assertCanonicalStateReconciliation = (input: unknown): asserts input is CanonicalStateReconciliation => {
  const issues = validateCanonicalStateReconciliation(input);
  if (issues.length > 0) {
    throw new CanonicalStateReconciliationValidationError(
      "CANONICAL_STATE_RECONCILIATION_INVALID",
      issues,
    );
  }
};
