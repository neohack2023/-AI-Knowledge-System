export const nextActionAutonomyBands = ["A0", "ADV", "A3", "A4", "A5"] as const;

export type NextActionAutonomyBand = (typeof nextActionAutonomyBands)[number];

export type NextActionDefinition = {
  command: string;
  label: string;
  description: string;
  autonomy: NextActionAutonomyBand;
  requires_approval: boolean;
  target_workflow_id?: string;
  terminal?: boolean;
};

export type BlockedNextAction = NextActionDefinition & {
  blocked_reason: string;
};

export type NextActionAuthorityContext = {
  read_from: string[];
  authority: string;
  write_authorized: boolean;
};

export type NextActionEnvelope = {
  execution_id: string;
  scope_key: string;
  workflow_id: string;
  current_state: string;
  result_class: string;
  authority_context: NextActionAuthorityContext;
  recommended_action: string | null;
  available_actions: NextActionDefinition[];
  blocked_actions: BlockedNextAction[];
  generated_at: string;
};

export type NextActionSelectionDecision = "SELECTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export type NextActionSelection = {
  command: string;
  target_workflow_id: string | null;
  selected_at: string;
  decision: NextActionSelectionDecision;
  decided_at: string | null;
  child_execution_id: string | null;
};

type PolicyState = {
  recommended_action?: string;
  actions: NextActionDefinition[];
};

type NextActionPolicy = {
  workflow_id: string;
  default_result_class: string;
  states: Record<string, PolicyState>;
};

const action = (
  command: string,
  label: string,
  description: string,
  options: Partial<Pick<NextActionDefinition, "autonomy" | "requires_approval" | "target_workflow_id" | "terminal">> = {},
): NextActionDefinition => ({
  command,
  label,
  description,
  autonomy: options.autonomy ?? "A0",
  requires_approval: options.requires_approval ?? false,
  ...(options.target_workflow_id ? { target_workflow_id: options.target_workflow_id } : {}),
  ...(options.terminal ? { terminal: true } : {}),
});

