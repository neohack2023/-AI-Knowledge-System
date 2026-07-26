import { nativeRuntimeCapabilityRegistry } from "./registry.ts";
import { createCapabilityDiscoveryRuntime } from "./runtime.ts";

const capabilityGlobal = globalThis as typeof globalThis & {
  __aiKnowledgeCapabilityRuntime?: ReturnType<typeof createCapabilityDiscoveryRuntime>;
};

export const capabilityDiscoveryRuntime = capabilityGlobal.__aiKnowledgeCapabilityRuntime ??=
  createCapabilityDiscoveryRuntime(nativeRuntimeCapabilityRegistry);
