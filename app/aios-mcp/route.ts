import { GET as readBridge, POST as invokeBridge } from "../api/aios-bridge/route";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2025-06-18";
const RESOURCE_URI = "ui://aios/repo-workbench-v0.3.html";
const SCOPE_KEY = "global-working-memory";

type RpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  _meta?: Record<string, unknown>;
};

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const processLocalExecution = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const tools: ToolDefinition[] = [
  {
    name: "search",
    title: "Search AIOS repository knowledge",
    description: "Search the read-only repository execution-truth projection.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", minLength: 1 } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "fetch",
    title: "Fetch AIOS repository knowledge",
    description: "Fetch one exact repository record returned by search.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1 } },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "aios_status",
    title: "Read AIOS bridge status",
    description: "Read live capability, workflow, authority, and D1 durability state.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "read_execution",
    title: "Read AIOS execution snapshot",
    description: "Read one exact execution with its ordered events and provenance envelopes.",
    inputSchema: {
      type: "object",
      properties: { execution_id: { type: "string", minLength: 1 } },
      required: ["execution_id"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "read_execution_provenance",
    title: "Read AIOS execution provenance",
    description: "Read the minimum validated projection for one execution-bound provenance envelope.",
    inputSchema: {
      type: "object",
      properties: {
        execution_id: { type: "string", minLength: 1 },
        provenance_envelope_id: { type: "string", minLength: 1 },
      },
      required: ["execution_id", "provenance_envelope_id"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "run_backend_workflow",
    title: "Run a policy-bounded AIOS workflow",
    description: "Run only a backend-admitted A0, process-local, fully reversible LIVE workflow.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "string", minLength: 1 },
        scope_key: { type: "string", const: SCOPE_KEY },
        input: { type: "object" },
      },
      required: ["workflow_id"],
      additionalProperties: false,
    },
    annotations: processLocalExecution,
  },
  {
    name: "open_aios_workbench",
    title: "Open AIOS Repo Workbench",
    description: "Render the inline AIOS workbench with current backend status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
    _meta: { "openai/outputTemplate": RESOURCE_URI },
  },
];

const responseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "accept,authorization,content-type,mcp-protocol-version,mcp-session-id",
  "access-control-expose-headers": "mcp-session-id",
};

