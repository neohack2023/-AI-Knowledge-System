import type {
  EngineProfileRecord,
  ExperimentRecord,
  MasonPromotionReceipt,
  ResearchIndexRecord,
} from "./contracts.ts";
import { isAllowedSpatialReference } from "./strict-validator.ts";
import {
  spatialReadOperations,
  type ReadSourceEnvelope,
  type SpatialAdapterSnapshot,
  type SpatialReadAdapterDescriptor,
  type SpatialReadPorts,
  type SpatialReadRecordKind,
  type SpatialReadResult,
  SpatialReadAdapterContractError,
} from "./read-adapter-contracts.ts";

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
};

const cloneFrozen = <T>(value: T): Readonly<T> => deepFreeze(structuredClone(value));

const validateDescriptor = (descriptor: SpatialReadAdapterDescriptor) => {
  if (!/^spatial-read:[a-z0-9-]+$/.test(descriptor.adapter_id) || !nonEmptyString(descriptor.adapter_version)) {
    throw new SpatialReadAdapterContractError(
      "INVALID_ADAPTER_DESCRIPTOR",
      "descriptor",
      "Adapter ID and version must use the registered read-adapter format.",
    );
  }
  if (descriptor.mode !== "IMMUTABLE_SNAPSHOT" || descriptor.transport !== "PROCESS_LOCAL") {
    throw new SpatialReadAdapterContractError(
      "FORBIDDEN_ADAPTER_CAPABILITY",
      "descriptor.mode",
      "Foundation 03 permits immutable process-local snapshots only.",
    );
  }
  const forbiddenFlags = [
    descriptor.side_effects,
    descriptor.network_access,
    descriptor.mutation_access,
    descriptor.promotion_access,
    descriptor.execution_access,
    descriptor.secret_access,
  ];
  if (forbiddenFlags.some((flag) => flag !== false)) {
    throw new SpatialReadAdapterContractError(
      "FORBIDDEN_ADAPTER_CAPABILITY",
      "descriptor",
      "Read adapters cannot declare network, mutation, promotion, execution, secret, or side-effect access.",
    );
  }
  if (!Array.isArray(descriptor.source_systems) || descriptor.source_systems.length === 0) {
    throw new SpatialReadAdapterContractError(
      "INVALID_ADAPTER_DESCRIPTOR",
      "descriptor.source_systems",
      "At least one declared source system is required.",
    );
  }
  const operations = new Set(descriptor.operations);
  if (
    operations.size !== spatialReadOperations.length
    || spatialReadOperations.some((operation) => !operations.has(operation))
  ) {
    throw new SpatialReadAdapterContractError(
      "INVALID_ADAPTER_DESCRIPTOR",
      "descriptor.operations",
      "The immutable snapshot adapter must declare exactly the registered read operations.",
    );
  }
};

const recordIdentity = (
  kind: SpatialReadRecordKind,
  record: ResearchIndexRecord | EngineProfileRecord | ExperimentRecord | MasonPromotionReceipt,
) => {
  switch (kind) {
    case "RESEARCH_INDEX": return { id: (record as ResearchIndexRecord).research_id, scope: (record as ResearchIndexRecord).scope_key };
    case "ENGINE_PROFILE": return { id: (record as EngineProfileRecord).profile_id, scope: null };
    case "EXPERIMENT_RECORD": return { id: (record as ExperimentRecord).experiment_id, scope: (record as ExperimentRecord).scope_key };
    case "MASON_PROMOTION_RECEIPT": return { id: (record as MasonPromotionReceipt).receipt_id, scope: (record as MasonPromotionReceipt).scope_key };
  }
};

const validateEnvelope = <T extends ResearchIndexRecord | EngineProfileRecord | ExperimentRecord | MasonPromotionReceipt>(
  envelope: ReadSourceEnvelope<T>,
  expectedKind: SpatialReadRecordKind,
  path: string,
) => {
  if (envelope.record_kind !== expectedKind) {
    throw new SpatialReadAdapterContractError(
      "ENVELOPE_KIND_MISMATCH",
      `${path}.record_kind`,
      `Envelope kind must be ${expectedKind}.`,
    );
  }
  const identity = recordIdentity(expectedKind, envelope.record);
  if (!nonEmptyString(envelope.record_id) || envelope.record_id !== identity.id) {
    throw new SpatialReadAdapterContractError(
      "ENVELOPE_ID_MISMATCH",
      `${path}.record_id`,
      "Envelope record ID must exactly match the enclosed record.",
    );
  }
  if (!nonEmptyString(envelope.scope_key) || (identity.scope !== null && envelope.scope_key !== identity.scope)) {
    throw new SpatialReadAdapterContractError(
      "ENVELOPE_SCOPE_MISMATCH",
      `${path}.scope_key`,
      "Envelope scope must exactly match the enclosed record scope.",
    );
  }
  if (
    !/^sha256:[a-f0-9]{64}$/.test(envelope.source_fingerprint)
    || !isAllowedSpatialReference(envelope.source_locator)
  ) {
    throw new SpatialReadAdapterContractError(
      "INVALID_SOURCE_FINGERPRINT",
      `${path}.source_fingerprint`,
      "Envelope provenance requires a SHA-256 fingerprint and allowed durable source locator.",
    );
  }
  if (!nonEmptyString(envelope.source_system) || Number.isNaN(Date.parse(envelope.captured_at))) {
    throw new SpatialReadAdapterContractError(
      "INVALID_ADAPTER_DESCRIPTOR",
      path,
      "Envelope source system and capture timestamp are required.",
    );
  }
  if (envelope.immutable !== true) {
    throw new SpatialReadAdapterContractError(
      "FORBIDDEN_ADAPTER_CAPABILITY",
      `${path}.immutable`,
      "Snapshot envelopes must be immutable.",
    );
  }
};

