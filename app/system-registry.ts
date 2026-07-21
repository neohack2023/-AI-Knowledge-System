export type RuntimeStatus =
  | "QUEUED" | "ACTIVE" | "WAITING" | "COMPLETED" | "WARNING"
  | "FAILED" | "APPROVAL REQUIRED" | "CANCELLED";

export type StageId =
  | "source" | "scope" | "capability" | "retrieval" | "stone"
  | "mason" | "write-plan" | "approval" | "execution" | "verification" | "receipt";

export type ScopeDefinition = {
  key: string;
  label: string;
  project: string;
  aliases: string[];
  authority: string;
  source: string;
  repository?: { name: string; visibility: string; branch: string; head: string; lastCommit: string };
};

export const scopeRegistry: ScopeDefinition[] = [
  {
    key: "global-working-memory",
    label: "AI_MEMORY_OS / AI Knowledge System",
    project: "Global Working Memory Layer",
    aliases: ["AI_MEMORY_OS", "AI Memory OS", "AI Knowledge System", "AI_KNOWLEDGE_SYSTEM"],
    authority: "SNAPSHOT · Notion authoritative · Drive shadow",
    source: "SNAPSHOT · Project Scope Registry · 2026-07-19",
  },
  {
    key: "udio-algorithms",
    label: "music-system / Ne0 Hack / Lexi Con",
    project: "Udio Algorithms",
    aliases: ["music-system", "Ne0 Hack", "Lexi Con", "NL", "Suno Lab", "Producer AI"],
    authority: "SNAPSHOT · Notion authoritative · Drive shadow",
    source: "SNAPSHOT · Project Scope Registry · 2026-07-19",
  },
  {
    key: "girls-of-gaming",
    label: "Girls of Gaming",
    project: "Girl of gameing",
    aliases: ["Girls of Gaming", "Girl of Gaming", "GoG"],
    authority: "SNAPSHOT · Notion authoritative · Drive shadow",
    source: "SNAPSHOT · Project Scope Registry · 2026-07-19",
  },
  {
    key: "github:neohack2023/Looper",
    label: "Looper",
    project: "Looper GitHub repo",
    aliases: ["Looper", "Looper GitHub R&D", "neohack2023/Looper"],
    authority: "SNAPSHOT · GitHub repository facts · Notion project memory",
    source: "SNAPSHOT · Project Scope Registry + GitHub identity",
    repository: {
      name: "neohack2023/Looper", visibility: "private", branch: "main",
      head: "9091c6a", lastCommit: "Remove accidental write probe · 2026-06-22",
    },
  },
];

export type WorkflowStage = {
  id: StageId;
  label: string;
  eventStart: string;
  eventComplete: string;
  operation: string;
  source: string;
  authority: string;
  duration: number;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  capability: string;
  version: string;
  autonomy: "A0" | "A3" | "A4" | "A5";
  approvalRequired: boolean;
  supportsPause: boolean;
  supportsCancel: boolean;
  status: "Active" | "Review";
  allowedScopes: string[];
  stages: WorkflowStage[];
};

const stage = (
  id: StageId, label: string, eventStart: string, eventComplete: string,
  operation: string, source: string, authority: string, duration = 650,
): WorkflowStage => ({ id, label, eventStart, eventComplete, operation, source, authority, duration });

