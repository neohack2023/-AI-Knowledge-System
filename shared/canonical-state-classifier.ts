import {
  assertCanonicalStateReconciliation,
  canonicalReconcilerCapabilityId,
  canonicalReconciliationSchema,
  reconciliationFindingClasses,
  reconciliationOverallStates,
  reconciliationProjectionClasses,
  type CanonicalStateFinding,
  type CanonicalStateProjection,
  type CanonicalStateReconciliation,
  type ReconciliationFindingClass,
  type ReconciliationOverallState,
  type ReconciliationProjectionClass,
  type ReconciliationSeverity,
} from "./canonical-state-reconciliation.ts";
import { adapterReasonCodes } from "./canonical-state-adapters.ts";

export const classifierReasonCodes = [
  "NO_DRIFT",
  "AUTHORITY_DOMAIN_CONFLICT",
  "CLASSIFIER_UNREGISTERED_REASON_CODE",
  "CLASSIFIER_STATUS_REASON_MISSING",
] as const;

export const reconciliationFindingPolicy = {
  NO_DRIFT: { severity: "INFO", blocks_current_state: false, overall_state: "HEALTHY", precedence: 0 },
  UNKNOWN: { severity: "FAIL", blocks_current_state: true, overall_state: "DEGRADED", precedence: 10 },
  UNAVAILABLE: { severity: "FAIL", blocks_current_state: true, overall_state: "DEGRADED", precedence: 20 },
  STALE_PROJECTION: { severity: "FAIL", blocks_current_state: true, overall_state: "DRIFTED", precedence: 30 },
  PROJECTION_DRIFT: { severity: "FAIL", blocks_current_state: true, overall_state: "DRIFTED", precedence: 40 },
  SCHEMA_DRIFT: { severity: "FAIL", blocks_current_state: true, overall_state: "BLOCKED", precedence: 50 },
  POINTER_DRIFT: { severity: "FAIL", blocks_current_state: true, overall_state: "BLOCKED", precedence: 60 },
  AUTHORITY_DRIFT: { severity: "FAIL", blocks_current_state: true, overall_state: "BLOCKED", precedence: 70 },
  SCOPE_ISOLATION_VIOLATION: { severity: "FAIL", blocks_current_state: true, overall_state: "BLOCKED", precedence: 80 },
} as const satisfies Record<ReconciliationFindingClass, {
  severity: ReconciliationSeverity;
  blocks_current_state: boolean;
  overall_state: ReconciliationOverallState;
  precedence: number;
}>;

export const adapterReasonClassification = {
  SOURCE_UNAVAILABLE: "UNAVAILABLE",
  PROVENANCE_MISSING: "UNKNOWN",
  FRESHNESS_UNPROVEN: "UNKNOWN",
  ADAPTER_AUTHORITY_ROLE_MISMATCH: "AUTHORITY_DRIFT",

  SCOPE_ROW_MISSING: "POINTER_DRIFT",
  ALIAS_TARGET_DRIFT: "POINTER_DRIFT",
  SOURCE_BINDING_DRIFT: "POINTER_DRIFT",
  SIBLING_SCOPE_LEAK: "SCOPE_ISOLATION_VIOLATION",
  SCOPE_AMBIGUOUS: "SCOPE_ISOLATION_VIOLATION",

  HANDOFF_STALE: "STALE_PROJECTION",
  HANDOFF_PROPERTY_DRIFT: "PROJECTION_DRIFT",
  SUPERSESSION_MISSING: "POINTER_DRIFT",
  HISTORICAL_STATE_PROMOTED: "PROJECTION_DRIFT",

  RUNTIME_ARTIFACT_MISSING: "POINTER_DRIFT",
  RUNTIME_SCHEMA_DRIFT: "SCHEMA_DRIFT",
  RUNTIME_STALE: "STALE_PROJECTION",
  SHADOW_AUTHORITY_OVERREACH: "AUTHORITY_DRIFT",

  LEDGER_GAP: "PROJECTION_DRIFT",
  LEDGER_DUPLICATE_ID: "POINTER_DRIFT",
  LEDGER_KEY_AMBIGUITY: "POINTER_DRIFT",
  LEDGER_COVERAGE_OVERCLAIM: "PROJECTION_DRIFT",
  RECEIPT_LINK_DRIFT: "POINTER_DRIFT",

  INTERFACE_MODE_DRIFT: "PROJECTION_DRIFT",
  INTERFACE_VERSION_STALE: "STALE_PROJECTION",
  INTERFACE_IMPLEMENTATION_OVERCLAIM: "PROJECTION_DRIFT",
  INTERFACE_AUTHORITY_DRIFT: "AUTHORITY_DRIFT",

  REGISTRY_STATUS_DRIFT: "PROJECTION_DRIFT",
  REGISTRY_VERSION_DRIFT: "PROJECTION_DRIFT",
  CAPABILITY_REFERENCE_MISSING: "POINTER_DRIFT",
  REGISTRY_AUTHORITY_MISMATCH: "AUTHORITY_DRIFT",
  REGISTRY_EXECUTION_DRIFT: "PROJECTION_DRIFT",
} as const satisfies Record<string, ReconciliationFindingClass>;

