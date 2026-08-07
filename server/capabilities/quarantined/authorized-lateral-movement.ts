export const AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256 =
  "102b1de105570177a0c0168ed81a921f175ebc7075314b28bf2b8faf2d02a486";

export const authorizedEnvironmentClasses = [
  "OWNED_LAB",
  "CTF",
  "AUTHORIZED_ENGAGEMENT",
] as const;

export type AuthorizedEnvironmentClass = (typeof authorizedEnvironmentClasses)[number];

export type AuthorizedLateralMovementNode = {
  id: string;
  label: string;
  authorized: true;
};

export type AuthorizedLateralMovementEdge = {
  from: string;
  to: string;
  relationship: string;
  detection_points?: string[];
};

export type AuthorizedLateralMovementGateInput = {
  action: "plan";
  mode: "SIMULATION";
  safe_word: string;
  environment: {
    name: string;
    class: AuthorizedEnvironmentClass;
    authorization_reference: string;
    target_boundary: string[];
    permitted_objective: string;
  };
  topology: {
    start_node: string;
    goal_node: string;
    nodes: AuthorizedLateralMovementNode[];
    edges: AuthorizedLateralMovementEdge[];
  };
  constraints: {
    no_credentials: true;
    no_scanning: true;
    no_persistence: true;
    no_evasion: true;
    no_destructive_actions: true;
    no_availability_impact: true;
  };
};

export type AuthorizedLateralMovementGateOutput = {
  schema_name: "AuthorizedLateralMovementGateOutput";
  schema_version: "1.0";
  receipt_id: string;
  candidate_id: "skill-candidate:analyze-authorized-lateral-movement-paths:v0.1";
  lifecycle: "QUARANTINED_CANDIDATE";
  mode: "SIMULATION";
  tool_call_required: true;
  tool_called: true;
  safe_word_verified: true;
  authorization_asserted: true;
  authorization_verified_by_system: false;
  output_scope: "READ_ONLY_PATH_ANALYSIS";
  environment: {
    name: string;
    class: AuthorizedEnvironmentClass;
    authorization_reference: string;
    target_boundary: string[];
    permitted_objective: string;
  };
  path: {
    found: boolean;
    node_ids: string[];
    hops: Array<{
      from: string;
      to: string;
      relationship: string;
      detection_points: string[];
      execution_instructions: null;
    }>;
  };
  controls: {
    credentials_used: false;
    scanning_performed: false;
    persistence_performed: false;
    evasion_performed: false;
    destructive_actions: false;
    availability_impact: false;
    external_effects: 0;
    source_mutations: 0;
  };
  stop_conditions: string[];
  generated_at: string;
};

export class AuthorizedLateralMovementGateError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 409) {
    super(`${code}: ${message}`);
  }
}

const normalizeText = (value: string) => value.trim();

const sensitiveOrOperationalPatterns = [
  /(?:password|passwd|pwd)\s*[:=]/i,
  /(?:bearer|token|cookie|session)\s+[a-z0-9._~+/=-]{8,}/i,
  /\b(?:psexec|wmiexec|smbexec|evil-winrm|mimikatz|rubeus|certipy|impacket)\b/i,
  /\b(?:pass-the-hash|pass-the-ticket|overpass-the-hash|dcsync|dcshadow)\b/i,
  /\b(?:disable|bypass|evade|tamper|clear logs?)\b/i,
] as const;

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const constantTimeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const assertNonEmpty = (value: string, code: string, label: string) => {
  if (!normalizeText(value)) throw new AuthorizedLateralMovementGateError(code, `${label} is required.`, 400);
};

const assertConstraints = (input: AuthorizedLateralMovementGateInput) => {
  const constraints = input.constraints;
  if (
    constraints.no_credentials !== true
    || constraints.no_scanning !== true
    || constraints.no_persistence !== true
    || constraints.no_evasion !== true
    || constraints.no_destructive_actions !== true
    || constraints.no_availability_impact !== true
  ) {
    throw new AuthorizedLateralMovementGateError(
      "UNSAFE_CONSTRAINTS",
      "Every non-execution and no-harm constraint must be explicitly true.",
    );
  }
};

