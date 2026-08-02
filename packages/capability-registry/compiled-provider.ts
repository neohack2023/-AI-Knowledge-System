export type PortableRuntimeCapabilityDefinition = {
  schema_name: "RuntimeCapabilityDefinition";
  schema_version: "1.0";
  capability_id: string;
  workflow_id: string;
  version: string;
  handler_ref: string;
  expected_schema_fingerprint: string;
  [key: string]: unknown;
};

export type CompiledCapabilityRegistry<
  TDefinition extends PortableRuntimeCapabilityDefinition = PortableRuntimeCapabilityDefinition,
> = {
  schema_name: "CompiledAiosRegistry";
  schema_version: "1.0";
  registry_version: string;
  registry_fingerprint: string;
  inventory_projection_fingerprint: string;
  capabilities: TDefinition[];
};

export class CompiledCapabilityRegistryError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CompiledCapabilityRegistryError";
  }
}

const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const requiredString = (value: unknown, field: string, capabilityId?: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CompiledCapabilityRegistryError(
      "INVALID_COMPILED_CAPABILITY",
      `${capabilityId ? `Capability '${capabilityId}'` : "Compiled registry"} requires ${field}.`,
    );
  }
  return value.trim();
};

export const loadCompiledCapabilityRegistry = <
  TDefinition extends PortableRuntimeCapabilityDefinition,
>(registry: CompiledCapabilityRegistry<TDefinition>) => {
  if (registry.schema_name !== "CompiledAiosRegistry" || registry.schema_version !== "1.0") {
    throw new CompiledCapabilityRegistryError(
      "COMPILED_REGISTRY_CONTRACT_MISMATCH",
      "Capability loading requires CompiledAiosRegistry/1.0.",
    );
  }
  requiredString(registry.registry_version, "registry_version");
  if (!sha256Pattern.test(registry.registry_fingerprint)) {
    throw new CompiledCapabilityRegistryError(
      "INVALID_REGISTRY_FINGERPRINT",
      "registry_fingerprint must use sha256:<64 lowercase hex characters>.",
    );
  }
  if (!sha256Pattern.test(registry.inventory_projection_fingerprint)) {
    throw new CompiledCapabilityRegistryError(
      "INVALID_INVENTORY_FINGERPRINT",
      "inventory_projection_fingerprint must use sha256:<64 lowercase hex characters>.",
    );
  }
  if (!Array.isArray(registry.capabilities)) {
    throw new CompiledCapabilityRegistryError(
      "INVALID_COMPILED_CAPABILITY_COLLECTION",
      "Compiled registry capabilities must be an array.",
    );
  }

  const seen = new Set<string>();
  const definitions = registry.capabilities.map((definition) => {
    if (definition.schema_name !== "RuntimeCapabilityDefinition" || definition.schema_version !== "1.0") {
      throw new CompiledCapabilityRegistryError(
        "CAPABILITY_CONTRACT_MISMATCH",
        "Compiled capability entries must use RuntimeCapabilityDefinition/1.0.",
      );
    }
    const capabilityId = requiredString(definition.capability_id, "capability_id");
    requiredString(definition.workflow_id, "workflow_id", capabilityId);
    requiredString(definition.version, "version", capabilityId);
    requiredString(definition.handler_ref, "handler_ref", capabilityId);
    if (!sha256Pattern.test(definition.expected_schema_fingerprint)) {
      throw new CompiledCapabilityRegistryError(
        "INVALID_CAPABILITY_SCHEMA_FINGERPRINT",
        `Capability '${capabilityId}' has an invalid expected_schema_fingerprint.`,
      );
    }
    if (seen.has(capabilityId)) {
      throw new CompiledCapabilityRegistryError(
        "DUPLICATE_COMPILED_CAPABILITY",
        `Capability '${capabilityId}' appears more than once in the compiled registry.`,
      );
    }
    seen.add(capabilityId);
    return structuredClone(definition);
  }).sort((left, right) => left.capability_id.localeCompare(right.capability_id));

  return {
    registry_version: registry.registry_version,
    registry_fingerprint: registry.registry_fingerprint,
    inventory_projection_fingerprint: registry.inventory_projection_fingerprint,
    execution_authority: "NONE" as const,
    destination_write_authorized: false as const,
    listDefinitions: () => structuredClone(definitions) as TDefinition[],
    provider: () => structuredClone(definitions) as readonly TDefinition[],
  };
};

export const createCompiledCapabilityProvider = <
  TDefinition extends PortableRuntimeCapabilityDefinition,
>(registry: CompiledCapabilityRegistry<TDefinition>) => loadCompiledCapabilityRegistry(registry).provider;