const WORKBENCH_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AIOS Repo Workbench</title>
  <style>
    :root{color-scheme:dark;background:#081016;color:#e8f6ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    body{margin:0;padding:20px;background:radial-gradient(circle at top right,#12354a,#081016 55%)}
    main{max-width:760px;margin:auto;border:1px solid #24566f;border-radius:14px;padding:20px;background:#0b1820e8;box-shadow:0 18px 60px #0008}
    h1{margin:0 0 8px;color:#67e8f9;font-size:20px}p{line-height:1.55;color:#b8d3df}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:16px}
    article{border:1px solid #1f465a;border-radius:10px;padding:12px;background:#0c202b}strong{display:block;color:#8ef0c7;margin-bottom:5px}.boundary{margin-top:16px;padding:10px;border-left:3px solid #f7b955;background:#2b2312;color:#f6dfad}
  </style>
</head>
<body><main><h1>AIOS Repo Workbench</h1><p>Live repository execution truth and policy-bounded runtime diagnostics from the Cloudflare deployment.</p>
<div class="grid"><article><strong>Scope</strong>global-working-memory</article><article><strong>Authority</strong>GITHUB_EXECUTION_TRUTH</article><article><strong>Persistence</strong>D1_DURABLE when reported healthy</article><article><strong>Write authority</strong>NONE</article></div>
<div class="boundary">Search and reads are non-mutating. Workflow execution remains limited to backend-admitted A0 process-local handlers. No Drive/Notion authority projection or canon promotion is granted.</div></main></body></html>`;

function rpcError(id: RpcRequest["id"], code: number, message: string, data?: unknown, status = 200) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }),
    { status, headers: responseHeaders },
  );
}

function internalHeaders() {
  const headers = new Headers({ accept: "application/json", "content-type": "application/json" });
  const token = process.env.AIOS_BRIDGE_TOKEN?.trim();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

async function bridgePayload(request: Request, payload?: Record<string, unknown>) {
  const target = new URL("/api/aios-bridge", request.url);
  const bridgeRequest = new Request(target, {
    method: payload ? "POST" : "GET",
    headers: internalHeaders(),
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const response = payload ? await invokeBridge(bridgeRequest) : await readBridge(bridgeRequest);
  const value = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = value.error as { code?: string; message?: string } | undefined;
    throw new Error(`${error?.code ?? "AIOS_BRIDGE_ERROR"}: ${error?.message ?? `HTTP ${response.status}`}`);
  }
  return value;
}

function toolResult(payload: Record<string, unknown>, resourceUri?: string) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
    ...(resourceUri ? { _meta: { ui: { resourceUri }, "openai/outputTemplate": resourceUri } } : {}),
  };
}

async function invokeTool(request: Request, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "search":
      return bridgePayload(request, { action: "search", query: args.query, scope_key: SCOPE_KEY });
    case "fetch":
      return bridgePayload(request, { action: "fetch", id: args.id, scope_key: SCOPE_KEY });
    case "aios_status":
      return bridgePayload(request);
    case "read_execution":
      return bridgePayload(request, { action: "read_execution", execution_id: args.execution_id, scope_key: SCOPE_KEY });
    case "read_execution_provenance":
      return bridgePayload(request, {
        action: "read_execution_provenance",
        execution_id: args.execution_id,
        provenance_envelope_id: args.provenance_envelope_id,
        scope_key: SCOPE_KEY,
      });
    case "run_backend_workflow":
      return bridgePayload(request, {
        action: "execute_safe_workflow",
        workflow_id: args.workflow_id,
        scope_key: args.scope_key ?? SCOPE_KEY,
        input: args.input ?? {},
      });
    case "open_aios_workbench": {
      const status = await bridgePayload(request);
      return {
        status: status.status ?? "UNKNOWN",
        contract: status.contract,
        scope_key: SCOPE_KEY,
        authority: "GITHUB_EXECUTION_TRUTH",
        write_authorization: "NONE",
        deployment_profile: "cloudflare-native",
        mcp_endpoint: "/aios-mcp",
        status_payload: status,
      };
    }
    default:
      throw new Error(`UNKNOWN_AIOS_MCP_TOOL: ${name}`);
  }
}

async function handleOne(request: Request, message: RpcRequest) {
  const id = message.id ?? null;
  switch (message.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
          serverInfo: { name: "aios-cloudflare-native", title: "AI Knowledge System", version: "0.3.0" },
          instructions: "Use this endpoint for AIOS repository execution truth and policy-bounded A0 diagnostics. It grants no Drive/Notion authority or destination-write permission.",
        },
      };
    case "notifications/initialized":
      return null;
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools } };
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      if (!tools.some((tool) => tool.name === name)) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool ${name}` } };
      }
      try {
        const payload = await invokeTool(request, name, args);
        return { jsonrpc: "2.0", id, result: toolResult(payload, name === "open_aios_workbench" ? RESOURCE_URI : undefined) };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "AIOS_MCP_TOOL_ERROR", data: { detail: error instanceof Error ? error.message : String(error) } },
        };
      }
    }
    case "resources/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          resources: [{
            uri: RESOURCE_URI,
            name: "AIOS Repo Workbench",
            title: "AIOS Repo Workbench",
            description: "Cloudflare-native view of AIOS repository and execution truth.",
            mimeType: "text/html;profile=mcp-app",
          }],
        },
      };
    case "resources/read":
      if (message.params?.uri !== RESOURCE_URI) {
        return { jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource URI" } };
      }
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [{
            uri: RESOURCE_URI,
            mimeType: "text/html;profile=mcp-app",
            text: WORKBENCH_HTML,
            _meta: {
              ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } },
              "openai/widgetDescription": "Inspect bounded AIOS repository and execution truth.",
            },
          }],
        },
      };
    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${message.method}` } };
  }
}

export async function POST(request: Request) {
  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json() as RpcRequest | RpcRequest[];
  } catch {
    return rpcError(null, -32700, "Parse error", undefined, 400);
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((message) => handleOne(request, message)))).filter(Boolean);
    if (!responses.length) return new Response(null, { status: 202, headers: responseHeaders });
    return new Response(JSON.stringify(responses), { status: 200, headers: responseHeaders });
  }

  const response = await handleOne(request, body);
  if (!response) return new Response(null, { status: 202, headers: responseHeaders });
  return new Response(JSON.stringify(response), { status: 200, headers: responseHeaders });
}

export async function GET() {
  return new Response(JSON.stringify({
    service: "AIOS_CLOUDFLARE_NATIVE_MCP_01",
    transport: "streamable-http-json",
    endpoint: "/aios-mcp",
    alias: "/api/aios-mcp",
    protocolVersion: PROTOCOL_VERSION,
    scope_key: SCOPE_KEY,
    authority: "GITHUB_EXECUTION_TRUTH",
    write_authorization: "NONE",
    statePersistence: "D1_DURABLE_WHEN_AVAILABLE",
  }), { status: 200, headers: responseHeaders });
}

export async function DELETE() {
  return new Response(null, { status: 204, headers: responseHeaders });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: responseHeaders });
}