const common = {
  source: stage("source", "Intent", "workflow.started", "intent.accepted", "Bound invocation", "Chat / runtime", "Non-authoritative", 420),
  scope: stage("scope", "Scope resolution", "scope.resolution.started", "scope.resolved", "Exact registry join", "Project Scope Registry", "Drive shadow / Notion authority", 620),
  capability: stage("capability", "Capability", "capability.selection.started", "capability.selected", "Registry lookup", "Capability Registry", "Drive runtime control", 520),
  retrieval: stage("retrieval", "Retrieval", "retrieval.started", "retrieval.completed", "Smallest trustworthy packet", "Bound source adapters", "Source-specific", 820),
  stone: stage("stone", "STONE", "stone.started", "stone.completed", "Filter + lock manifest", "Bound episode", "Notion memory authority", 850),
  mason: stage("mason", "MASON", "mason.started", "mason.completed", "Assemble governed objects", "Locked STONE manifest", "Notion memory authority", 920),
  plan: stage("write-plan", "Write plan", "mason.write_plan.started", "mason.write_plan.created", "Digest-ready mutation plan", "MASON", "Destination authority", 700),
  approval: stage("approval", "Authorization", "approval.required", "approval.granted", "Human authorization", "Governance gate", "User authority", 0),
  execution: stage("execution", "Execution", "execution.started", "execution.completed", "Authorized delta only", "Selected executor", "Destination authority", 760),
  verification: stage("verification", "Verification", "verification.started", "verification.completed", "Re-fetch + compare", "Destination source", "Source-specific", 700),
  receipt: stage("receipt", "Receipt", "receipt.started", "receipt.created", "Immutable run closure", "Execution ledger", "Execution evidence", 520),
};

// Registry-backed presentation: the UI derives its launcher, paths, trust bands and gates from this collection.
export const workflowRegistry: WorkflowDefinition[] = [
  {
    id: "resume-project", name: "Resume Project", capability: "cap:resume-project", version: "1.0",
    autonomy: "A0", approvalRequired: false, supportsPause: true, supportsCancel: true, status: "Active", allowedScopes: ["*"],
    stages: [common.source, common.scope, common.capability, common.retrieval, common.verification, common.receipt],
  },
  {
    id: "memory-audit", name: "Memory Audit", capability: "cap:memory-audit", version: "1.0",
    autonomy: "A0", approvalRequired: false, supportsPause: true, supportsCancel: true, status: "Active", allowedScopes: ["*"],
    stages: [common.source, common.scope, common.capability, common.retrieval, common.stone, common.verification, common.receipt],
  },
  {
    id: "cross-project-comparison", name: "Cross-Project Comparison", capability: "cap:cross-project-comparison", version: "1.0",
    autonomy: "A0", approvalRequired: false, supportsPause: true, supportsCancel: true, status: "Active", allowedScopes: ["*"],
    stages: [common.source, common.scope, common.capability, common.retrieval, common.mason, common.verification, common.receipt],
  },
  {
    id: "repository-state-sync", name: "Repository State Sync", capability: "cap:github-repository-state-sync", version: "1.0",
    autonomy: "A0", approvalRequired: false, supportsPause: true, supportsCancel: true, status: "Active",
    allowedScopes: ["github:neohack2023/Looper"],
    stages: [common.source, common.scope, common.capability, { ...common.retrieval, source: "GitHub", authority: "GitHub execution facts", operation: "Delta-first repository inventory" }, common.verification, common.receipt],
  },
  {
    id: "repository-development-bridge", name: "Repository Project Development Bridge", capability: "cap:repository-project-development-bridge", version: "1.0",
    autonomy: "A3", approvalRequired: true, supportsPause: true, supportsCancel: true, status: "Review",
    allowedScopes: ["github:neohack2023/Looper"],
    stages: [common.source, common.scope, common.capability, { ...common.retrieval, source: "GitHub + Notion", authority: "Split authority" }, common.mason, common.plan, common.approval, common.execution, common.verification, common.receipt],
  },
  {
    id: "stone-mason-harvester", name: "STONE → MASON Single-Chat Harvester", capability: "cap:stone-mason-single-chat-harvester", version: "1.0",
    autonomy: "A3", approvalRequired: true, supportsPause: true, supportsCancel: true, status: "Active", allowedScopes: ["*"],
    stages: [common.source, common.scope, common.capability, common.retrieval, common.stone, common.mason, common.plan, common.approval, common.execution, common.verification, common.receipt],
  },
];

export type GraphNode = { id: StageId | string; label: string; type: string; x: number; y: number; z: number; detail: string };
export type GraphEdge = { source: string; target: string; relation: string };

