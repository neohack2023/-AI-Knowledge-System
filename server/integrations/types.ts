export type IntegrationKind = "MODEL_GATEWAY" | "EVALUATION_PROVIDER" | "EXECUTION_PROVIDER" | "ORCHESTRATION_PROVIDER";

export type IntegrationState = "NATIVE_READY" | "ADAPTER_READY" | "EXTERNAL_CONFIG_REQUIRED" | "RESEARCH_ONLY";

export type IntegrationDefinition = {
  id: string;
  label: string;
  kind: IntegrationKind;
  state: IntegrationState;
  authority_role: "NONE";
  required_secrets: string[];
  capabilities: string[];
  guardrails: string[];
};

export interface EvaluationProvider {
  readonly provider_id: string;
  submitRegressionCandidate(input: {
    regression_id: string;
    failure_signature: string;
    workflow_id: string;
    scope_key: string;
    payload: Record<string, unknown>;
  }): Promise<{ external_id: string | null; accepted: boolean }>;
}

export interface ModelGatewayProvider {
  readonly provider_id: string;
  invoke(input: {
    model: string;
    messages: unknown[];
    metadata?: Record<string, unknown>;
  }): Promise<{ output: unknown; telemetry?: Record<string, unknown> }>;
}

export interface ExternalExecutionProvider {
  readonly provider_id: string;
  startSession(input: {
    workflow_id: string;
    scope_key: string;
    repository?: string;
    task: string;
  }): Promise<{ external_session_id: string; status: string }>;
}
