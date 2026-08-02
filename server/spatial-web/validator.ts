import {
  SPATIAL_WEB_MEMORY_DESTINATION,
  SPATIAL_WEB_SCOPE_KEY,
  epistemicTypes,
  lifecycleStates,
  reviewTriggerTypes,
  type EngineProfileRecord,
  type ExperimentRecord,
  type MasonPromotionReceipt,
  type PromotionReceiptResolver,
  type ResearchIndexRecord,
  type ReviewTrigger,
  type SpatialMemoryCardRecord,
  type SpatialRecordType,
  type ValidationIssue,
  type ValidationResult,
} from "./contracts.ts";

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const nonEmptyArray = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;
const asRecord = (value: unknown) => (isRecord(value) ? value : {});

const issue = (code: ValidationIssue["code"], path: string, message: string): ValidationIssue => ({ code, path, message });

const finish = <T>(record: unknown, errors: ValidationIssue[]): ValidationResult<T> => ({
  valid: errors.length === 0,
  errors,
  value: errors.length === 0 ? record as T : null,
});

const requireString = (record: Record<string, unknown>, key: string, errors: ValidationIssue[], path = key) => {
  if (!nonEmptyString(record[key])) errors.push(issue("REQUIRED_FIELD", path, `${path} must be a non-empty string.`));
};

const validateId = (value: unknown, pattern: RegExp, path: string, errors: ValidationIssue[]) => {
  if (!nonEmptyString(value) || !pattern.test(value)) {
    errors.push(issue("INVALID_ID", path, `${path} does not match its registered identifier format.`));
  }
};

const validateScope = (value: unknown, errors: ValidationIssue[]) => {
  if (value !== SPATIAL_WEB_SCOPE_KEY) {
    errors.push(issue("INVALID_SCOPE", "scope_key", `scope_key must be ${SPATIAL_WEB_SCOPE_KEY}.`));
  }
};

