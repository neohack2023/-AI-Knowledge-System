import type {
  EngineProfileRecord,
  ExperimentRecord,
  MasonPromotionReceipt,
  ResearchIndexRecord,
  SpatialAuthorityState,
  SpatialEpistemicType,
} from "./contracts.ts";

export const spatialReadOperations = [
  "READ_RESEARCH_BY_ID",
  "LIST_RESEARCH_BY_SCOPE",
  "READ_ENGINE_PROFILE_BY_ID",
  "READ_EXPERIMENT_BY_ID",
  "READ_MASON_RECEIPT_BY_ID",
] as const;
export type SpatialReadOperation = (typeof spatialReadOperations)[number];

export const spatialReadRecordKinds = [
  "RESEARCH_INDEX",
  "ENGINE_PROFILE",
  "EXPERIMENT_RECORD",
  "MASON_PROMOTION_RECEIPT",
] as const;
export type SpatialReadRecordKind = (typeof spatialReadRecordKinds)[number];

export type SpatialReadAdapterDescriptor = {
  adapter_id: string;
  adapter_version: string;
  mode: "IMMUTABLE_SNAPSHOT";
  transport: "PROCESS_LOCAL";
  operations: readonly SpatialReadOperation[];
  source_systems: readonly string[];
  side_effects: false;
  network_access: false;
  mutation_access: false;
  promotion_access: false;
  execution_access: false;
  secret_access: false;
};

export type ReadSourceEnvelope<T> = {
  record_kind: SpatialReadRecordKind;
  record_id: string;
  scope_key: string;
  source_system: string;
  source_locator: string;
  source_version: string | null;
  source_fingerprint: string;
  captured_at: string;
  immutable: true;
  authority_state: SpatialAuthorityState;
  epistemic_type: SpatialEpistemicType;
  record: T;
};

export type SpatialReadFound<T> = {
  status: "FOUND";
  requested_id: string;
  envelope: ReadSourceEnvelope<T>;
};

export type SpatialReadNotFound = {
  status: "NOT_FOUND";
  requested_id: string;
  record_kind: SpatialReadRecordKind;
};

export type SpatialReadResult<T> = SpatialReadFound<T> | SpatialReadNotFound;

export type SpatialAdapterSnapshot = {
  descriptor: SpatialReadAdapterDescriptor;
  research_records: readonly ReadSourceEnvelope<ResearchIndexRecord>[];
  engine_profiles: readonly ReadSourceEnvelope<EngineProfileRecord>[];
  experiment_records: readonly ReadSourceEnvelope<ExperimentRecord>[];
  mason_receipts: readonly ReadSourceEnvelope<MasonPromotionReceipt>[];
};

export interface SpatialResearchReadPort {
  readonly descriptor: SpatialReadAdapterDescriptor;
  readResearchById(id: string): Promise<SpatialReadResult<ResearchIndexRecord>>;
  listResearchByScope(scopeKey: string): Promise<readonly ReadSourceEnvelope<ResearchIndexRecord>[]>;
  readEngineProfileById(id: string): Promise<SpatialReadResult<EngineProfileRecord>>;
  readExperimentById(id: string): Promise<SpatialReadResult<ExperimentRecord>>;
}

export interface MasonReceiptReadPort {
  readonly descriptor: SpatialReadAdapterDescriptor;
  readMasonReceiptById(id: string): Promise<SpatialReadResult<MasonPromotionReceipt>>;
}

export type SpatialReadPorts = SpatialResearchReadPort & MasonReceiptReadPort;

export const adapterContractErrorCodes = [
  "INVALID_ADAPTER_DESCRIPTOR",
  "FORBIDDEN_ADAPTER_CAPABILITY",
  "DUPLICATE_RECORD_ID",
  "ENVELOPE_KIND_MISMATCH",
  "ENVELOPE_ID_MISMATCH",
  "ENVELOPE_SCOPE_MISMATCH",
  "INVALID_SOURCE_FINGERPRINT",
] as const;
export type AdapterContractErrorCode = (typeof adapterContractErrorCodes)[number];

export class SpatialReadAdapterContractError extends Error {
  readonly code: AdapterContractErrorCode;
  readonly path: string;

  constructor(code: AdapterContractErrorCode, path: string, message: string) {
    super(message);
    this.name = "SpatialReadAdapterContractError";
    this.code = code;
    this.path = path;
  }
}
