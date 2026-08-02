import type {
  EngineProfileRecord,
  ExperimentRecord,
  ResearchIndexRecord,
  SpatialMemoryCardRecord,
  SpatialPacketAssemblyRequest,
  SpatialPacketAssemblyResult,
  ValidationIssue,
  ValidationResult,
} from "./contracts.ts";
import type {
  ReadSourceEnvelope,
  SpatialReadPorts,
} from "./read-adapter-contracts.ts";
import {
  assembleSpatialWebPacketStrict,
  validateEngineProfileStrict,
  validateExperimentRecordStrict,
  validateResearchIndexStrict,
  validateSpatialMemoryCardStrict,
} from "./strict-validator.ts";

export const spatialReadServiceIssueCodes = [
  "RECORD_NOT_FOUND",
  "ENVELOPE_SCOPE_MISMATCH",
  "RECORD_VALIDATION_FAILED",
  "RECEIPT_NOT_FOUND",
  "PACKET_INPUT_REJECTED",
] as const;
export type SpatialReadServiceIssueCode = (typeof spatialReadServiceIssueCodes)[number];

export type SpatialReadServiceIssue = {
  code: SpatialReadServiceIssueCode;
  path: string;
  message: string;
  validation_errors?: ValidationIssue[];
};

export type ValidatedSourceRecord<T> = {
  status: "VALIDATED";
  envelope: ReadSourceEnvelope<T>;
  record: T;
};

export type RejectedSourceRecord = {
  status: "REJECTED";
  issues: SpatialReadServiceIssue[];
};

export type SpatialValidatedRead<T> = ValidatedSourceRecord<T> | RejectedSourceRecord;

export type SpatialValidatedPacketResult = {
  status: "VALIDATED";
  packet: SpatialPacketAssemblyResult;
  research_records: readonly ReadSourceEnvelope<ResearchIndexRecord>[];
  engine_profiles: readonly ReadSourceEnvelope<EngineProfileRecord>[];
  experiment_records: readonly ReadSourceEnvelope<ExperimentRecord>[];
} | {
  status: "REJECTED";
  issues: SpatialReadServiceIssue[];
};

export type SpatialValidatedPacketRequest = {
  packet_request: SpatialPacketAssemblyRequest;
  research_ids?: readonly string[];
  engine_profile_ids?: readonly string[];
  experiment_ids?: readonly string[];
};

const notFoundIssue = (path: string, id: string): SpatialReadServiceIssue => ({
  code: "RECORD_NOT_FOUND",
  path,
  message: `No immutable source record exists for ${id}.`,
});

const scopeIssue = (path: string, expectedScope: string, actualScope: string): SpatialReadServiceIssue => ({
  code: "ENVELOPE_SCOPE_MISMATCH",
  path,
  message: `Expected scope ${expectedScope}, received ${actualScope}.`,
});

const validationIssue = (path: string, result: ValidationResult<unknown>): SpatialReadServiceIssue => ({
  code: "RECORD_VALIDATION_FAILED",
  path,
  message: "The retrieved source record failed strict validation.",
  validation_errors: result.errors,
});

const assertScope = <T>(
  envelope: ReadSourceEnvelope<T>,
  expectedScope: string,
  path: string,
): SpatialReadServiceIssue[] => (
  envelope.scope_key === expectedScope
    ? []
    : [scopeIssue(path, expectedScope, envelope.scope_key)]
);

const uniqueSorted = (values: readonly string[]) => [...new Set(values)].sort();

export class SpatialReadValidationService {
  readonly #ports: SpatialReadPorts;

  constructor(ports: SpatialReadPorts) {
    this.#ports = ports;
  }

  get descriptor() {
    return this.#ports.descriptor;
  }

  async readValidatedResearch(id: string, expectedScope: string): Promise<SpatialValidatedRead<ResearchIndexRecord>> {
    const result = await this.#ports.readResearchById(id);
    if (result.status === "NOT_FOUND") {
      return { status: "REJECTED", issues: [notFoundIssue("research_id", id)] };
    }
    const scopeIssues = assertScope(result.envelope, expectedScope, "research.scope_key");
    const validation = validateResearchIndexStrict(result.envelope.record);
    const issues = [
      ...scopeIssues,
      ...(validation.valid ? [] : [validationIssue("research", validation)]),
    ];
    return issues.length > 0
      ? { status: "REJECTED", issues }
      : { status: "VALIDATED", envelope: result.envelope, record: result.envelope.record };
  }