const assertSanitizedInput = (input: AuthorizedLateralMovementGateInput) => {
  const text = JSON.stringify({
    environment: input.environment,
    topology: input.topology,
  });
  const matched = sensitiveOrOperationalPatterns.find((pattern) => pattern.test(text));
  if (matched) {
    throw new AuthorizedLateralMovementGateError(
      "SENSITIVE_OR_OPERATIONAL_INPUT_BLOCKED",
      "The tool accepts sanitized topology and relationship labels only, not secrets, command names, or operational intrusion instructions.",
    );
  }
};

const assertBoundary = (input: AuthorizedLateralMovementGateInput) => {
  const boundary = new Set(input.environment.target_boundary.map(normalizeText).filter(Boolean));
  if (boundary.size === 0) {
    throw new AuthorizedLateralMovementGateError("TARGET_BOUNDARY_REQUIRED", "At least one authorized node is required.", 400);
  }

  const nodeIds = new Set<string>();
  for (const node of input.topology.nodes) {
    assertNonEmpty(node.id, "NODE_ID_REQUIRED", "Node id");
    assertNonEmpty(node.label, "NODE_LABEL_REQUIRED", "Node label");
    if (node.authorized !== true || !boundary.has(node.id)) {
      throw new AuthorizedLateralMovementGateError(
        "SCOPE_BOUNDARY_VIOLATION",
        `Node '${node.id}' is not explicitly inside the declared target boundary.`,
      );
    }
    if (nodeIds.has(node.id)) {
      throw new AuthorizedLateralMovementGateError("DUPLICATE_NODE", `Node '${node.id}' is duplicated.`, 400);
    }
    nodeIds.add(node.id);
  }

  if (!nodeIds.has(input.topology.start_node) || !nodeIds.has(input.topology.goal_node)) {
    throw new AuthorizedLateralMovementGateError(
      "PATH_ENDPOINT_OUTSIDE_SCOPE",
      "Start and goal nodes must both exist inside the authorized topology.",
    );
  }

  for (const edge of input.topology.edges) {
    assertNonEmpty(edge.relationship, "RELATIONSHIP_REQUIRED", "Relationship");
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      throw new AuthorizedLateralMovementGateError(
        "EDGE_OUTSIDE_SCOPE",
        `Edge '${edge.from}' -> '${edge.to}' crosses outside the authorized topology.`,
      );
    }
  }
};

const findBoundedPath = (input: AuthorizedLateralMovementGateInput) => {
  const adjacency = new Map<string, AuthorizedLateralMovementEdge[]>();
  for (const edge of input.topology.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  const queue = [input.topology.start_node];
  const visited = new Set(queue);
  const previous = new Map<string, AuthorizedLateralMovementEdge>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (current === input.topology.goal_node) break;
    for (const edge of adjacency.get(current) ?? []) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      previous.set(edge.to, edge);
      queue.push(edge.to);
    }
  }

  if (!visited.has(input.topology.goal_node)) return { found: false, node_ids: [], hops: [] };

  const reversedEdges: AuthorizedLateralMovementEdge[] = [];
  let cursor = input.topology.goal_node;
  while (cursor !== input.topology.start_node) {
    const edge = previous.get(cursor);
    if (!edge) return { found: false, node_ids: [], hops: [] };
    reversedEdges.push(edge);
    cursor = edge.from;
  }

  const orderedEdges = reversedEdges.reverse();
  return {
    found: true,
    node_ids: [input.topology.start_node, ...orderedEdges.map((edge) => edge.to)],
    hops: orderedEdges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      relationship: edge.relationship,
      detection_points: [...(edge.detection_points ?? [])],
      execution_instructions: null,
    })),
  };
};

