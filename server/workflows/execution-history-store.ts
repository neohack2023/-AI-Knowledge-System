import {
  assertDurableExecutionHistoryBundle,
  assertDurablePersistenceAvailable,
  type DurableExecutionHistoryBundle,
  type DurableExecutionRecord,
  type ExecutionHistoryBackendState,
  type ExecutionHistoryIdentity,
} from "../../shared/execution-history.ts";

export type ExecutionHistoryListQuery = {
  scope_key: string;
  capability_id?: string;
  mode?: "LIVE" | "SIMULATION";
  limit?: number;
};

export class ExecutionHistoryConflictError extends Error {
  readonly code = "EXECUTION_HISTORY_CONFLICT" as const;

  constructor(message = "Durable execution history changed concurrently; refresh and retry from the latest durable state.") {
    super(message);
    this.name = "ExecutionHistoryConflictError";
  }
}

export interface ExecutionHistoryStore {
  readonly backend: "D1";
  getBackendState(): ExecutionHistoryBackendState;
  persist(bundle: DurableExecutionHistoryBundle): Promise<void>;
  persistMany(bundles: DurableExecutionHistoryBundle[]): Promise<void>;
  get(identity: ExecutionHistoryIdentity): Promise<DurableExecutionHistoryBundle | null>;
  getByExecutionId(executionId: string): Promise<DurableExecutionHistoryBundle | null>;
  list(query: ExecutionHistoryListQuery): Promise<DurableExecutionRecord[]>;
}

export class UnavailableExecutionHistoryStore implements ExecutionHistoryStore {
  readonly backend = "D1" as const;

  constructor(
    private readonly reasonCode: Exclude<ExecutionHistoryBackendState["reason_code"], null>
      = "D1_BINDING_UNAVAILABLE",
  ) {}

  getBackendState(): ExecutionHistoryBackendState {
    return {
      backend: "D1",
      state: "DURABLE_UNAVAILABLE",
      reason_code: this.reasonCode,
    };
  }

  async persist(_bundle: DurableExecutionHistoryBundle): Promise<void> {
    assertDurablePersistenceAvailable(this.getBackendState());
  }

  async persistMany(_bundles: DurableExecutionHistoryBundle[]): Promise<void> {
    assertDurablePersistenceAvailable(this.getBackendState());
  }

  async get(_identity: ExecutionHistoryIdentity): Promise<DurableExecutionHistoryBundle | null> {
    assertDurablePersistenceAvailable(this.getBackendState());
    return null;
  }

  async getByExecutionId(_executionId: string): Promise<DurableExecutionHistoryBundle | null> {
    assertDurablePersistenceAvailable(this.getBackendState());
    return null;
  }

  async list(_query: ExecutionHistoryListQuery): Promise<DurableExecutionRecord[]> {
    assertDurablePersistenceAvailable(this.getBackendState());
    return [];
  }
}

export const assertExecutionHistoryListQuery = (query: ExecutionHistoryListQuery) => {
  if (typeof query.scope_key !== "string" || query.scope_key.trim().length === 0) {
    throw new TypeError("execution history list scope_key must be a non-empty string.");
  }
  if (
    query.capability_id !== undefined
    && (typeof query.capability_id !== "string" || query.capability_id.trim().length === 0)
  ) {
    throw new TypeError("execution history list capability_id must be a non-empty string when provided.");
  }
  if (query.mode !== undefined && query.mode !== "LIVE" && query.mode !== "SIMULATION") {
    throw new TypeError("execution history list mode must be LIVE or SIMULATION when provided.");
  }
  if (
    query.limit !== undefined
    && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 200)
  ) {
    throw new TypeError("execution history list limit must be a safe integer from 1 through 200.");
  }
};

export const persistDurableExecutionHistory = async (
  store: ExecutionHistoryStore,
  bundle: DurableExecutionHistoryBundle,
) => {
  assertDurablePersistenceAvailable(store.getBackendState());
  assertDurableExecutionHistoryBundle(bundle);
  await store.persist(structuredClone(bundle));
};

export const persistManyDurableExecutionHistories = async (
  store: ExecutionHistoryStore,
  bundles: DurableExecutionHistoryBundle[],
) => {
  assertDurablePersistenceAvailable(store.getBackendState());
  bundles.forEach(assertDurableExecutionHistoryBundle);
  await store.persistMany(structuredClone(bundles));
};

export const readDurableExecutionHistory = async (
  store: ExecutionHistoryStore,
  identity: ExecutionHistoryIdentity,
) => {
  assertDurablePersistenceAvailable(store.getBackendState());
  const result = await store.get(structuredClone(identity));
  if (result === null) return null;
  assertDurableExecutionHistoryBundle(result);
  return structuredClone(result);
};

export const readDurableExecutionHistoryById = async (
  store: ExecutionHistoryStore,
  executionId: string,
) => {
  assertDurablePersistenceAvailable(store.getBackendState());
  if (typeof executionId !== "string" || executionId.trim().length === 0) {
    throw new TypeError("execution_id must be a non-empty string.");
  }
  const result = await store.getByExecutionId(executionId);
  if (result === null) return null;
  assertDurableExecutionHistoryBundle(result);
  return structuredClone(result);
};

export const listDurableExecutionHistory = async (
  store: ExecutionHistoryStore,
  query: ExecutionHistoryListQuery,
) => {
  assertDurablePersistenceAvailable(store.getBackendState());
  assertExecutionHistoryListQuery(query);
  return structuredClone(await store.list(structuredClone(query)));
};
