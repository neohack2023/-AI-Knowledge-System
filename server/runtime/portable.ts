import {
  loadCompiledCapabilityRegistry,
  type CompiledCapabilityRegistry,
} from "../../packages/capability-registry/compiled-provider.ts";
import { compiledPublicRegistry } from "../../packages/runtime-composition/compiled-public-registry.ts";
import {
  resolveScope,
  type CompiledScopeRegistry,
  type ScopeResolutionRequest,
} from "../../packages/scope-router/index.ts";
import { createCapabilityDiscoveryRuntime } from "../capabilities/runtime.ts";
import type { RuntimeCapabilityDefinition } from "../capabilities/types.ts";

type PortableCompiledRegistry = CompiledScopeRegistry
  & CompiledCapabilityRegistry<RuntimeCapabilityDefinition>;

const registry = compiledPublicRegistry as unknown as PortableCompiledRegistry;

const createPortableAiosRuntime = () => {
  const capabilityRegistry = loadCompiledCapabilityRegistry(registry);
  const capabilityDiscovery = createCapabilityDiscoveryRuntime(
    capabilityRegistry.listDefinitions(),
    {
      registry_version: capabilityRegistry.registry_version,
      registry_fingerprint: capabilityRegistry.registry_fingerprint,
      inventory_projection_fingerprint: capabilityRegistry.inventory_projection_fingerprint,
      registry_source: "COMPILED_PUBLIC_REGISTRY",
    },
  );

  return {
    runtime_contract: "PortableAiosRuntime/0.1" as const,
    registry_contract: "CompiledAiosRegistry/1.0" as const,
    registry_version: capabilityRegistry.registry_version,
    registry_fingerprint: capabilityRegistry.registry_fingerprint,
    inventory_projection_fingerprint: capabilityRegistry.inventory_projection_fingerprint,
    registry_source: "COMPILED_PUBLIC_REGISTRY" as const,
    persistence: "PROCESS_LOCAL" as const,
    execution_authority: "NONE" as const,
    workflow_execution_entrypoint: "WorkflowExecutionKernel" as const,
    destination_write_authorized: false as const,
    capabilityDiscovery,
    resolveScope: (request: ScopeResolutionRequest) => resolveScope(registry, request),
    registrySnapshot: () => structuredClone(registry),
  };
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __portableAiosRuntime?: ReturnType<typeof createPortableAiosRuntime>;
};

export const portableAiosRuntime = runtimeGlobal.__portableAiosRuntime ??=
  createPortableAiosRuntime();
