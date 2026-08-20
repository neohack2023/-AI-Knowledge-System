import {
  assertCanonicalStateReconciliation,
  reconciliationProjectionClasses,
  type CanonicalStateReconciliation,
  type ReconciliationProjectionClass,
  type ReconciliationSeverity,
} from "./canonical-state-reconciliation.ts";

export type CanonicalStateOperatorFinding = {
  severity: ReconciliationSeverity;
  reason_code: string;
  projection_classes: ReconciliationProjectionClass[];
  blocks_current_state: boolean;
};

export type CanonicalStateOperatorView = {
  overall_state: CanonicalStateReconciliation["overall_state"];
  scope_key: string;
  reconciliation_id: string;
  fail_visible: boolean;
  findings: CanonicalStateOperatorFinding[];
  healthy_projections: ReconciliationProjectionClass[];
  blocked_current_state_claim: boolean;
  write_authorization: "NONE";
  mutation_performed: false;
};

export type CanonicalStateOperatorTelemetry = {
  overall_state: CanonicalStateReconciliation["overall_state"];
  scope_key: string;
  reconciliation_id: string;
  fail_visible: boolean;
  finding_reason_codes: string[];
  affected_projection_classes: ReconciliationProjectionClass[];
  blocked_current_state_claim: boolean;
  write_authorization: "NONE";
  mutation_performed: false;
};

export class CanonicalStateOperatorAgreementError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

const projectionOrder = new Map<ReconciliationProjectionClass, number>(
  reconciliationProjectionClasses.map((projectionClass, index) => [projectionClass, index]),
);

const orderedProjectionClasses = (classes: readonly ReconciliationProjectionClass[]) => (
  [...new Set(classes)].sort(
    (left, right) => (projectionOrder.get(left) ?? 999) - (projectionOrder.get(right) ?? 999),
  )
);

const sameStringArray = (left: readonly string[], right: readonly string[]) => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

export const buildCanonicalStateOperatorView = (
  reconciliation: CanonicalStateReconciliation,
): CanonicalStateOperatorView => {
  assertCanonicalStateReconciliation(reconciliation);

  const healthyProjections = orderedProjectionClasses(
    reconciliation.projections
      .filter((projection) => projection.status === "FRESH" || projection.status === "UNCHANGED")
      .map((projection) => projection.projection_class),
  );

  const findings = reconciliation.findings.map((finding) => ({
    severity: finding.severity,
    reason_code: finding.reason_code,
    projection_classes: orderedProjectionClasses(finding.projection_classes),
    blocks_current_state: finding.blocks_current_state,
  }));

  return {
    overall_state: reconciliation.overall_state,
    scope_key: reconciliation.scope_key,
    reconciliation_id: reconciliation.reconciliation_id,
    fail_visible: reconciliation.fail_visible,
    findings,
    healthy_projections: healthyProjections,
    blocked_current_state_claim: reconciliation.findings.some((finding) => finding.blocks_current_state),
    write_authorization: "NONE",
    mutation_performed: false,
  };
};

