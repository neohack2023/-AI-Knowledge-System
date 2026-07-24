import type { IntegrationDefinition } from "./types.ts";

export const integrationRegistry: readonly IntegrationDefinition[] = [
  {
    id: "braintrust",
    label: "Braintrust",
    kind: "EVALUATION_PROVIDER",
    state: "EXTERNAL_CONFIG_REQUIRED",
    authority_role: "NONE",
    required_secrets: ["BRAINTRUST_API_KEY"],
    capabilities: ["evaluation-runs", "production-trace-scoring", "regression-datasets"],
    guardrails: [
      "Receives derived evaluation payloads only.",
      "Cannot promote STONE candidates or mutate canon.",
      "External IDs must be attached to execution receipts, not treated as authority.",
    ],
  },
  {
    id: "litellm",
    label: "LiteLLM",
    kind: "MODEL_GATEWAY",
    state: "EXTERNAL_CONFIG_REQUIRED",
    authority_role: "NONE",
    required_secrets: ["LITELLM_BASE_URL", "LITELLM_API_KEY"],
    capabilities: ["provider-routing", "model-failover", "cost-telemetry", "centralized-model-policy"],
    guardrails: [
      "Does not resolve project scope or source authority.",
      "Model routing policy must consume Capability Registry decisions rather than replace them.",
      "No silent provider fallback when a workflow requires a specific model capability.",
    ],
  },
  {
    id: "ellipsis",
    label: "Ellipsis",
    kind: "EXECUTION_PROVIDER",
    state: "EXTERNAL_CONFIG_REQUIRED",
    authority_role: "NONE",
    required_secrets: ["ELLIPSIS_API_KEY"],
    capabilities: ["isolated-coding-session", "repository-task-execution", "session-history", "replay"],
    guardrails: [
      "Bound to repository-scoped tasks and explicit trust bands.",
      "Cannot merge, write canon, or promote memory without separate governed authorization.",
      "All external sessions must return an execution receipt and immutable session reference.",
    ],
  },
  {
    id: "langgraph",
    label: "LangGraph",
    kind: "ORCHESTRATION_PROVIDER",
    state: "RESEARCH_ONLY",
    authority_role: "NONE",
    required_secrets: [],
    capabilities: ["durable-graph-execution", "checkpointing", "human-interrupts", "subgraphs"],
    guardrails: [
      "Optional executor adapter only; never replaces the native WorkflowExecution kernel.",
      "Kernel statuses and approval semantics remain canonical runtime truth.",
      "Checkpoint state must map back to native execution receipts and provenance envelopes.",
    ],
  },
] as const;

export const getIntegrationDefinition = (id: string) => integrationRegistry.find((integration) => integration.id === id) ?? null;
