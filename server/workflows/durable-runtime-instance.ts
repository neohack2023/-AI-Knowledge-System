import { capabilityDiscoveryRuntime } from "../capabilities/index.ts";
import { D1ExecutionHistoryStore, type D1DatabaseLike } from "./d1-execution-history-store.ts";
import { DurableWorkflowRuntime, capabilityResolverFromRegistry } from "./durable-runtime.ts";
import { UnavailableExecutionHistoryStore, type ExecutionHistoryStore } from "./execution-history-store.ts";
import { workflowExecutionKernel } from "./kernel.ts";

type RuntimeEnv = { DB?: D1DatabaseLike };
type DurableRuntimeGlobal = typeof globalThis & {
  __aiKnowledgeDurableExecutionHistoryStorePromise?: Promise<ExecutionHistoryStore>;
  __aiKnowledgeDurableWorkflowRuntimePromise?: Promise<DurableWorkflowRuntime>;
};

const runtimeGlobal = globalThis as DurableRuntimeGlobal;

const loadRuntimeEnv = async (): Promise<RuntimeEnv> => {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as RuntimeEnv;
  } catch {
    return {};
  }
};

const createStore = async (): Promise<ExecutionHistoryStore> => {
  const runtimeEnv = await loadRuntimeEnv();
  const db = runtimeEnv.DB;
  if (!db) return new UnavailableExecutionHistoryStore("D1_BINDING_UNAVAILABLE");
  const store = await new D1ExecutionHistoryStore(db).initialize();
  if (store.getBackendState().state !== "DURABLE_AVAILABLE") {
    return new UnavailableExecutionHistoryStore("D1_SCHEMA_UNAVAILABLE");
  }
  return store;
};

const storePromise = runtimeGlobal.__aiKnowledgeDurableExecutionHistoryStorePromise ??=
  createStore();

export const getExecutionHistoryStore = () => storePromise;

export const getDurableWorkflowRuntime = async () => {
  runtimeGlobal.__aiKnowledgeDurableWorkflowRuntimePromise ??= storePromise.then((store) =>
    new DurableWorkflowRuntime(
      workflowExecutionKernel,
      store,
      capabilityResolverFromRegistry(capabilityDiscoveryRuntime.listCapabilities()),
    )
  );
  return runtimeGlobal.__aiKnowledgeDurableWorkflowRuntimePromise;
};
