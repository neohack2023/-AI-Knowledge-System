export const executionHistorySchema = {
  name: "AIOSDurableExecutionHistory",
  version: "0.1",
} as const;

export const executionHistoryModes = ["LIVE", "SIMULATION"] as const;
export type ExecutionHistoryMode = (typeof executionHistoryModes)[number];

export const executionHistoryStatuses = [
  "QUEUED",
  "RUNNING",
  "WAITING",
  "APPROVAL_REQUIRED",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
] as const;
export type ExecutionHistoryStatus = (typeof executionHistoryStatuses)[number];

export const executionHistoryLinkTypes = [
  "PROVENANCE",
  "ARTIFACT",
  "APPROVAL",
  "RECEIPT",
  "TOUCHED_RESOURCE",
  "RELATED_EXECUTION",
] as const;
export type ExecutionHistoryLinkType = (typeof executionHistoryLinkTypes)[number];

export const executionHistorySourceSystems = [
  "GitHub",
  "Notion",
  "Google_Drive",
  "runtime",
] as const;
export type ExecutionHistorySourceSystem = (typeof executionHistorySourceSystems)[number];

export const executionHistoryAuthorityStates = [
  "authoritative",
  "shadow",
  "execution_truth",
  "observational",
] as const;
export type ExecutionHistoryAuthorityState = (typeof executionHistoryAuthorityStates)[number];

export const executionHistoryPersistenceStates = [
  "DURABLE_AVAILABLE",
  "DURABLE_UNAVAILABLE",
] as const;
export type ExecutionHistoryPersistenceState = (typeof executionHistoryPersistenceStates)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ExecutionHistoryIdentity = {
  execution_id: string;
  scope_key: string;
  capability_id: string;
};

export type DurableExecutionRecord = ExecutionHistoryIdentity & {
  schema_name: typeof executionHistorySchema.name;
  schema_version: typeof executionHistorySchema.version;
  workflow_id: string;
  trace_id: string | null;
  requested_by: string | null;
  parent_execution_id: string | null;
  mode: ExecutionHistoryMode;
  status: ExecutionHistoryStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  current_stage: string | null;
  input: JsonObject;
  output: JsonObject | null;
  error: { code: string; message: string } | null;
  result_class: string | null;
  authority_owner: string;
  authority_domain: string;
  authority_state: ExecutionHistoryAuthorityState;
};

export type DurableExecutionEvent = ExecutionHistoryIdentity & {
  event_id: string;
  workflow_id: string;
  event_type: string;
  status: ExecutionHistoryStatus;
  stage: string | null;
  sequence: number;
  emitted_at: string;
  data: JsonObject | null;
};

export type DurableExecutionLink = ExecutionHistoryIdentity & {
  link_id: string;
  link_type: ExecutionHistoryLinkType;
  target_id: string;
  source_system: ExecutionHistorySourceSystem;
  authority_owner: string;
  authority_domain: string;
  authority_state: ExecutionHistoryAuthorityState;
  created_at: string;
  metadata: JsonObject;
};

export type DurableExecutionHistoryBundle = {
  execution: DurableExecutionRecord;
  events: DurableExecutionEvent[];
  links: DurableExecutionLink[];
};

export type ExecutionHistoryBackendState = {
  backend: "D1";
  state: ExecutionHistoryPersistenceState;
  reason_code: null | "D1_BINDING_UNAVAILABLE" | "D1_WRITE_FAILED" | "D1_READ_FAILED";
};

export const executionHistoryErrorCodes = [
  "EXECUTION_HISTORY_IDENTITY_INVALID",
  "EXECUTION_HISTORY_SCHEMA_INVALID",
  "EXECUTION_HISTORY_MODE_INVALID",
  "EXECUTION_HISTORY_STATUS_INVALID",
  "EXECUTION_HISTORY_BINDING_MISMATCH",
  "EXECUTION_HISTORY_MODE_COLLISION",
  "EXECUTION_HISTORY_SEQUENCE_INVALID",
  "EXECUTION_HISTORY_DUPLICATE_SEQUENCE",
  "EXECUTION_HISTORY_DUPLICATE_EVENT_ID",
  "EXECUTION_HISTORY_DUPLICATE_LINK_ID",
  "EXECUTION_HISTORY_LINK_INVALID",
  "EXECUTION_HISTORY_JSON_UNSAFE",
  "EXECUTION_HISTORY_TIMESTAMP_INVALID",
  "EXECUTION_HISTORY_DURABILITY_UNAVAILABLE",
] as const;
export type ExecutionHistoryErrorCode = (typeof executionHistoryErrorCodes)[number];

