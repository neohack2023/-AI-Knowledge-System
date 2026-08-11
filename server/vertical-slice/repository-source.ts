import type { RepositorySourceRecord } from "./types.ts";
import { nativeRuntimeCapabilityRegistry } from "../capabilities/registry.ts";
import { workflowExecutionKernel } from "../workflows/kernel.ts";

const supplementalRecords: RepositorySourceRecord[] = [
  {
    resource_id: "repo:binding-contract",
    scope_key: "global-working-memory",
    title: "Context packet binding-strength contract",
    authority_role: "EXECUTION_TRUTH",
    source_system: "GITHUB",
    source_ref: "docs/CONTEXT_PACKET_BINDING_STRENGTH.md",
    updated_at: "2026-08-08T00:00:00.000Z",
    content: "The binding-strength contract distinguishes advisory, preferred, required, authoritative, and prohibitive context without granting execution or write authority.",
    tags: ["context", "packet", "binding", "authority"],
  },
];

// Executable inventory is projected from the running registries. This prevents
// the retrieval route from reporting a capability or workflow that the process
// did not actually register.
const liveRepositoryRecords = (): RepositorySourceRecord[] => {
  const capabilities = nativeRuntimeCapabilityRegistry.map((definition) => ({
    resource_id: `repo:capability:${definition.capability_id}`,
    scope_key: "global-working-memory",
    title: `Runtime capability: ${definition.name}`,
    authority_role: "EXECUTION_TRUTH" as const,
    source_system: "GITHUB" as const,
    source_ref: "server/capabilities/registry.ts",
    updated_at: definition.health.checked_at,
    content: [
      `${definition.capability_id} v${definition.version} is ${definition.status}.`,
      definition.description,
      `Modes: ${definition.execution_modes.join(", ")}; scopes: ${definition.scope_allowlist.join(", ")}; handler: ${definition.handler_ref}.`,
    ].join(" "),
    tags: ["runtime", "capability", "registry", ...definition.intent_classes],
  }));
  const workflows = workflowExecutionKernel.listLiveWorkflows().map((workflow) => ({
    resource_id: `repo:workflow:${workflow.workflow_id}`,
    scope_key: "global-working-memory",
    title: `LIVE workflow: ${workflow.workflow_id}`,
    authority_role: "EXECUTION_TRUTH" as const,
    source_system: "GITHUB" as const,
    source_ref: "server/workflows/kernel.ts",
    updated_at: "2026-08-08T00:00:00.000Z",
    content: `${workflow.workflow_id} v${workflow.version} is registered in the server kernel for ${workflow.allowed_scope_keys.join(", ")} with provenance contract ${workflow.provenance_contract}.`,
    tags: ["runtime", "kernel", "workflow", "provenance"],
  }));
  return [...capabilities, ...workflows, ...supplementalRecords];
};

const words = (value: string) => new Set(
  value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2),
);

export type RetrievalResult = {
  candidates: number;
  included: RepositorySourceRecord[];
  rejected_objects: number;
  conflicts: number;
  source_latency_ms: number;
};

export const retrieveRepositoryContext = (
  scopeKey: string,
  query: string,
  now: () => number = () => performance.now(),
): RetrievalResult => {
  const started = now();
  const repositoryRecords = liveRepositoryRecords();
  const scoped = repositoryRecords.filter((record) => record.scope_key === scopeKey);
  const queryWords = words(query);
  const ranked = scoped
    .map((record) => {
      const haystack = words(`${record.title} ${record.content} ${record.tags.join(" ")}`);
      const score = [...queryWords].reduce((total, word) => total + (haystack.has(word) ? 1 : 0), 0);
      return { record, score };
    })
    .sort((left, right) => right.score - left.score || left.record.resource_id.localeCompare(right.record.resource_id));
  const matched = ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => item.record);
  const included = matched.length ? matched : ranked.slice(0, 2).map((item) => item.record);
  const identities = new Map<string, string>();
  let conflicts = 0;
  for (const record of scoped) {
    const prior = identities.get(record.resource_id);
    if (prior && prior !== record.content) conflicts += 1;
    identities.set(record.resource_id, record.content);
  }
  return {
    candidates: scoped.length,
    included: structuredClone(included),
    rejected_objects: repositoryRecords.length - included.length,
    conflicts,
    source_latency_ms: Number((now() - started).toFixed(3)),
  };
};