export const validateMachineOperatorAgreement = (
  reconciliation: CanonicalStateReconciliation,
  operatorView: CanonicalStateOperatorView,
): string[] => {
  const issues: string[] = [];

  if (operatorView.overall_state !== reconciliation.overall_state) issues.push("operator overall_state disagrees with machine reconciliation.");
  if (operatorView.scope_key !== reconciliation.scope_key) issues.push("operator scope_key disagrees with machine reconciliation.");
  if (operatorView.reconciliation_id !== reconciliation.reconciliation_id) issues.push("operator reconciliation_id disagrees with machine reconciliation.");
  if (operatorView.fail_visible !== reconciliation.fail_visible) issues.push("operator fail_visible disagrees with machine reconciliation.");
  if (operatorView.write_authorization !== reconciliation.write_authorization) issues.push("operator write_authorization disagrees with machine reconciliation.");
  if (operatorView.mutation_performed !== reconciliation.mutation_performed) issues.push("operator mutation_performed disagrees with machine reconciliation.");

  const expectedBlocked = reconciliation.findings.some((finding) => finding.blocks_current_state);
  if (operatorView.blocked_current_state_claim !== expectedBlocked) issues.push("operator blocked_current_state_claim disagrees with machine findings.");

  const expectedHealthy = orderedProjectionClasses(
    reconciliation.projections
      .filter((projection) => projection.status === "FRESH" || projection.status === "UNCHANGED")
      .map((projection) => projection.projection_class),
  );
  if (!sameStringArray(operatorView.healthy_projections, expectedHealthy)) issues.push("operator healthy_projections disagrees with machine projection status.");

  if (operatorView.findings.length !== reconciliation.findings.length) {
    issues.push("operator finding count disagrees with machine findings.");
  } else {
    operatorView.findings.forEach((operatorFinding, index) => {
      const machineFinding = reconciliation.findings[index];
      if (operatorFinding.severity !== machineFinding.severity) issues.push(`operator finding[${index}] severity disagrees with machine finding.`);
      if (operatorFinding.reason_code !== machineFinding.reason_code) issues.push(`operator finding[${index}] reason_code disagrees with machine finding.`);
      if (operatorFinding.blocks_current_state !== machineFinding.blocks_current_state) issues.push(`operator finding[${index}] blocking flag disagrees with machine finding.`);
      const expectedClasses = orderedProjectionClasses(machineFinding.projection_classes);
      if (!sameStringArray(operatorFinding.projection_classes, expectedClasses)) issues.push(`operator finding[${index}] projection classes disagree with machine finding.`);
    });
  }

  return issues;
};

export const assertMachineOperatorAgreement = (
  reconciliation: CanonicalStateReconciliation,
  operatorView: CanonicalStateOperatorView,
) => {
  const issues = validateMachineOperatorAgreement(reconciliation, operatorView);
  if (issues.length > 0) {
    throw new CanonicalStateOperatorAgreementError("CANONICAL_STATE_OPERATOR_MACHINE_MISMATCH", issues);
  }
};

export const buildCanonicalStateOperatorTelemetry = (
  operatorView: CanonicalStateOperatorView,
): CanonicalStateOperatorTelemetry => ({
  overall_state: operatorView.overall_state,
  scope_key: operatorView.scope_key,
  reconciliation_id: operatorView.reconciliation_id,
  fail_visible: operatorView.fail_visible,
  finding_reason_codes: operatorView.findings.map((finding) => finding.reason_code),
  affected_projection_classes: orderedProjectionClasses(
    operatorView.findings.flatMap((finding) => finding.projection_classes),
  ),
  blocked_current_state_claim: operatorView.blocked_current_state_claim,
  write_authorization: "NONE",
  mutation_performed: false,
});

export const renderCanonicalStateOperatorView = (
  reconciliation: CanonicalStateReconciliation,
): string => {
  const operatorView = buildCanonicalStateOperatorView(reconciliation);
  assertMachineOperatorAgreement(reconciliation, operatorView);

  const findingLines = operatorView.findings.map((finding) => (
    `${finding.severity}: ${finding.reason_code} [${finding.projection_classes.join(",")}]`
  ));

  return [
    `AIOS STATE · ${operatorView.overall_state}`,
    `scope: ${operatorView.scope_key}`,
    `reconciliation: ${operatorView.reconciliation_id}`,
    ...findingLines,
    `healthy projections: ${operatorView.healthy_projections.join(",") || "NONE"}`,
    `blocked_current_state_claim: ${operatorView.blocked_current_state_claim}`,
    `fail_visible: ${operatorView.fail_visible}`,
    `write_authorization: ${operatorView.write_authorization}`,
    `mutation_performed: ${operatorView.mutation_performed}`,
  ].join("\n");
};