const buildMap = <T extends ResearchIndexRecord | EngineProfileRecord | ExperimentRecord | MasonPromotionReceipt>(
  records: readonly ReadSourceEnvelope<T>[],
  kind: SpatialReadRecordKind,
  path: string,
) => {
  const map = new Map<string, ReadSourceEnvelope<T>>();
  records.forEach((envelope, index) => {
    validateEnvelope(envelope, kind, `${path}[${index}]`);
    if (map.has(envelope.record_id)) {
      throw new SpatialReadAdapterContractError(
        "DUPLICATE_RECORD_ID",
        `${path}[${index}].record_id`,
        `Duplicate record ID: ${envelope.record_id}`,
      );
    }
    map.set(envelope.record_id, cloneFrozen(envelope) as ReadSourceEnvelope<T>);
  });
  return map;
};

const found = <T>(requestedId: string, envelope: ReadSourceEnvelope<T>): SpatialReadResult<T> => ({
  status: "FOUND",
  requested_id: requestedId,
  envelope,
});

const notFound = <T>(requestedId: string, recordKind: SpatialReadRecordKind): SpatialReadResult<T> => ({
  status: "NOT_FOUND",
  requested_id: requestedId,
  record_kind: recordKind,
});

export class ImmutableSpatialSnapshotReadAdapter implements SpatialReadPorts {
  readonly descriptor: SpatialReadAdapterDescriptor;

  readonly #researchRecords: Map<string, ReadSourceEnvelope<ResearchIndexRecord>>;
  readonly #engineProfiles: Map<string, ReadSourceEnvelope<EngineProfileRecord>>;
  readonly #experimentRecords: Map<string, ReadSourceEnvelope<ExperimentRecord>>;
  readonly #masonReceipts: Map<string, ReadSourceEnvelope<MasonPromotionReceipt>>;

  constructor(snapshot: SpatialAdapterSnapshot) {
    validateDescriptor(snapshot.descriptor);
    this.descriptor = cloneFrozen(snapshot.descriptor) as SpatialReadAdapterDescriptor;
    this.#researchRecords = buildMap(snapshot.research_records, "RESEARCH_INDEX", "research_records");
    this.#engineProfiles = buildMap(snapshot.engine_profiles, "ENGINE_PROFILE", "engine_profiles");
    this.#experimentRecords = buildMap(snapshot.experiment_records, "EXPERIMENT_RECORD", "experiment_records");
    this.#masonReceipts = buildMap(snapshot.mason_receipts, "MASON_PROMOTION_RECEIPT", "mason_receipts");
  }

  async readResearchById(id: string): Promise<SpatialReadResult<ResearchIndexRecord>> {
    const envelope = this.#researchRecords.get(id);
    return envelope ? found(id, envelope) : notFound(id, "RESEARCH_INDEX");
  }

  async listResearchByScope(scopeKey: string): Promise<readonly ReadSourceEnvelope<ResearchIndexRecord>[]> {
    return Object.freeze(
      [...this.#researchRecords.values()]
        .filter((envelope) => envelope.scope_key === scopeKey)
        .sort((left, right) => left.record_id.localeCompare(right.record_id)),
    );
  }

  async readEngineProfileById(id: string): Promise<SpatialReadResult<EngineProfileRecord>> {
    const envelope = this.#engineProfiles.get(id);
    return envelope ? found(id, envelope) : notFound(id, "ENGINE_PROFILE");
  }

  async readExperimentById(id: string): Promise<SpatialReadResult<ExperimentRecord>> {
    const envelope = this.#experimentRecords.get(id);
    return envelope ? found(id, envelope) : notFound(id, "EXPERIMENT_RECORD");
  }

  async readMasonReceiptById(id: string): Promise<SpatialReadResult<MasonPromotionReceipt>> {
    const envelope = this.#masonReceipts.get(id);
    return envelope ? found(id, envelope) : notFound(id, "MASON_PROMOTION_RECEIPT");
  }
}