export const nextActionPolicies: NextActionPolicy[] = [
  {
    workflow_id: "resume-project",
    default_result_class: "RESUME_PACKET_READY",
    states: {
      RESUME_PACKET_READY: {
        recommended_action: "INSPECT_CURRENT_STATE",
        actions: [
          action("INSPECT_CURRENT_STATE", "Inspect current state", "Open the resolved handoff, constraints, and next bounded task."),
          action("RUN_MEMORY_AUDIT", "Run memory audit", "Check the resolved scope for drift, stale objects, and authority conflicts.", { target_workflow_id: "memory-audit" }),
          action("RUN_CROSS_PROJECT_COMPARISON", "Compare project boundaries", "Compare isolated scopes without merging sibling canon.", { target_workflow_id: "cross-project-comparison" }),
          action("CLOSE_SESSION", "End here", "Close the workflow without creating a durable change.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "memory-audit",
    default_result_class: "AUDIT_FINDINGS_READY",
    states: {
      AUDIT_FINDINGS_READY: {
        recommended_action: "REVIEW_FINDINGS",
        actions: [
          action("REVIEW_FINDINGS", "Review findings", "Inspect contradictions, stale records, and scope leakage before proposing repair."),
          action("RUN_CROSS_PROJECT_COMPARISON", "Compare affected scopes", "Open a read-only comparison when more than one registered scope is involved.", { target_workflow_id: "cross-project-comparison" }),
          action("CREATE_STONE_CANDIDATES", "Prepare STONE candidates", "Enter the governed STONE to MASON workflow. No write occurs before approval.", { autonomy: "A3", requires_approval: true, target_workflow_id: "stone-mason-harvester" }),
          action("CLOSE_SESSION", "Keep report only", "Retain the audit result without promotion or repair.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "cross-project-comparison",
    default_result_class: "COMPARISON_READY",
    states: {
      COMPARISON_READY: {
        recommended_action: "REVIEW_DIFFERENCES",
        actions: [
          action("REVIEW_DIFFERENCES", "Review differences", "Inspect convergences and conflicts while preserving project isolation."),
          action("RUN_MEMORY_AUDIT", "Audit one scope", "Return to a bounded single-scope audit.", { target_workflow_id: "memory-audit" }),
          action("CLOSE_SESSION", "End comparison", "Close without modifying either scope.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "repository-state-sync",
    default_result_class: "REPOSITORY_DELTA_READY",
    states: {
      REPOSITORY_DELTA_READY: {
        recommended_action: "REVIEW_REPOSITORY_DELTA",
        actions: [
          action("REVIEW_REPOSITORY_DELTA", "Review repository delta", "Inspect changed repository facts before any memory synchronization."),
          action("OPEN_DEVELOPMENT_BRIDGE", "Open development bridge", "Prepare repository work through the governed A3 bridge.", { autonomy: "A3", requires_approval: true, target_workflow_id: "repository-development-bridge" }),
          action("CLOSE_SESSION", "Keep repository-only", "Close without creating a memory delta.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "repository-development-bridge",
    default_result_class: "DEVELOPMENT_RESULT_READY",
    states: {
      DEVELOPMENT_RESULT_READY: {
        recommended_action: "INSPECT_WRITE_PLAN",
        actions: [
          action("INSPECT_WRITE_PLAN", "Inspect write plan", "Review exact destinations, preconditions, reversibility, and verification steps."),
          action("RUN_REPOSITORY_STATE_SYNC", "Refresh repository state", "Return to the read-only repository fact sync.", { target_workflow_id: "repository-state-sync" }),
          action("CLOSE_SESSION", "End development bridge", "Close without another execution.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "stone-mason-harvester",
    default_result_class: "GOVERNED_WRITE_RECEIPT_READY",
    states: {
      GOVERNED_WRITE_RECEIPT_READY: {
        recommended_action: "INSPECT_RECEIPT",
        actions: [
          action("INSPECT_RECEIPT", "Inspect receipt", "Review the verified destinations, deltas, and execution evidence."),
          action("RUN_MEMORY_AUDIT", "Audit the updated scope", "Verify memory health after the governed write.", { target_workflow_id: "memory-audit" }),
          action("CLOSE_SESSION", "Close episode", "End the governed episode with the receipt intact.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "research-harvest",
    default_result_class: "RESEARCH_PACKET_COMPLETE",
    states: {
      RESEARCH_PACKET_COMPLETE: {
        recommended_action: "VERIFY_CLAIMS",
        actions: [
          action("VERIFY_CLAIMS", "Verify disputed claims", "Check load-bearing claims against authoritative sources."),
          action("MAP_ARCHITECTURE", "Map to our architecture", "Separate independent convergence, adoption candidates, and architectural differences."),
          action("CREATE_STONE_CANDIDATES", "Prepare STONE candidates", "Route reusable findings into governed candidate review.", { autonomy: "A3", requires_approval: true, target_workflow_id: "stone-mason-harvester" }),
          action("KEEP_AS_RESEARCH", "Keep as research only", "Retain the source packet without promoting memory.", { terminal: true }),
        ],
      },
    },
  },
  {
    workflow_id: "internal-runtime-diagnostic",
    default_result_class: "DIAGNOSTIC_COMPLETE",
    states: {
      DIAGNOSTIC_COMPLETE: {
        recommended_action: "INSPECT_DIAGNOSTIC",
        actions: [
          action("INSPECT_DIAGNOSTIC", "Inspect diagnostic", "Review the server-owned computation result and execution trace."),
          action("RERUN_DIAGNOSTIC", "Run again", "Create a child execution in the same scope using the same LIVE handler.", { target_workflow_id: "internal-runtime-diagnostic" }),
          action("CLOSE_EXECUTION", "Close execution", "End without creating another execution.", { terminal: true }),
        ],
      },
    },
  },
];

export const getDefaultResultClass = (workflowId: string) =>
  nextActionPolicies.find((policy) => policy.workflow_id === workflowId)?.default_result_class ?? null;

export type ResolveNextActionInput = {
  execution_id: string;
  scope_key: string;
  workflow_id: string;
  current_state: string;
  result_class: string;
  authority_context?: NextActionAuthorityContext;
  target_availability?: Record<string, { available: boolean; reason?: string }>;
  now?: () => string;
};

export const resolveNextActionEnvelope = (input: ResolveNextActionInput): NextActionEnvelope | null => {
  const policy = nextActionPolicies.find((candidate) => candidate.workflow_id === input.workflow_id);
  const state = policy?.states[input.result_class] ?? policy?.states[input.current_state];
  if (!policy || !state) return null;

  const available_actions: NextActionDefinition[] = [];
  const blocked_actions: BlockedNextAction[] = [];

  for (const candidate of state.actions) {
    if (candidate.target_workflow_id && input.target_availability) {
      const target = input.target_availability[candidate.target_workflow_id];
      if (!target?.available) {
        blocked_actions.push({
          ...candidate,
          blocked_reason: target?.reason ?? `Target workflow '${candidate.target_workflow_id}' is unavailable in this executor.`,
        });
        continue;
      }
    }
    available_actions.push(candidate);
  }

  const recommended = state.recommended_action && available_actions.some((candidate) => candidate.command === state.recommended_action)
    ? state.recommended_action
    : available_actions[0]?.command ?? null;

  return {
    execution_id: input.execution_id,
    scope_key: input.scope_key,
    workflow_id: input.workflow_id,
    current_state: input.current_state,
    result_class: input.result_class,
    authority_context: input.authority_context ?? {
      read_from: [],
      authority: "Unspecified",
      write_authorized: false,
    },
    recommended_action: recommended,
    available_actions,
    blocked_actions,
    generated_at: (input.now ?? (() => new Date().toISOString()))(),
  };
};