  async readValidatedEngineProfile(id: string, expectedScope: string): Promise<SpatialValidatedRead<EngineProfileRecord>> {
    const result = await this.#ports.readEngineProfileById(id);
    if (result.status === "NOT_FOUND") {
      return { status: "REJECTED", issues: [notFoundIssue("profile_id", id)] };
    }
    const scopeIssues = assertScope(result.envelope, expectedScope, "engine_profile.scope_key");
    const validation = validateEngineProfileStrict(result.envelope.record);
    const issues = [
      ...scopeIssues,
      ...(validation.valid ? [] : [validationIssue("engine_profile", validation)]),
    ];
    return issues.length > 0
      ? { status: "REJECTED", issues }
      : { status: "VALIDATED", envelope: result.envelope, record: result.envelope.record };
  }

  async readValidatedExperiment(id: string, expectedScope: string): Promise<SpatialValidatedRead<ExperimentRecord>> {
    const result = await this.#ports.readExperimentById(id);
    if (result.status === "NOT_FOUND") {
      return { status: "REJECTED", issues: [notFoundIssue("experiment_id", id)] };
    }
    const scopeIssues = assertScope(result.envelope, expectedScope, "experiment.scope_key");
    const validation = validateExperimentRecordStrict(result.envelope.record);
    const issues = [
      ...scopeIssues,
      ...(validation.valid ? [] : [validationIssue("experiment", validation)]),
    ];
    return issues.length > 0
      ? { status: "REJECTED", issues }
      : { status: "VALIDATED", envelope: result.envelope, record: result.envelope.record };
  }

  async validateMemoryCandidate(record: SpatialMemoryCardRecord): Promise<ValidationResult<SpatialMemoryCardRecord>> {
    const receiptResult = await this.#ports.readMasonReceiptById(record.promotion_receipt_id);
    if (receiptResult.status === "NOT_FOUND") {
      return validateSpatialMemoryCardStrict(record);
    }
    if (receiptResult.envelope.scope_key !== record.scope_key) {
      return {
        valid: false,
        value: null,
        errors: [{
          code: "UNVERIFIED_MASON_PROMOTION_RECEIPT",
          path: "promotion_receipt_id",
          message: "Receipt envelope scope does not match the memory candidate scope.",
        }, {
          code: "UNAUTHORIZED_RESEARCH_TO_MEMORY_TRANSITION",
          path: "promotion_receipt_id",
          message: "The memory transition remains unauthorized.",
        }],
      };
    }
    return validateSpatialMemoryCardStrict(
      record,
      (requestedId) => requestedId === receiptResult.envelope.record.receipt_id
        ? receiptResult.envelope.record
        : null,
    );
  }

  async assembleValidatedPacket(request: SpatialValidatedPacketRequest): Promise<SpatialValidatedPacketResult> {
    const expectedScope = request.packet_request.scope_key;
    const issues: SpatialReadServiceIssue[] = [];
    const researchRecords: ReadSourceEnvelope<ResearchIndexRecord>[] = [];
    const engineProfiles: ReadSourceEnvelope<EngineProfileRecord>[] = [];
    const experimentRecords: ReadSourceEnvelope<ExperimentRecord>[] = [];

    for (const id of uniqueSorted(request.research_ids ?? [])) {
      const result = await this.readValidatedResearch(id, expectedScope);
      if (result.status === "REJECTED") issues.push(...result.issues);
      else researchRecords.push(result.envelope);
    }
    for (const id of uniqueSorted(request.engine_profile_ids ?? [])) {
      const result = await this.readValidatedEngineProfile(id, expectedScope);
      if (result.status === "REJECTED") issues.push(...result.issues);
      else engineProfiles.push(result.envelope);
    }
    for (const id of uniqueSorted(request.experiment_ids ?? [])) {
      const result = await this.readValidatedExperiment(id, expectedScope);
      if (result.status === "REJECTED") issues.push(...result.issues);
      else experimentRecords.push(result.envelope);
    }

    if (issues.length > 0) {
      return {
        status: "REJECTED",
        issues: [{
          code: "PACKET_INPUT_REJECTED",
          path: "packet_request",
          message: "At least one requested source record failed retrieval or validation.",
        }, ...issues],
      };
    }

    const packet = assembleSpatialWebPacketStrict({
      ...request.packet_request,
      engine_profiles: engineProfiles.map((envelope) => envelope.record),
    });

    return {
      status: "VALIDATED",
      packet,
      research_records: Object.freeze(researchRecords),
      engine_profiles: Object.freeze(engineProfiles),
      experiment_records: Object.freeze(experimentRecords),
    };
  }
}
