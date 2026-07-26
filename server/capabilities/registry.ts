import {
  capabilityDiscoveryCapability,
  internalRuntimeDiagnosticCapability,
} from "./native-definitions.ts";

export const nativeRuntimeCapabilityRegistry = [
  internalRuntimeDiagnosticCapability,
  capabilityDiscoveryCapability,
] as const;