const looksLikeEmbeddedPayload = (value: string) => {
  const trimmed = value.trim();
  if (/^(?:data|blob):/i.test(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{96,}={0,2}$/.test(trimmed)) return true;
  return false;
};

export const isDurableReference = (value: unknown): value is string => {
  if (!nonEmptyString(value) || value.length > 2048 || looksLikeEmbeddedPayload(value)) return false;
  const trimmed = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(trimmed)) return true;
  if (/^(?:urn|sha256|asset|execution|research|memory|repo|fixture):[A-Za-z0-9._:/#-]+$/i.test(trimmed)) return true;
  return /^[A-Za-z][A-Za-z0-9._:/#-]{2,255}$/.test(trimmed);
};

const validateReferenceArray = (value: unknown, path: string, errors: ValidationIssue[], minItems = 0) => {
  if (!Array.isArray(value)) {
    errors.push(issue("REQUIRED_FIELD", path, `${path} must be an array of durable references.`));
    return;
  }
  if (value.length < minItems) errors.push(issue("REQUIRED_FIELD", path, `${path} must contain at least ${minItems} reference(s).`));
  value.forEach((entry, index) => {
    if (typeof entry === "string" && looksLikeEmbeddedPayload(entry)) {
      errors.push(issue("EMBEDDED_ASSET_FORBIDDEN", `${path}[${index}]`, "Embedded data URIs, blob URLs, and raw base64 payloads are forbidden."));
    } else if (!isDurableReference(entry)) {
      errors.push(issue("INVALID_REFERENCE", `${path}[${index}]`, "Reference must be a bounded identifier or durable URL."));
    }
  });
};

const validateReviewTriggers = (value: unknown, path: string, errors: ValidationIssue[], required = true) => {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    errors.push(issue("VERSIONED_CLAIM_REQUIRES_REVIEW_TRIGGER", path, `${path} must contain at least one explicit review trigger.`));
    return;
  }
  value.forEach((entry, index) => {
    const trigger = asRecord(entry);
    if (!reviewTriggerTypes.includes(trigger.trigger_type as ReviewTrigger["trigger_type"])) {
      errors.push(issue("REQUIRED_FIELD", `${path}[${index}].trigger_type`, "Unknown review trigger type."));
    }
    if (!nonEmptyString(trigger.condition)) {
      errors.push(issue("REQUIRED_FIELD", `${path}[${index}].condition`, "Review trigger condition must be explicit."));
    }
  });
};

const hasVersionContext = (value: unknown) => {
  const context = asRecord(value);
  return [
    "engine",
    "engine_version",
    "browser",
    "browser_version",
    "web_api",
    "web_api_version",
    "backend",
  ].some((key) => nonEmptyString(context[key]));
};

const validateAuthority = (value: unknown, expected: string, errors: ValidationIssue[]) => {
  if (value !== expected) {
    errors.push(issue("AUTHORITY_STATE_VIOLATION", "authority_state", `authority_state must remain ${expected} in this contract.`));
  }
};

const validateEpistemicType = (value: unknown, allowed: string[], errors: ValidationIssue[]) => {
  if (!epistemicTypes.includes(value as never) || !allowed.includes(String(value))) {
    errors.push(issue("EPISTEMIC_TYPE_VIOLATION", "epistemic_type", `epistemic_type must be one of: ${allowed.join(", ")}.`));
  }
};

const validateSourceRefs = (value: unknown, errors: ValidationIssue[]) => {
  if (!nonEmptyArray(value)) {
    errors.push(issue("REQUIRED_FIELD", "source_refs", "source_refs must contain at least one source reference."));
    return;
  }
  value.forEach((entry, index) => {
    const source = asRecord(entry);
    requireString(source, "source_system", errors, `source_refs[${index}].source_system`);
    requireString(source, "source_id", errors, `source_refs[${index}].source_id`);
    if (source.source_url !== undefined && source.source_url !== null && !isDurableReference(source.source_url)) {
      errors.push(issue("INVALID_REFERENCE", `source_refs[${index}].source_url`, "source_url must be a durable URL or null."));
    }
  });
};

export const validateResearchIndex = (record: unknown): ValidationResult<ResearchIndexRecord> => {
  const errors: ValidationIssue[] = [];
  const data = asRecord(record);
  validateId(data.research_id, /^swr-[a-z0-9-]+$/, "research_id", errors);
  requireString(data, "title", errors);
  requireString(data, "research_track", errors);
  validateScope(data.scope_key, errors);
  if (!lifecycleStates.includes(data.lifecycle_state as never)) errors.push(issue("REQUIRED_FIELD", "lifecycle_state", "Unknown lifecycle state."));
  validateAuthority(data.authority_state, "NON_AUTHORITATIVE", errors);
  validateEpistemicType(data.epistemic_type, ["CLAIM", "OBSERVATION", "ACTION_RESULT", "VERIFICATION"], errors);

  const disclosure = asRecord(data.disclosure);
  if (!nonEmptyString(disclosure.l0)) errors.push(issue("INVALID_DISCLOSURE", "disclosure.l0", "L0 signal text is required."));
  if (disclosure.l1_ref !== null && disclosure.l1_ref !== undefined && !isDurableReference(disclosure.l1_ref)) {
    errors.push(issue("INVALID_REFERENCE", "disclosure.l1_ref", "L1 reference must be durable or null."));
  }
  validateReferenceArray(disclosure.l2_refs, "disclosure.l2_refs", errors);
  validateSourceRefs(data.source_refs, errors);
  validateReviewTriggers(data.review_triggers, "review_triggers", errors, true);
  if (hasVersionContext(data.version_context) && (!Array.isArray(data.review_triggers) || data.review_triggers.length === 0)) {
    errors.push(issue("VERSIONED_CLAIM_REQUIRES_REVIEW_TRIGGER", "review_triggers", "Version-sensitive research requires at least one review trigger."));
  }
  validateReferenceArray(data.related_asset_refs ?? [], "related_asset_refs", errors);

  if (data.promotion_state === "PROMOTED" || (data.promoted_memory_id !== null && data.promoted_memory_id !== undefined)) {
    errors.push(issue("INVALID_PROMOTION_STATE", "promotion_state", "Research cannot become promoted memory inside this slice."));
  }
  return finish<ResearchIndexRecord>(record, errors);
};

const receiptMatchesBinding = (
  receipt: MasonPromotionReceipt,
  memoryId: string,
  binding: Record<string, unknown>,
) => (
  receipt.verified === true
  && receipt.write_authorized === true
  && receipt.scope_key === SPATIAL_WEB_SCOPE_KEY
  && receipt.destination === SPATIAL_WEB_MEMORY_DESTINATION
  && receipt.promotion_target_id === memoryId
  && receipt.mason_episode_id === binding.mason_episode_id
  && receipt.write_plan_id === binding.write_plan_id
  && receipt.authorization_id === binding.authorization_id
  && receipt.receipt_fingerprint === binding.receipt_fingerprint
  && binding.scope_key === SPATIAL_WEB_SCOPE_KEY
  && binding.destination === SPATIAL_WEB_MEMORY_DESTINATION
  && binding.promotion_target_id === memoryId
);

export const validateSpatialMemoryCard = (
  record: unknown,
  resolveReceipt?: PromotionReceiptResolver,
): ValidationResult<SpatialMemoryCardRecord> => {
  const errors: ValidationIssue[] = [];
  const data = asRecord(record);
  validateId(data.memory_id, /^swm-[a-z0-9-]+$/, "memory_id", errors);
  requireString(data, "title", errors);
  requireString(data, "memory_class", errors);
  validateScope(data.scope_key, errors);
  validateEpistemicType(data.epistemic_type, ["DURABLE_FACT"], errors);
  if (data.authority_state !== "AUTHORITATIVE") {
    errors.push(issue("AUTHORITY_STATE_VIOLATION", "authority_state", "A promoted durable memory card must be AUTHORITATIVE."));
  }

  const applicability = asRecord(data.applicability);
  if (!nonEmptyArray(applicability.trigger_conditions)) {
    errors.push(issue("REQUIRED_FIELD", "applicability.trigger_conditions", "At least one trigger condition is required."));
  }
  const rule = asRecord(data.rule);
  requireString(rule, "statement", errors, "rule.statement");
  validateReferenceArray(data.evidence_refs, "evidence_refs", errors, 1);
  if (typeof data.confidence !== "number" || data.confidence < 0 || data.confidence > 1) {
    errors.push(issue("REQUIRED_FIELD", "confidence", "confidence must be between 0 and 1."));
  }
  validateReviewTriggers(data.review_triggers, "review_triggers", errors, true);
  validateReferenceArray(data.l2_evidence_refs ?? [], "l2_evidence_refs", errors);
  if (data.l1_operational_ref !== null && data.l1_operational_ref !== undefined && !isDurableReference(data.l1_operational_ref)) {
    errors.push(issue("INVALID_REFERENCE", "l1_operational_ref", "l1_operational_ref must be durable or null."));
  }

  if (!nonEmptyString(data.promotion_receipt_id)) {
    errors.push(issue("MISSING_MASON_PROMOTION_RECEIPT", "promotion_receipt_id", "A non-empty MASON promotion receipt ID is required."));
    errors.push(issue("UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION", "promotion_receipt_id", "Research cannot transition to memory without verified MASON authorization."));
    return finish<SpatialMemoryCardRecord>(record, errors);
  }

  const binding = asRecord(data.promotion_receipt_binding);
  ["mason_episode_id", "write_plan_id", "authorization_id", "scope_key", "destination", "promotion_target_id", "receipt_fingerprint"].forEach((field) => {
    requireString(binding, field, errors, `promotion_receipt_binding.${field}`);
  });

  const receipt = resolveReceipt?.(data.promotion_receipt_id) ?? null;
  if (!receipt || !receiptMatchesBinding(receipt, String(data.memory_id), binding)) {
    errors.push(issue("UNVERIFIED_MASON_PROMOTION_RECEIPT", "promotion_receipt_id", "Promotion receipt could not be independently resolved and matched to the exact memory target."));
    errors.push(issue("UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION", "promotion_receipt_id", "The memory transition remains unauthorized."));
  }
  return finish<SpatialMemoryCardRecord>(record, errors);
};

export const validateEngineProfile = (record: unknown): ValidationResult<EngineProfileRecord> => {
  const errors: ValidationIssue[] = [];
  const data = asRecord(record);
  validateId(data.profile_id, /^swep-[a-z0-9-]+$/, "profile_id", errors);
  requireString(data, "engine_name", errors);
  requireString(data, "profile_version", errors);
  if (!lifecycleStates.includes(data.lifecycle_state as never)) errors.push(issue("REQUIRED_FIELD", "lifecycle_state", "Unknown lifecycle state."));
  validateAuthority(data.authority_state, "NON_AUTHORITATIVE", errors);
  validateEpistemicType(data.epistemic_type, ["CLAIM", "OBSERVATION", "VERIFICATION"], errors);
  if (!nonEmptyArray(data.capability_claims)) errors.push(issue("REQUIRED_FIELD", "capability_claims", "At least one capability claim is required."));
  validateReferenceArray(data.evidence_refs, "evidence_refs", errors, 1);
  validateReviewTriggers(data.review_triggers, "review_triggers", errors, true);
  if (data.global_preferred === true) {
    errors.push(issue("GLOBAL_ENGINE_PREFERENCE_FORBIDDEN", "global_preferred", "Engine profiles cannot declare a universal preference."));
  }
  const selectionSignals = asRecord(data.selection_signals);
  if (selectionSignals.requires_project_decision !== true) {
    errors.push(issue("REQUIRED_FIELD", "selection_signals.requires_project_decision", "Engine selection must remain an explicit project decision."));
  }
  return finish<EngineProfileRecord>(record, errors);
};

export const validateExperimentRecord = (record: unknown): ValidationResult<ExperimentRecord> => {
  const errors: ValidationIssue[] = [];
  const data = asRecord(record);
  validateId(data.experiment_id, /^swx-[a-z0-9-]+$/, "experiment_id", errors);
  requireString(data, "hypothesis", errors);
  validateScope(data.scope_key, errors);
  if (!nonEmptyString(data.project_scope) || data.project_scope === SPATIAL_WEB_SCOPE_KEY) {
    errors.push(issue("PROJECT_SCOPE_REQUIRED", "project_scope", "A distinct registered project scope is required for experiment evidence."));
  }
  validateAuthority(data.authority_state, "NON_AUTHORITATIVE", errors);
  validateEpistemicType(data.epistemic_type, ["ACTION_RESULT", "OBSERVATION", "VERIFICATION"], errors);
  if (!nonEmptyArray(data.procedure)) errors.push(issue("REQUIRED_FIELD", "procedure", "Experiment procedure must contain at least one step."));
  if (!Array.isArray(data.observations)) errors.push(issue("REQUIRED_FIELD", "observations", "Observations must be an array."));
  validateReferenceArray(data.artifact_refs, "artifact_refs", errors);
  requireString(data, "execution_receipt_id", errors);
  if (data.promotion_state !== "NOT_EVALUATED") {
    errors.push(issue("INVALID_PROMOTION_STATE", "promotion_state", "Experiment evidence cannot promote itself."));
  }
  const environment = asRecord(data.environment);
  ["timestamp", "browser", "operating_system", "device_class", "gpu", "backend"].forEach((field) => {
    requireString(environment, field, errors, `environment.${field}`);
  });
  return finish<ExperimentRecord>(record, errors);
};

export const validateSpatialRecord = (
  type: SpatialRecordType,
  record: unknown,
  options: { resolveReceipt?: PromotionReceiptResolver } = {},
): ValidationResult<ResearchIndexRecord | SpatialMemoryCardRecord | EngineProfileRecord | ExperimentRecord> => {
  switch (type) {
    case "research_index": return validateResearchIndex(record);
    case "spatial_memory_card": return validateSpatialMemoryCard(record, options.resolveReceipt);
    case "engine_profile": return validateEngineProfile(record);
    case "experiment_record": return validateExperimentRecord(record);
    default:
      return {
        valid: false,
        errors: [issue("UNKNOWN_RECORD_TYPE", "record_type", `Unknown record type: ${String(type)}`)],
        value: null,
      };
  }
};
