import { capabilityDiscoveryRuntime } from "../../../server/capabilities/index.ts";
import { CapabilityDiscoveryError } from "../../../server/capabilities/service.ts";
import type { CapabilityExecutionMode } from "../../../server/capabilities/types.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, { status });

const requestedBy = (request: Request) => request.headers.get("oai-authenticated-user-email");

const asString = (value: unknown) => typeof value === "string" ? value : "";
const asOptionalString = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const asStringArray = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string")
  : [];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const discoveryId = url.searchParams.get("discovery_id");
    if (discoveryId) return json(capabilityDiscoveryRuntime.get(discoveryId));
    const [registryFingerprint, inventoryProjectionFingerprint] = await Promise.all([
      capabilityDiscoveryRuntime.registryFingerprint(),
      capabilityDiscoveryRuntime.inventoryProjectionFingerprint(),
    ]);
    return json({
      capability_registry_contract: "RuntimeCapabilityDefinition/1.0",
      capability_discovery_contract: "CapabilityDiscoveryEnvelope/1.0",
      capability_materialization_contract: "MaterializedCapability/1.0",
      registry_contract: "CompiledAiosRegistry/1.0",
      registry_version: capabilityDiscoveryRuntime.registryVersion(),
      registry_source: capabilityDiscoveryRuntime.registrySource(),
      persistence: "PROCESS_LOCAL",
      execution_authority: "NONE",
      workflow_execution_entrypoint: "WorkflowExecutionKernel",
      registry_fingerprint: registryFingerprint,
      registry_fingerprint_basis: "FULL_COMPILED_POLICY",
      inventory_projection_fingerprint: inventoryProjectionFingerprint,
      capabilities: capabilityDiscoveryRuntime.listCapabilities(),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = asString(body.action);
    switch (action) {
      case "discover": {
        const intentClass = asString(body.intent_class).trim();
        const scopeKey = asString(body.scope_key).trim();
        const mode = asString(body.mode) as CapabilityExecutionMode;
        if (!intentClass || !scopeKey || !["LIVE", "SIMULATION"].includes(mode)) {
          throw new CapabilityDiscoveryError(
            "INVALID_CAPABILITY_DISCOVERY_REQUEST",
            "intent_class, scope_key, and mode (LIVE or SIMULATION) are required.",
            400,
          );
        }
        const snapshot = await capabilityDiscoveryRuntime.discover({
          execution_id: asOptionalString(body.execution_id),
          workflow_id: asOptionalString(body.workflow_id),
          scope_key: scopeKey,
          mode,
          intent_class: intentClass,
          intent_text: asOptionalString(body.intent_text),
          requested_capability_id: asOptionalString(body.requested_capability_id),
          authority_domains: asStringArray(body.authority_domains),
        });
        return json({ ...snapshot, requested_by: requestedBy(request) }, 201);
      }
      case "select": {
        const discoveryId = requireString(body, "discovery_id");
        const capabilityId = requireString(body, "capability_id");
        return json(capabilityDiscoveryRuntime.select(discoveryId, capabilityId));
      }
      case "approve": return json(capabilityDiscoveryRuntime.approve(requireString(body, "discovery_id")));
      case "reject": return json(capabilityDiscoveryRuntime.reject(requireString(body, "discovery_id")));
      case "materialize": return json(await capabilityDiscoveryRuntime.materialize(requireString(body, "discovery_id")));
      default: throw new CapabilityDiscoveryError("UNKNOWN_CAPABILITY_OPERATION", "Unknown capability operation.", 400);
    }
  } catch (error) {
    return handleError(error);
  }
}

const requireString = (body: Record<string, unknown>, key: string) => {
  const value = asString(body[key]).trim();
  if (!value) throw new CapabilityDiscoveryError("INVALID_CAPABILITY_REQUEST", `${key} is required.`, 400);
  return value;
};

const handleError = (error: unknown) => {
  if (error instanceof CapabilityDiscoveryError) {
    return json({ error: { code: error.code, message: error.message } }, error.httpStatus);
  }
  return json({ error: { code: "CAPABILITY_INTERNAL_ERROR", message: "Capability request failed." } }, 500);
};