const registeredAdapterReasonCodes = new Set<string>(
  Object.values(adapterReasonCodes).flatMap((codes) => [...codes]),
);

const projectionOrder = new Map<ReconciliationProjectionClass, number>(
  reconciliationProjectionClasses.map((projectionClass, index) => [projectionClass, index]),
);

export type CanonicalStateClassification = {
  findings: CanonicalStateFinding[];
  overall_state: ReconciliationOverallState;
  fail_visible: boolean;
  blocked_current_state_claim: boolean;
};

export type CanonicalStateReconciliationDraft = Omit<
  CanonicalStateReconciliation,
  "findings" | "overall_state" | "fail_visible"
>;

export class CanonicalStateClassifierInputError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

const nonEmpty = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

const sanitizeIdPart = (value: string) => (
  value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
);

const canonicalizeProjectionSet = (projections: readonly CanonicalStateProjection[]) => {
  const issues: string[] = [];
  if (projections.length !== reconciliationProjectionClasses.length) {
    issues.push(`classifier requires exactly ${reconciliationProjectionClasses.length} projections; observed ${projections.length}.`);
  }

  const counts = new Map<string, number>();
  for (const projection of projections) {
    counts.set(projection.projection_class, (counts.get(projection.projection_class) ?? 0) + 1);
  }
  for (const projectionClass of reconciliationProjectionClasses) {
    const count = counts.get(projectionClass) ?? 0;
    if (count !== 1) issues.push(`classifier requires exactly one ${projectionClass} projection; observed ${count}.`);
  }

  if (issues.length > 0) {
    throw new CanonicalStateClassifierInputError("CANONICAL_STATE_CLASSIFIER_INPUT_INVALID", issues);
  }

  return [...projections].sort(
    (left, right) => (projectionOrder.get(left.projection_class) ?? 999) - (projectionOrder.get(right.projection_class) ?? 999),
  );
};

const makeFinding = (
  reconciliationId: string,
  driftClass: ReconciliationFindingClass,
  projectionClasses: ReconciliationProjectionClass[],
  sourceIds: string[],
  reasonCode: string,
): CanonicalStateFinding => {
  const policy = reconciliationFindingPolicy[driftClass];
  const orderedProjectionClasses = [...new Set(projectionClasses)].sort(
    (left, right) => (projectionOrder.get(left) ?? 999) - (projectionOrder.get(right) ?? 999),
  );
  const orderedSourceIds = [...new Set(sourceIds)].sort();
  return {
    finding_id: [
      "finding",
      sanitizeIdPart(reconciliationId),
      driftClass.toLowerCase(),
      orderedProjectionClasses.join("+"),
      sanitizeIdPart(reasonCode),
    ].join(":"),
    drift_class: driftClass,
    severity: policy.severity,
    projection_classes: orderedProjectionClasses,
    source_ids: orderedSourceIds,
    reason_code: reasonCode,
    blocks_current_state: policy.blocks_current_state,
  };
};

const fallbackClassForStatus = (status: CanonicalStateProjection["status"]): ReconciliationFindingClass | null => {
  if (status === "FRESH" || status === "UNCHANGED") return null;
  if (status === "STALE") return "STALE_PROJECTION";
  if (status === "UNKNOWN") return "UNKNOWN";
  if (status === "UNAVAILABLE") return "UNAVAILABLE";
  return "PROJECTION_DRIFT";
};

const classifyProjection = (
  reconciliationId: string,
  projection: CanonicalStateProjection,
): CanonicalStateFinding[] => {
  const findings: CanonicalStateFinding[] = [];
  const reasonCodes = Array.isArray(projection.reason_codes) ? projection.reason_codes : [];

  if (reasonCodes.length === 0) {
    const fallbackClass = fallbackClassForStatus(projection.status);
    if (fallbackClass !== null) {
      findings.push(makeFinding(
        reconciliationId,
        "SCHEMA_DRIFT",
        [projection.projection_class],
        [projection.source_id],
        "CLASSIFIER_STATUS_REASON_MISSING",
      ));
    }
    return findings;
  }

  for (const reasonCode of [...reasonCodes].sort()) {
    const driftClass = registeredAdapterReasonCodes.has(reasonCode)
      ? adapterReasonClassification[reasonCode as keyof typeof adapterReasonClassification]
      : undefined;
    if (driftClass === undefined) {
      findings.push(makeFinding(
        reconciliationId,
        "SCHEMA_DRIFT",
        [projection.projection_class],
        [projection.source_id],
        "CLASSIFIER_UNREGISTERED_REASON_CODE",
      ));
      continue;
    }
    findings.push(makeFinding(
      reconciliationId,
      driftClass,
      [projection.projection_class],
      [projection.source_id],
      reasonCode,
    ));
  }

  return findings;
};

