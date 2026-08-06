import {
  runSecurityReportEvidenceHygieneSimulation,
  type SecurityReportEvidenceHygieneSimulationInput,
} from "../../../../server/capabilities/experimental/security-report-evidence-hygiene.ts";
import {
  experimentalReadOnlyCapabilityRegistry,
  securityReportEvidenceHygieneExperimentalEntry,
} from "../../../../server/capabilities/experimental/registry.ts";

export const runtime = "edge";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function GET() {
  return json({
    schema_name: "ExperimentalReadOnlyRegistry",
    schema_version: "1.0",
    lifecycle_lane: "EXPERIMENTAL_READ_ONLY",
    execution_authority: "SIMULATION_ONLY",
    persistence: "PROCESS_LOCAL",
    capabilities: experimentalReadOnlyCapabilityRegistry,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SecurityReportEvidenceHygieneSimulationInput;
    if (body.candidate_id !== securityReportEvidenceHygieneExperimentalEntry.candidate_id) {
      return json({ error: { code: "EXPERIMENTAL_CAPABILITY_MISMATCH", message: "The request does not target the registered experimental candidate." } }, 409);
    }
    return json(await runSecurityReportEvidenceHygieneSimulation(body), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Experimental replay failed.";
    const code = message.split(":", 1)[0] || "EXPERIMENTAL_REPLAY_FAILED";
    const status = ["EXPERIMENTAL_SIMULATION_ONLY", "SCOPE_NOT_ALLOWED", "SANITIZED_EXTRACT_REQUIRED", "SENSITIVE_INPUT_BLOCKED"].includes(code)
      ? 409
      : 400;
    return json({ error: { code, message } }, status);
  }
}
