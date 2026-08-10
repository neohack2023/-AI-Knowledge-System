import type { ContextProvenanceEnvelopeReadProjection } from "../provenance/types.ts";

export const influenceReceiptContributionClasses = [
  "EVIDENCE",
  "CONSTRAINT",
  "CURRENT_STATE",
  "AUTHORITY_REFERENCE",
  "ACTION_INPUT",
] as const;

export const influenceReceiptLinkageTypes = [
  "CITED_IN_OUTPUT",
  "NAMED_IN_DECISION_RECEIPT",
  "LINKED_TO_ACTION_INPUT",
  "LINKED_TO_VERIFICATION_RECEIPT",
] as const;

export type InfluenceReceiptContributionClass = typeof influenceReceiptContributionClasses[number];
export type InfluenceReceiptLinkageType = typeof influenceReceiptLinkageTypes[number];

export type InfluenceReceiptReferencedProvenanceSource = {
  provenance_envelope_id: string;
  contribution_class: InfluenceReceiptContributionClass;
  linkage_type: InfluenceReceiptLinkageType;
};

export type InfluenceReceiptProvenanceReferenceInput = {
  execution_id: string;
  resolved_scope: string;
  referenced_sources: InfluenceReceiptReferencedProvenanceSource[];
  admitted_object_count: number;
  referenced_object_count: number;
};

export type ResolvedInfluenceReceiptProvenanceReference = {
  contribution_class: InfluenceReceiptContributionClass;
  linkage_type: InfluenceReceiptLinkageType;
  provenance: ContextProvenanceEnvelopeReadProjection;
};

export type ContextProvenanceEnvelopeReader = {
  getProvenanceEnvelope: (
    executionId: string,
    provenanceEnvelopeId: string,
    expectedScopeKey?: string,
  ) => ContextProvenanceEnvelopeReadProjection;
};

export type InfluenceReceiptReferenceValidationErrorCode =
  | "INFLUENCE_REFERENCE_COUNT_INVALID"
  | "INFLUENCE_REFERENCE_COUNT_MISMATCH"
  | "INFLUENCE_REFERENCE_EXCEEDS_ADMITTED";

export class InfluenceReceiptReferenceValidationError extends Error {
  constructor(
    readonly code: InfluenceReceiptReferenceValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InfluenceReceiptReferenceValidationError";
  }
}

const assertNonNegativeInteger = (value: number, field: string) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new InfluenceReceiptReferenceValidationError(
      "INFLUENCE_REFERENCE_COUNT_INVALID",
      `${field} must be a non-negative integer.`,
    );
  }
};

export const resolveInfluenceReceiptProvenanceReferences = (
  reader: ContextProvenanceEnvelopeReader,
  input: InfluenceReceiptProvenanceReferenceInput,
): ResolvedInfluenceReceiptProvenanceReference[] => {
  assertNonNegativeInteger(input.admitted_object_count, "admitted_object_count");
  assertNonNegativeInteger(input.referenced_object_count, "referenced_object_count");

  if (input.referenced_object_count !== input.referenced_sources.length) {
    throw new InfluenceReceiptReferenceValidationError(
      "INFLUENCE_REFERENCE_COUNT_MISMATCH",
      "referenced_object_count must equal referenced_sources.length.",
    );
  }

  if (input.referenced_object_count > input.admitted_object_count) {
    throw new InfluenceReceiptReferenceValidationError(
      "INFLUENCE_REFERENCE_EXCEEDS_ADMITTED",
      "referenced_object_count cannot exceed admitted_object_count.",
    );
  }

  return input.referenced_sources.map((source) => ({
    contribution_class: source.contribution_class,
    linkage_type: source.linkage_type,
    provenance: reader.getProvenanceEnvelope(
      input.execution_id,
      source.provenance_envelope_id,
      input.resolved_scope,
    ),
  }));
};