const authorityDomainConflictFindings = (
  reconciliationId: string,
  projections: readonly CanonicalStateProjection[],
) => {
  const byDomain = new Map<string, CanonicalStateProjection[]>();
  for (const projection of projections) {
    if (projection.authority_state !== "authoritative" || !nonEmpty(projection.authority_domain)) continue;
    const current = byDomain.get(projection.authority_domain) ?? [];
    current.push(projection);
    byDomain.set(projection.authority_domain, current);
  }

  const findings: CanonicalStateFinding[] = [];
  for (const [, domainProjections] of [...byDomain.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const owners = new Set(domainProjections.map((projection) => projection.authority_owner));
    if (owners.size <= 1) continue;
    findings.push(makeFinding(
      reconciliationId,
      "AUTHORITY_DRIFT",
      domainProjections.map((projection) => projection.projection_class),
      domainProjections.map((projection) => projection.source_id),
      "AUTHORITY_DOMAIN_CONFLICT",
    ));
  }
  return findings;
};

const findingSort = (left: CanonicalStateFinding, right: CanonicalStateFinding) => {
  const policyDelta = reconciliationFindingPolicy[right.drift_class].precedence
    - reconciliationFindingPolicy[left.drift_class].precedence;
  if (policyDelta !== 0) return policyDelta;

  const leftProjection = left.projection_classes[0];
  const rightProjection = right.projection_classes[0];
  const projectionDelta = (projectionOrder.get(leftProjection) ?? 999) - (projectionOrder.get(rightProjection) ?? 999);
  if (projectionDelta !== 0) return projectionDelta;

  const reasonDelta = left.reason_code.localeCompare(right.reason_code);
  if (reasonDelta !== 0) return reasonDelta;
  return left.finding_id.localeCompare(right.finding_id);
};

const dedupeFindings = (findings: CanonicalStateFinding[]) => {
  const byIdentity = new Map<string, CanonicalStateFinding>();
  for (const finding of findings) byIdentity.set(finding.finding_id, finding);
  return [...byIdentity.values()].sort(findingSort);
};

export const classifyCanonicalStateProjections = (
  reconciliationId: string,
  projections: readonly CanonicalStateProjection[],
): CanonicalStateClassification => {
  if (!nonEmpty(reconciliationId)) {
    throw new CanonicalStateClassifierInputError(
      "CANONICAL_STATE_CLASSIFIER_INPUT_INVALID",
      ["reconciliation_id is required for deterministic finding identity."],
    );
  }

  const canonicalProjections = canonicalizeProjectionSet(projections);
  const findings = dedupeFindings([
    ...canonicalProjections.flatMap((projection) => classifyProjection(reconciliationId, projection)),
    ...authorityDomainConflictFindings(reconciliationId, canonicalProjections),
  ]);

  if (findings.length === 0) {
    const noDrift = makeFinding(
      reconciliationId,
      "NO_DRIFT",
      [...reconciliationProjectionClasses],
      canonicalProjections.map((projection) => projection.source_id),
      "NO_DRIFT",
    );
    return {
      findings: [noDrift],
      overall_state: "HEALTHY",
      fail_visible: false,
      blocked_current_state_claim: false,
    };
  }

  const strongest = findings.reduce((current, finding) => (
    reconciliationFindingPolicy[finding.drift_class].precedence
      > reconciliationFindingPolicy[current.drift_class].precedence
      ? finding
      : current
  ));
  const overallState = reconciliationFindingPolicy[strongest.drift_class].overall_state;

  if (!reconciliationOverallStates.includes(overallState)) {
    throw new Error("classifier produced an unregistered overall state.");
  }
  if (findings.some((finding) => !reconciliationFindingClasses.includes(finding.drift_class))) {
    throw new Error("classifier produced an unregistered finding class.");
  }

  return {
    findings,
    overall_state: overallState,
    fail_visible: true,
    blocked_current_state_claim: findings.some((finding) => finding.blocks_current_state),
  };
};

export const finalizeCanonicalStateReconciliation = (
  draft: CanonicalStateReconciliationDraft,
): CanonicalStateReconciliation => {
  if (draft.schema !== canonicalReconciliationSchema) {
    throw new CanonicalStateClassifierInputError(
      "CANONICAL_STATE_CLASSIFIER_INPUT_INVALID",
      [`draft.schema must be ${canonicalReconciliationSchema}.`],
    );
  }
  if (draft.capability_id !== canonicalReconcilerCapabilityId) {
    throw new CanonicalStateClassifierInputError(
      "CANONICAL_STATE_CLASSIFIER_INPUT_INVALID",
      [`draft.capability_id must be ${canonicalReconcilerCapabilityId}.`],
    );
  }

  const canonicalProjections = canonicalizeProjectionSet(draft.projections);
  const classification = classifyCanonicalStateProjections(draft.reconciliation_id, canonicalProjections);
  const result: CanonicalStateReconciliation = {
    ...draft,
    projections: canonicalProjections,
    findings: classification.findings,
    overall_state: classification.overall_state,
    fail_visible: classification.fail_visible,
  };
  assertCanonicalStateReconciliation(result);
  return result;
};