export class ExecutionHistoryContractError extends Error {
  constructor(
    readonly code: ExecutionHistoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionHistoryContractError";
  }
}

const modeSet = new Set<string>(executionHistoryModes);
const statusSet = new Set<string>(executionHistoryStatuses);
const linkTypeSet = new Set<string>(executionHistoryLinkTypes);
const sourceSystemSet = new Set<string>(executionHistorySourceSystems);
const authorityStateSet = new Set<string>(executionHistoryAuthorityStates);

const requireText = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_IDENTITY_INVALID",
      `${field} must be a non-empty string.`,
    );
  }
};

const assertIsoTimestamp = (value: string | null, field: string) => {
  if (value === null) return;
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Date.parse(value))) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_TIMESTAMP_INVALID",
      `${field} must be null or a valid timestamp.`,
    );
  }
};

const assertJsonSafeValue = (
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_JSON_UNSAFE",
      `${path} contains a non-finite number.`,
    );
  }
  if (typeof value !== "object") {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_JSON_UNSAFE",
      `${path} contains a non-JSON value.`,
    );
  }
  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_JSON_UNSAFE",
      `${path} contains a circular reference.`,
    );
  }
  ancestors.add(objectValue);
  try {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => assertJsonSafeValue(entry, `${path}[${index}]`, ancestors));
      return;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ExecutionHistoryContractError(
        "EXECUTION_HISTORY_JSON_UNSAFE",
        `${path} must contain only plain JSON objects.`,
      );
    }
    for (const [key, entry] of Object.entries(value)) {
      assertJsonSafeValue(entry, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(objectValue);
  }
};

export const assertJsonSafe = (value: unknown, path = "payload") => {
  assertJsonSafeValue(value, path, new Set<object>());
};

export const assertExecutionHistoryIdentity = (identity: ExecutionHistoryIdentity) => {
  requireText(identity.execution_id, "execution_id");
  requireText(identity.scope_key, "scope_key");
  requireText(identity.capability_id, "capability_id");
};

const identityKey = (identity: ExecutionHistoryIdentity) =>
  `${identity.execution_id}\u0000${identity.scope_key}\u0000${identity.capability_id}`;

export const sameExecutionHistoryIdentity = (
  left: ExecutionHistoryIdentity,
  right: ExecutionHistoryIdentity,
) => identityKey(left) === identityKey(right);

export const assertExecutionHistoryBinding = (
  parent: ExecutionHistoryIdentity,
  child: ExecutionHistoryIdentity,
  label: string,
) => {
  assertExecutionHistoryIdentity(parent);
  assertExecutionHistoryIdentity(child);
  if (!sameExecutionHistoryIdentity(parent, child)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_BINDING_MISMATCH",
      `${label} does not match the parent execution_id + scope_key + capability_id binding.`,
    );
  }
};

export const assertDurableExecutionRecord = (record: DurableExecutionRecord) => {
  assertExecutionHistoryIdentity(record);
  if (
    record.schema_name !== executionHistorySchema.name
    || record.schema_version !== executionHistorySchema.version
  ) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_SCHEMA_INVALID",
      "Execution history record schema is not supported.",
    );
  }
  requireText(record.workflow_id, "workflow_id");
  requireText(record.authority_owner, "authority_owner");
  requireText(record.authority_domain, "authority_domain");
  if (!modeSet.has(record.mode)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_MODE_INVALID",
      `Unsupported execution mode '${record.mode}'.`,
    );
  }
  if (!statusSet.has(record.status)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_STATUS_INVALID",
      `Unsupported execution status '${record.status}'.`,
    );
  }
  if (!authorityStateSet.has(record.authority_state)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_SCHEMA_INVALID",
      `Unsupported authority_state '${record.authority_state}'.`,
    );
  }
  assertIsoTimestamp(record.created_at, "created_at");
  assertIsoTimestamp(record.started_at, "started_at");
  assertIsoTimestamp(record.completed_at, "completed_at");
  assertJsonSafe(record.input, "input");
  if (record.output !== null) assertJsonSafe(record.output, "output");
  if (record.error !== null) assertJsonSafe(record.error, "error");
};

