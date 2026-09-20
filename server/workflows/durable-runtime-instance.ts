import { capabilityDiscoveryRuntime } from "../capabilities/index.ts";
import { D1ExecutionHistoryStore, type D1DatabaseLike } from "./d1-execution-history-store.ts";
import { DurableWorkflowRuntime, capabilityResolverFromRegistry } from "./durable-runtime.ts";
import { UnavailableExecutionHistoryStore, type ExecutionHistoryStore } from "./execution-history-store.ts";
import { workflowExecutionKernel } from "./kernel.ts";

type RuntimeEnv = { DB?: D1DatabaseLike };

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
  return new D1ExecutionHistoryStore(db).initialize();
};

export const getExecutionHistoryStore = () => createStore();

export const getDurableWorkflowRuntime = async () => {
  const store = await createStore();
  return new DurableWorkflowRuntime(
    workflowExecutionKernel,
    store,
    capabilityResolverFromRegistry(capabilityDiscoveryRuntime.listCapabilities()),
  );
};
