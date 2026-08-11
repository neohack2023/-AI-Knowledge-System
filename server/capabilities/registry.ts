import {
  capabilityDiscoveryCapability,
  internalRuntimeDiagnosticCapability,
  repositoryContextRetrievalCapability,
} from "./native-definitions.ts";

export const nativeRuntimeCapabilityRegistry = [
  internalRuntimeDiagnosticCapability,
  capabilityDiscoveryCapability,
  repositoryContextRetrievalCapability,
] as const;