export const assertDurableExecutionEvent = (
  execution: DurableExecutionRecord,
  event: DurableExecutionEvent,
) => {
  assertExecutionHistoryBinding(execution, event, `event '${event.event_id}'`);
  requireText(event.event_id, "event_id");
  requireText(event.workflow_id, "event.workflow_id");
  requireText(event.event_type, "event_type");
  if (event.workflow_id !== execution.workflow_id) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_BINDING_MISMATCH",
      `event '${event.event_id}' workflow_id does not match the parent execution.`,
    );
  }
  if (!statusSet.has(event.status)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_STATUS_INVALID",
      `Unsupported event status '${event.status}'.`,
    );
  }
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_SEQUENCE_INVALID",
      `event '${event.event_id}' sequence must be a positive safe integer.`,
    );
  }
  assertIsoTimestamp(event.emitted_at, "event.emitted_at");
  if (event.data !== null) assertJsonSafe(event.data, `event.${event.event_id}.data`);
};

export const assertDurableExecutionLink = (
  execution: DurableExecutionRecord,
  link: DurableExecutionLink,
) => {
  assertExecutionHistoryBinding(execution, link, `link '${link.link_id}'`);
  requireText(link.link_id, "link_id");
  requireText(link.target_id, "target_id");
  requireText(link.authority_owner, "link.authority_owner");
  requireText(link.authority_domain, "link.authority_domain");
  if (!linkTypeSet.has(link.link_type) || !sourceSystemSet.has(link.source_system)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_LINK_INVALID",
      `link '${link.link_id}' has an unsupported link type or source system.`,
    );
  }
  if (!authorityStateSet.has(link.authority_state)) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_LINK_INVALID",
      `link '${link.link_id}' has an unsupported authority_state.`,
    );
  }
  assertIsoTimestamp(link.created_at, "link.created_at");
  assertJsonSafe(link.metadata, `link.${link.link_id}.metadata`);
};

export const assertDurableExecutionHistoryBundle = (
  bundle: DurableExecutionHistoryBundle,
) => {
  assertDurableExecutionRecord(bundle.execution);
  const eventIds = new Set<string>();
  const eventSequences = new Set<number>();
  for (const event of bundle.events) {
    assertDurableExecutionEvent(bundle.execution, event);
    if (eventIds.has(event.event_id)) {
      throw new ExecutionHistoryContractError(
        "EXECUTION_HISTORY_DUPLICATE_EVENT_ID",
        `Duplicate event_id '${event.event_id}'.`,
      );
    }
    if (eventSequences.has(event.sequence)) {
      throw new ExecutionHistoryContractError(
        "EXECUTION_HISTORY_DUPLICATE_SEQUENCE",
        `Duplicate event sequence '${event.sequence}'.`,
      );
    }
    eventIds.add(event.event_id);
    eventSequences.add(event.sequence);
  }
  const linkIds = new Set<string>();
  for (const link of bundle.links) {
    assertDurableExecutionLink(bundle.execution, link);
    if (linkIds.has(link.link_id)) {
      throw new ExecutionHistoryContractError(
        "EXECUTION_HISTORY_DUPLICATE_LINK_ID",
        `Duplicate link_id '${link.link_id}'.`,
      );
    }
    linkIds.add(link.link_id);
  }
};

export const assertExecutionHistoryModeConsistency = (
  existing: DurableExecutionRecord,
  incoming: DurableExecutionRecord,
) => {
  if (existing.execution_id !== incoming.execution_id) return;
  if (existing.mode !== incoming.mode) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_MODE_COLLISION",
      `execution_id '${existing.execution_id}' cannot change from ${existing.mode} to ${incoming.mode}.`,
    );
  }
  assertExecutionHistoryBinding(existing, incoming, `execution '${incoming.execution_id}'`);
};

export const assertDurablePersistenceAvailable = (state: ExecutionHistoryBackendState) => {
  if (state.backend !== "D1" || state.state !== "DURABLE_AVAILABLE" || state.reason_code !== null) {
    throw new ExecutionHistoryContractError(
      "EXECUTION_HISTORY_DURABILITY_UNAVAILABLE",
      `Durable execution history is unavailable (${state.reason_code ?? "UNKNOWN_BACKEND_STATE"}).`,
    );
  }
};
