import { portableAiosRuntime } from "../../../../server/runtime/portable.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, { status });
const asOptionalString = (value: unknown) => typeof value === "string" && value.trim()
  ? value.trim()
  : undefined;

export async function GET() {
  return json({
    scope_resolution_contract: "ScopeResolutionResult/1.0",
    registry_contract: portableAiosRuntime.registry_contract,
    registry_version: portableAiosRuntime.registry_version,
    registry_fingerprint: portableAiosRuntime.registry_fingerprint,
    registry_source: portableAiosRuntime.registry_source,
    routing_precedence: portableAiosRuntime.registrySnapshot().routing_precedence,
    semantic_selection_enabled: false,
    scope_packet_loading: "NONE",
    execution_authority: "NONE",
    destination_write_authorized: false,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const result = portableAiosRuntime.resolveScope({
      requested_scope: asOptionalString(body.requested_scope),
      parent_scope_key: asOptionalString(body.parent_scope_key),
      continuity_scope_key: asOptionalString(body.continuity_scope_key),
      continuity_authorized: body.continuity_authorized === true,
    });
    return json(result);
  } catch (error) {
    return json({
      error: {
        code: "SCOPE_RESOLUTION_FAILED",
        message: error instanceof Error ? error.message : "Scope resolution failed.",
      },
    }, 400);
  }
}
