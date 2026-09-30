import {
  AuthorizedLateralMovementGateError,
  runAuthorizedLateralMovementGate,
  type AuthorizedLateralMovementGateInput,
} from "../../../../server/capabilities/quarantined/authorized-lateral-movement.ts";
import { authorizedLateralMovementQuarantinedEntry } from "../../../../server/capabilities/quarantined/registry.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: {
    "cache-control": "no-store",
  },
});

export async function GET() {
  return json({
    capability: {
      capability_id: authorizedLateralMovementQuarantinedEntry.capability_id,
      candidate_id: authorizedLateralMovementQuarantinedEntry.candidate_id,
      lifecycle_status: authorizedLateralMovementQuarantinedEntry.lifecycle_status,
      risk_class: authorizedLateralMovementQuarantinedEntry.risk_class,
      read_write_mode: authorizedLateralMovementQuarantinedEntry.read_write_mode,
      execution_modes: authorizedLateralMovementQuarantinedEntry.execution_modes,
      tool_call_required: authorizedLateralMovementQuarantinedEntry.tool_call_required,
      safe_word_state: authorizedLateralMovementQuarantinedEntry.safe_word_state,
      plaintext_secret_persisted: authorizedLateralMovementQuarantinedEntry.plaintext_secret_persisted,
      network_access: authorizedLateralMovementQuarantinedEntry.network_access,
      credential_access: authorizedLateralMovementQuarantinedEntry.credential_access,
      external_effects: authorizedLateralMovementQuarantinedEntry.external_effects,
      runtime_binding_status: authorizedLateralMovementQuarantinedEntry.runtime_binding_status,
    },
    execution_authority: "READ_ONLY_SIMULATION_PLANNING_ONLY",
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AuthorizedLateralMovementGateInput;
    const output = await runAuthorizedLateralMovementGate(body);
    return json(output, 201);
  } catch (error) {
    if (error instanceof AuthorizedLateralMovementGateError) {
      return json({
        error: {
          code: error.code,
          message: error.message.replace(`${error.code}: `, ""),
        },
        safe_word_echoed: false,
        execution_authority: "NONE",
      }, error.httpStatus);
    }
    return json({
      error: {
        code: "AUTHORIZED_LATERAL_MOVEMENT_GATE_FAILED",
        message: "The quarantined planning gate failed without granting authority.",
      },
      safe_word_echoed: false,
      execution_authority: "NONE",
    }, 500);
  }
}