export const graphNodes: GraphNode[] = [
  { id: "source", label: "SOURCE", type: "input", x: -4.8, y: .1, z: -.8, detail: "Bound user intent or source object" },
  { id: "scope", label: "SCOPE", type: "router", x: -3.4, y: -1.15, z: .8, detail: "Exact registered scope identity" },
  { id: "capability", label: "CAPABILITY", type: "router", x: -2.4, y: 1.25, z: -.35, detail: "Registry-selected workflow contract" },
  { id: "retrieval", label: "RETRIEVAL", type: "read", x: -1.15, y: -.4, z: 1.1, detail: "Smallest trustworthy packet · read only" },
  { id: "stone", label: "STONE", type: "governance", x: .15, y: -1.5, z: -.3, detail: "Selective · Tagged · Optimized · Navigable · Evolving" },
  { id: "mason", label: "MASON", type: "governance", x: 1.0, y: .65, z: 1.15, detail: "Memory Assembly System for Optimized Navigation" },
  { id: "write-plan", label: "WRITE PLAN", type: "plan", x: 2.05, y: -1.0, z: -.25, detail: "Exact destinations, deltas, preconditions and recovery" },
  { id: "approval", label: "APPROVAL", type: "gate", x: 3.0, y: .7, z: .9, detail: "Human authorization boundary" },
  { id: "execution", label: "EXECUTION", type: "write", x: 4.0, y: -1.0, z: -.45, detail: "Authorized mutation · never retrieval" },
  { id: "verification", label: "VERIFY", type: "verify", x: 4.75, y: 1.2, z: .65, detail: "SIMULATION · re-fetch and compare destination state" },
  { id: "receipt", label: "RECEIPT", type: "evidence", x: 5.7, y: -.1, z: -.2, detail: "SIMULATION · execution closure" },
  { id: "notion", label: "NOTION", type: "authority", x: -.2, y: 2.65, z: -1.3, detail: "SNAPSHOT · authoritative migrated project memory until governed cutover" },
  { id: "drive", label: "DRIVE", type: "source", x: 1.8, y: 2.55, z: -1.5, detail: "SNAPSHOT · runtime control plane and drive_shadow surfaces" },
  { id: "github", label: "GITHUB", type: "authority", x: 3.85, y: 2.55, z: -1.1, detail: "SNAPSHOT · authoritative repository execution facts" },
];

export const graphEdges: GraphEdge[] = [
  { source: "source", target: "scope", relation: "resolve" },
  { source: "scope", target: "capability", relation: "select" },
  { source: "capability", target: "retrieval", relation: "invoke" },
  { source: "retrieval", target: "stone", relation: "filter" },
  { source: "retrieval", target: "mason", relation: "assemble read result" },
  { source: "retrieval", target: "verification", relation: "verify read" },
  { source: "stone", target: "mason", relation: "locked manifest" },
  { source: "mason", target: "write-plan", relation: "propose" },
  { source: "mason", target: "verification", relation: "verify analysis" },
  { source: "write-plan", target: "approval", relation: "authorize" },
  { source: "approval", target: "execution", relation: "grant" },
  { source: "execution", target: "verification", relation: "observe result" },
  { source: "verification", target: "receipt", relation: "close" },
  { source: "notion", target: "retrieval", relation: "memory authority" },
  { source: "drive", target: "scope", relation: "runtime registry" },
  { source: "github", target: "retrieval", relation: "repository facts" },
];

export const projectUniverses = [
  ["AI_MEMORY_OS", "global-working-memory", "Governance + routing"],
  ["Udio Algorithms", "udio-algorithms", "Music systems"],
  ["Girls of Gaming", "girls-of-gaming", "Canon-sensitive assets"],
  ["Looper", "github:neohack2023/Looper", "Repository-backed"],
  ["Ne0 Hack × Lexi Con", "udio-algorithms", "Persona + NL workflows"],
  ["Daily Derail", "unregistered", "Project identity pending"],
  ["Gemini Gems", "unregistered", "Project identity pending"],
  ["Sora", "unregistered", "Project identity pending"],
  ["Ubuntu / ML", "unregistered", "Project identity pending"],
] as const;
