import type { D1DatabaseLike } from "../workflows/d1-execution-history-store.ts";
import { D1FailureLearningStore } from "./d1-store.ts";

type RuntimeEnv = { DB?: D1DatabaseLike };

const loadRuntimeEnv = async (): Promise<RuntimeEnv> => {
  try {
    const workers = await import("cloudflare:workers");
    return workers.env as RuntimeEnv;
  } catch {
    return {};
  }
};

export const getFailureLearningStore = async () => {
  const env = await loadRuntimeEnv();
  if (!env.DB) return null;
  return new D1FailureLearningStore(env.DB).initialize();
};

export const getFailureLearningStatus = async () => {
  const store = await getFailureLearningStore();
  if (!store) {
    return {
      contract: "FailureLearningStatus/0.1",
      backend: { backend: "D1", state: "DURABLE_UNAVAILABLE", reason_code: "D1_BINDING_UNAVAILABLE" },
      authority_effect: "NONE",
    };
  }
  return store.status();
};

export const replayFailureLearningEpisode = async (
  episodeId: string,
  evidenceCutoffSequence: number,
) => {
  const store = await getFailureLearningStore();
  if (!store) throw new Error("D1_BINDING_UNAVAILABLE");
  return store.replay(episodeId, evidenceCutoffSequence);
};

export const predictFailureLearningRisk = async (features: string[]) => {
  const store = await getFailureLearningStore();
  if (!store) throw new Error("D1_BINDING_UNAVAILABLE");
  return store.predict(features);
};
