import type {
  EngineProfileRecord,
  ExperimentRecord,
  PromotionReceiptResolver,
  ResearchIndexRecord,
  SpatialMemoryCardRecord,
  SpatialPacketAssemblyRequest,
  SpatialPacketAssemblyResult,
  ValidationIssue,
  ValidationResult,
} from "./contracts.ts";
import { assembleSpatialWebPacket } from "./packet-assembler.ts";
import {
  validateEngineProfile,
  validateExperimentRecord,
  validateResearchIndex,
  validateSpatialMemoryCard,
} from "./validator.ts";

const allowedHierarchicalSchemes = new Set([
  "asset",
  "execution",
  "fixture",
  "memory",
  "repo",
  "research",
  "source",
]);

const allowedOpaqueSchemes = new Set([
  "asset",
  "execution",
  "fixture",
  "memory",
  "repo",
  "research",
  "sha256",
  "source",
  "urn",
]);

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export const isAllowedSpatialReference = (value: unknown): value is string => {
  if (!nonEmptyString(value) || value.length > 2048) return false;
  const trimmed = value.trim();
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) return true;

  const hierarchical = /^([a-z][a-z0-9+.-]*):\/\/([^\s]+)$/i.exec(trimmed);
  if (hierarchical) return allowedHierarchicalSchemes.has(hierarchical[1].toLowerCase());

  const opaque = /^([a-z][a-z0-9+.-]*):([A-Za-z0-9._:/#-]+)$/i.exec(trimmed);
  if (opaque) return allowedOpaqueSchemes.has(opaque[1].toLowerCase());

  return /^[A-Za-z][A-Za-z0-9._:/#-]{2,255}$/.test(trimmed);
};

const invalidReferenceIssue = (path: string): ValidationIssue => ({
  code: "INVALID_REFERENCE",
  path,
  message: "Reference uses a disallowed or non-durable URI scheme.",
});

const collectReferenceIssues = (value: unknown, path: string): ValidationIssue[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => (
    isAllowedSpatialReference(entry) ? [] : [invalidReferenceIssue(`${path}[${index}]`)]
  ));
};

const mergeResult = <T>(base: ValidationResult<T>, extra: ValidationIssue[]): ValidationResult<T> => {
  const errors = [...base.errors, ...extra];
  return {
    valid: errors.length === 0,
    errors,
    value: errors.length === 0 ? base.value : null,
  };
};

export const validateResearchIndexStrict = (record: ResearchIndexRecord): ValidationResult<ResearchIndexRecord> => {
  const issues = [
    ...(record.disclosure.l1_ref && !isAllowedSpatialReference(record.disclosure.l1_ref)
      ? [invalidReferenceIssue("disclosure.l1_ref")]
      : []),
    ...collectReferenceIssues(record.disclosure.l2_refs, "disclosure.l2_refs"),
    ...collectReferenceIssues(record.related_asset_refs ?? [], "related_asset_refs"),
    ...record.source_refs.flatMap((source, index) => (
      source.source_url && !isAllowedSpatialReference(source.source_url)
        ? [invalidReferenceIssue(`source_refs[${index}].source_url`)]
        : []
    )),
  ];
  return mergeResult(validateResearchIndex(record), issues);
};

export const validateEngineProfileStrict = (record: EngineProfileRecord): ValidationResult<EngineProfileRecord> => {
  const issues = [
    ...collectReferenceIssues(record.evidence_refs, "evidence_refs"),
    ...record.capability_claims.flatMap((claim, index) => (
      collectReferenceIssues(claim.evidence_refs ?? [], `capability_claims[${index}].evidence_refs`)
    )),
  ];
  return mergeResult(validateEngineProfile(record), issues);
};

export const validateExperimentRecordStrict = (record: ExperimentRecord): ValidationResult<ExperimentRecord> => {
  const issues = [
    ...collectReferenceIssues(record.artifact_refs, "artifact_refs"),
    ...(!isAllowedSpatialReference(record.execution_receipt_id)
      ? [invalidReferenceIssue("execution_receipt_id")]
      : []),
  ];
  return mergeResult(validateExperimentRecord(record), issues);
};

export const validateSpatialMemoryCardStrict = (
  record: SpatialMemoryCardRecord,
  resolveReceipt?: PromotionReceiptResolver,
): ValidationResult<SpatialMemoryCardRecord> => {
  const strictResolver: PromotionReceiptResolver | undefined = resolveReceipt
    ? (requestedReceiptId) => {
        const resolved = resolveReceipt(requestedReceiptId);
        return resolved?.receipt_id === requestedReceiptId ? resolved : null;
      }
    : undefined;

  const issues = [
    ...collectReferenceIssues(record.evidence_refs, "evidence_refs"),
    ...collectReferenceIssues(record.l2_evidence_refs ?? [], "l2_evidence_refs"),
    ...(record.l1_operational_ref && !isAllowedSpatialReference(record.l1_operational_ref)
      ? [invalidReferenceIssue("l1_operational_ref")]
      : []),
  ];
  return mergeResult(validateSpatialMemoryCard(record, strictResolver), issues);
};

export const assembleSpatialWebPacketStrict = (
  request: SpatialPacketAssemblyRequest,
): SpatialPacketAssemblyResult => {
  const requested = request.requested_evidence_refs ?? [];
  const sanitized = requested.map((reference) => (
    isAllowedSpatialReference(reference) ? reference : "data:rejected-spatial-reference"
  ));
  return assembleSpatialWebPacket({
    ...request,
    requested_evidence_refs: sanitized,
  });
};
