import { capabilityDiscoveryRuntime } from "../capabilities/index.ts";
import { workflowExecutionKernel } from "../workflows/kernel.ts";

export type RepositoryKnowledgeRecord = {
  id: string;
  scope_key: "global-working-memory";
  title: string;
  url: string;
  text: string;
  metadata: {
    authority: "GITHUB_EXECUTION_TRUTH";
    source_ref: string;
    kind: "CAPABILITY" | "WORKFLOW" | "API";
    status?: string;
    version?: string;
    tags: string[];
  };
};

const REPOSITORY = "https://github.com/neohack2023/-AI-Knowledge-System";
const MAIN_BLOB = `${REPOSITORY}/blob/main`;

const supplementalApiRecords = (): RepositoryKnowledgeRecord[] => [
  {
    id: "repo:api:workflow-executions",
    scope_key: "global-working-memory",
    title: "Workflow execution API",
    url: `${MAIN_BLOB}/app/api/workflow-executions/route.ts`,
    text: "The workflow execution API exposes the registered server workflow kernel. It supports creation, execution, lifecycle transitions, and registry-backed next-action operations. The ChatGPT bridge restricts its own execution tool to SIMULATION mode and does not grant external destination-write authority.",
    metadata: {
      authority: "GITHUB_EXECUTION_TRUTH",
      source_ref: "app/api/workflow-executions/route.ts",
      kind: "API",
      tags: ["api", "workflow", "kernel", "simulation", "next-action"],
    },
  },
  {
    id: "repo:api:capabilities",
    scope_key: "global-working-memory",
    title: "Runtime capability discovery API",
    url: `${MAIN_BLOB}/app/api/capabilities/route.ts`,
    text: "The capability API projects the bounded public inventory of the live capability registry, including scope, health, source authority, autonomy, and materialization policy. Capability discovery and materialization do not themselves grant execution or destination-write authority.",
    metadata: {
      authority: "GITHUB_EXECUTION_TRUTH",
      source_ref: "app/api/capabilities/route.ts",
      kind: "API",
      tags: ["api", "capability", "registry", "authority", "discovery"],
    },
  },
  {
    id: "repo:api:gog-3d-lab",
    scope_key: "global-working-memory",
    title: "Girls of Gaming 2D to 3D provider workbench",
    url: `${MAIN_BLOB}/app/api/gog-3d-lab/run/route.ts`,
    text: "The GoG 2D to 3D provider workbench accepts a character reference image and proxies reconstruction to an admitted provider worker. The current candidate provider is SAM 3D Body plus MHR. Provider output remains provisional and does not become canon geometry automatically.",
    metadata: {
      authority: "GITHUB_EXECUTION_TRUTH",
      source_ref: "app/api/gog-3d-lab/run/route.ts",
      kind: "API",
      tags: ["gog", "2d", "3d", "sam3d", "mhr", "provider", "workbench"],
    },
  },
];

export const listRepositoryKnowledge = (): RepositoryKnowledgeRecord[] => {
  // Use only the service's deliberate public summary projection. Do not reach
  // through the runtime to recover hidden capability definition fields.
  const capabilities = capabilityDiscoveryRuntime.listCapabilities().map((summary) => ({
    id: `repo:capability:${summary.capability_id}`,
    scope_key: "global-working-memory" as const,
    title: `Runtime capability: ${summary.name}`,
    url: `${MAIN_BLOB}/server/capabilities/registry.ts`,
    text: [
      `${summary.capability_id} v${summary.version} is ${summary.status}.`,
      `Workflow: ${summary.workflow_id}.`,
      `Intents: ${summary.intent_classes.join(", ") || "none"}.`,
      `Scopes: ${summary.scope_allowlist.join(", ") || "none"}.`,
      `Autonomy: ${summary.autonomy_band}; approval required: ${summary.approval_required}.`,
      `Health: ${summary.health_status}.`,
      `Schema references: ${summary.schema_refs.join(", ")}.`,
      `Source authority: ${summary.source_authority}.`,
    ].join(" "),
    metadata: {
      authority: "GITHUB_EXECUTION_TRUTH" as const,
      source_ref: "server/capabilities/registry.ts",
      kind: "CAPABILITY" as const,
      status: summary.status,
      version: summary.version,
      tags: ["runtime", "capability", "registry", ...summary.intent_classes, ...summary.scope_allowlist],
    },
  }));

  const workflows = workflowExecutionKernel.listLiveWorkflows().map((workflow) => ({
    id: `repo:workflow:${workflow.workflow_id}`,
    scope_key: "global-working-memory" as const,
    title: `LIVE workflow: ${workflow.workflow_id}`,
    url: `${MAIN_BLOB}/server/workflows/kernel.ts`,
    text: [
      `${workflow.workflow_id} v${workflow.version} is registered in the live server kernel.`,
      `Allowed scopes: ${workflow.allowed_scope_keys.join(", ")}.`,
      `Provenance contract: ${workflow.provenance_contract}.`,
    ].join(" "),
    metadata: {
      authority: "GITHUB_EXECUTION_TRUTH" as const,
      source_ref: "server/workflows/kernel.ts",
      kind: "WORKFLOW" as const,
      status: "LIVE",
      version: workflow.version,
      tags: ["runtime", "workflow", "kernel", "provenance", ...workflow.allowed_scope_keys],
    },
  }));

  return [...capabilities, ...workflows, ...supplementalApiRecords()];
};

const tokenize = (value: string) => new Set(
  value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1),
);

export const searchRepositoryKnowledge = (query: string, limit = 8) => {
  const needle = tokenize(query);
  const ranked = listRepositoryKnowledge()
    .map((record) => {
      const haystack = tokenize([
        record.title,
        record.text,
        record.metadata.source_ref,
        record.metadata.tags.join(" "),
      ].join(" "));
      const score = [...needle].reduce((total, token) => total + (haystack.has(token) ? 1 : 0), 0);
      return { record, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));

  return ranked.slice(0, Math.max(1, Math.min(limit, 20))).map(({ record }) => record);
};

export const fetchRepositoryKnowledge = (id: string) =>
  listRepositoryKnowledge().find((record) => record.id === id) ?? null;
