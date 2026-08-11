import { NextResponse } from "next/server";
import {
  fetchRepositoryKnowledge,
  listRepositoryKnowledge,
  searchRepositoryKnowledge,
} from "../../../server/chat-bridge/repository-knowledge.ts";
import { workflowExecutionKernel } from "../../../server/workflows/kernel.ts";
import { capabilityDiscoveryRuntime } from "../../../server/capabilities/index.ts";
import type { JsonObject } from "../../../server/workflows/types.ts";

export const runtime = "edge";

type BridgeBody = {
  action?: "search" | "fetch" | "simulate_workflow";
  query?: string;
  id?: string;
  limit?: number;
  scope_key?: string;
  workflow_id?: string;
  input?: JsonObject;
};

const CONTRACT = "AIOSChatBridge/0.1";
const SCOPE = "global-working-memory";

function authorized(request: Request) {
  const required = process.env.AIOS_BRIDGE_TOKEN?.trim();
  if (!required) return true;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return supplied === required;
}

function rejectUnauthorized() {
  return NextResponse.json(
    { error: { code: "BRIDGE_UNAUTHORIZED", message: "AIOS bridge authorization failed." } },
    { status: 401 },
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) return rejectUnauthorized();

  const records = listRepositoryKnowledge();
  return NextResponse.json({
    contract: CONTRACT,
    status: "READY",
    scope_key: SCOPE,
    coverage: "REPOSITORY_EXECUTION_TRUTH_ONLY",
    authority: "GITHUB_EXECUTION_TRUTH",
    write_authorization: "NONE",
    persistence: "PROCESS_LOCAL_READ_PROJECTION",
    records: records.length,
    live_workflows: workflowExecutionKernel.listLiveWorkflows(),
    capabilities: capabilityDiscoveryRuntime.listCapabilities().map((capability) => ({
      capability_id: capability.capability_id,
      name: capability.name,
      status: capability.status,
      execution_modes: capability.execution_modes,
      scope_allowlist: capability.scope_allowlist,
      data_access: capability.data_access,
      autonomy_band: capability.autonomy_band,
    })),
    routes: {
      bridge: "/api/aios-bridge",
      workflows: "/api/workflow-executions",
      capabilities: "/api/capabilities",
      gog_3d_lab: "/gog-3d-lab",
      gog_3d_provider: "/api/gog-3d-lab/run",
    },
    allowed_bridge_actions: ["search", "fetch", "simulate_workflow"],
    boundaries: [
      "This bridge exposes repository execution truth, not the full Notion or Drive memory authority surface.",
      "Search and fetch are read-only.",
      "ChatGPT-side workflow execution is restricted to SIMULATION inside this bridge.",
      "No bridge result is automatically promoted to memory, canon, or destination-write authority.",
    ],
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) return rejectUnauthorized();

  try {
    const body = await request.json() as BridgeBody;
    const scope = body.scope_key?.trim() || SCOPE;
    if (scope !== SCOPE) {
      return NextResponse.json(
        {
          error: {
            code: "BRIDGE_SCOPE_UNAVAILABLE",
            message: `The initial bridge exposes only '${SCOPE}'.`,
          },
        },
        { status: 409 },
      );
    }

    if (body.action === "search") {
      const query = body.query?.trim();
      if (!query) {
        return NextResponse.json(
          { error: { code: "QUERY_REQUIRED", message: "query is required." } },
          { status: 400 },
        );
      }
      const records = searchRepositoryKnowledge(query, body.limit ?? 8);
      return NextResponse.json({
        contract: CONTRACT,
        scope_key: SCOPE,
        authority: "GITHUB_EXECUTION_TRUTH",
        results: records.map((record) => ({
          id: record.id,
          title: record.title,
          url: record.url,
          metadata: record.metadata,
        })),
      });
    }

    if (body.action === "fetch") {
      const id = body.id?.trim();
      if (!id) {
        return NextResponse.json(
          { error: { code: "ID_REQUIRED", message: "id is required." } },
          { status: 400 },
        );
      }
      const record = fetchRepositoryKnowledge(id);
      if (!record) {
        return NextResponse.json(
          { error: { code: "KNOWLEDGE_RECORD_NOT_FOUND", message: "Knowledge record was not found." } },
          { status: 404 },
        );
      }
      return NextResponse.json({
        contract: CONTRACT,
        id: record.id,
        title: record.title,
        text: record.text,
        url: record.url,
        metadata: {
          ...record.metadata,
          scope_key: record.scope_key,
          coverage: "REPOSITORY_EXECUTION_TRUTH_ONLY",
        },
      });
    }

    if (body.action === "simulate_workflow") {
      const workflowId = body.workflow_id?.trim();
      if (!workflowId) {
        return NextResponse.json(
          { error: { code: "WORKFLOW_ID_REQUIRED", message: "workflow_id is required." } },
          { status: 400 },
        );
      }
      const created = workflowExecutionKernel.createExecution({
        workflow_id: workflowId,
        scope_key: SCOPE,
        requested_by: "chatgpt-mcp-bridge",
        mode: "SIMULATION",
        input: body.input ?? {},
      });
      if (created.execution.status === "FAILED") {
        return NextResponse.json({ contract: CONTRACT, mode: "SIMULATION", snapshot: created }, { status: 409 });
      }
      const completed = await workflowExecutionKernel.runToCompletion(created.execution.execution_id);
      return NextResponse.json({
        contract: CONTRACT,
        mode: "SIMULATION",
        write_authorization: "NONE",
        snapshot: completed,
      }, { status: completed.execution.status === "FAILED" ? 409 : 201 });
    }

    return NextResponse.json(
      { error: { code: "UNKNOWN_BRIDGE_ACTION", message: "Use action 'search', 'fetch', or 'simulate_workflow'." } },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BRIDGE_REQUEST_FAILED",
          message: error instanceof Error ? error.message : "AIOS bridge request failed.",
        },
      },
      { status: 500 },
    );
  }
}