export const runAuthorizedLateralMovementGate = async (
  input: AuthorizedLateralMovementGateInput,
  now: () => string = () => new Date().toISOString(),
): Promise<AuthorizedLateralMovementGateOutput> => {
  if (input.action !== "plan") {
    throw new AuthorizedLateralMovementGateError("UNKNOWN_ACTION", "Only the read-only planning action is supported.", 400);
  }
  if (input.mode !== "SIMULATION") {
    throw new AuthorizedLateralMovementGateError("QUARANTINED_SIMULATION_ONLY", "LIVE execution is not available.");
  }

  assertNonEmpty(input.environment.name, "ENVIRONMENT_NAME_REQUIRED", "Environment name");
  assertNonEmpty(input.environment.authorization_reference, "AUTHORIZATION_REFERENCE_REQUIRED", "Authorization reference");
  assertNonEmpty(input.environment.permitted_objective, "PERMITTED_OBJECTIVE_REQUIRED", "Permitted objective");
  if (!authorizedEnvironmentClasses.includes(input.environment.class)) {
    throw new AuthorizedLateralMovementGateError("ENVIRONMENT_CLASS_BLOCKED", "Environment class is not eligible.");
  }

  const suppliedHash = await sha256Hex(input.safe_word);
  if (!constantTimeEqual(suppliedHash, AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256)) {
    throw new AuthorizedLateralMovementGateError("SAFE_WORD_REJECTED", "The activation interlock did not verify.", 403);
  }

  assertConstraints(input);
  assertSanitizedInput(input);
  assertBoundary(input);

  const generatedAt = now();
  const receiptBasis = JSON.stringify({
    candidate_id: "skill-candidate:analyze-authorized-lateral-movement-paths:v0.1",
    environment: input.environment,
    topology: input.topology,
    constraints: input.constraints,
    generated_at: generatedAt,
  });
  const receiptDigest = await sha256Hex(receiptBasis);

  return {
    schema_name: "AuthorizedLateralMovementGateOutput",
    schema_version: "1.0",
    receipt_id: `alm-${receiptDigest.slice(0, 24)}`,
    candidate_id: "skill-candidate:analyze-authorized-lateral-movement-paths:v0.1",
    lifecycle: "QUARANTINED_CANDIDATE",
    mode: "SIMULATION",
    tool_call_required: true,
    tool_called: true,
    safe_word_verified: true,
    authorization_asserted: true,
    authorization_verified_by_system: false,
    output_scope: "READ_ONLY_PATH_ANALYSIS",
    environment: {
      name: input.environment.name,
      class: input.environment.class,
      authorization_reference: input.environment.authorization_reference,
      target_boundary: [...input.environment.target_boundary],
      permitted_objective: input.environment.permitted_objective,
    },
    path: findBoundedPath(input),
    controls: {
      credentials_used: false,
      scanning_performed: false,
      persistence_performed: false,
      evasion_performed: false,
      destructive_actions: false,
      availability_impact: false,
      external_effects: 0,
      source_mutations: 0,
    },
    stop_conditions: [
      "safe word missing or rejected",
      "authorization reference or target boundary missing",
      "requested node or edge crosses the declared boundary",
      "secret-bearing or operational command material appears",
      "credentials, scanning, persistence, evasion, destructive action, or availability impact becomes necessary",
      "request changes from read-only path analysis to execution",
    ],
    generated_at: generatedAt,
  };
};

export const authorizedLateralMovementInputSchema = {
  $id: "aios://capabilities/authorized-lateral-movement/input/1.0.0",
  type: "object",
  additionalProperties: false,
  required: ["action", "mode", "safe_word", "environment", "topology", "constraints"],
  properties: {
    action: { const: "plan" },
    mode: { const: "SIMULATION" },
    safe_word: { type: "string", minLength: 1 },
    environment: { type: "object" },
    topology: { type: "object" },
    constraints: { type: "object" },
  },
} as const;

export const authorizedLateralMovementOutputSchema = {
  $id: "aios://capabilities/authorized-lateral-movement/output/1.0.0",
  type: "object",
  additionalProperties: false,
  required: [
    "receipt_id",
    "candidate_id",
    "lifecycle",
    "mode",
    "tool_call_required",
    "tool_called",
    "safe_word_verified",
    "authorization_asserted",
    "authorization_verified_by_system",
    "output_scope",
    "environment",
    "path",
    "controls",
    "stop_conditions",
    "generated_at",
  ],
} as const;
