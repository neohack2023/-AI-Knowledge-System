import { createHash } from "node:crypto";

import {
  SPATIAL_WEB_SCOPE_KEY,
  type L2ExpansionReason,
  type SpatialPacketAssemblyRequest,
  type SpatialPacketAssemblyResult,
} from "./contracts.ts";
import { isDurableReference } from "./validator.ts";

const baseL0Records = [
  "asset-pipeline-index",
  "compatibility-index",
  "performance-doctrine-index",
  "renderer-selection-index",
  "research-index-signal",
] as const;

const allowedL2Reasons = new Set<L2ExpansionReason>([
  "IMPLEMENTATION_DETAIL_REQUIRED",
  "CLAIM_DISPUTED",
  "VERSION_OR_BACKEND_CHANGED",
  "EXPERIMENT_REPRODUCTION",
  "BENCHMARK_COMPARISON",
]);

const uniqueSorted = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

const fingerprint = (value: unknown) => (
  `sha256:${createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex")}`
);

const normalizeTechnology = (value: string) => value.trim().toLowerCase();

const selectL1Records = (request: SpatialPacketAssemblyRequest) => {
  const selected: string[] = [];
  const technologies = uniqueSorted(request.named_technologies ?? []).map(normalizeTechnology);
  const signals = new Set(request.signals ?? []);

  for (const profile of request.engine_profiles ?? []) {
    const engine = normalizeTechnology(profile.engine_name);
    if (technologies.includes(engine)) selected.push(`engine-profile:${profile.profile_id}`);
  }

  const namesWebGpu = technologies.some((technology) => technology === "webgpu" || technology === "wgsl" || technology.includes("webgpu"));
  const namesAssetFormat = technologies.some((technology) => ["gltf", "glb"].includes(technology));

  if (signals.has("WEBGPU") || namesWebGpu) {
    selected.push(
      "webgpu-capability-profile",
      "webgpu-fallback-compatibility-policy",
      "shader-portability-rules",
      "adapter-device-loss-workflow",
    );
  }
  if (signals.has("ASSET_PIPELINE") || namesAssetFormat) {
    selected.push(
      "asset-runtime-audit-workflow",
      "asset-coordinate-scale-material-animation-checks",
      "asset-budget-provenance-rules",
    );
  }
  if (signals.has("PERFORMANCE")) {
    selected.push(
      "performance-diagnosis-workflow",
      "frame-time-memory-measurement-contract",
      "device-browser-environment-requirements",
    );
  }
  if (signals.has("SPATIAL_GRAPH")) {
    selected.push(
      "semantic-lod-rules",
      "graph-layout-picking-guidance",
      "label-dom-overlay-guidance",
      "reduced-motion-2d-fallback-requirements",
    );
  }
  if (signals.has("AI_GENERATED")) {
    selected.push(
      "generated-asset-validation-workflow",
      "generated-code-verification-workflow",
      "generated-content-provenance-licensing-checks",
    );
  }
  return uniqueSorted(selected);
};

export class SpatialPacketAssemblyError extends Error {
  readonly code: "INVALID_SCOPE" | "PROJECT_SCOPE_REQUIRED";

  constructor(code: SpatialPacketAssemblyError["code"], message: string) {
    super(message);
    this.name = "SpatialPacketAssemblyError";
    this.code = code;
  }
}

export const assembleSpatialWebPacket = (request: SpatialPacketAssemblyRequest): SpatialPacketAssemblyResult => {
  if (request.scope_key !== SPATIAL_WEB_SCOPE_KEY) {
    throw new SpatialPacketAssemblyError("INVALID_SCOPE", `scope_key must be ${SPATIAL_WEB_SCOPE_KEY}.`);
  }
  if (!request.project_scope || request.project_scope === SPATIAL_WEB_SCOPE_KEY) {
    throw new SpatialPacketAssemblyError("PROJECT_SCOPE_REQUIRED", "A distinct registered project scope is required.");
  }

  const selectedL0Records = [...baseL0Records].sort();
  const selectedL1Records = selectL1Records(request);
  const l2Reasons = uniqueSorted(request.l2_reasons ?? []).filter((reason) => allowedL2Reasons.has(reason as L2ExpansionReason));
  const requestedEvidence = uniqueSorted(request.requested_evidence_refs ?? []);
  const openedL2Evidence = l2Reasons.length > 0
    ? requestedEvidence.filter((reference) => isDurableReference(reference))
    : [];

  const unresolvedConflicts: string[] = [];
  if (requestedEvidence.length > 0 && l2Reasons.length === 0) {
    unresolvedConflicts.push("L2_EVIDENCE_REQUEST_REQUIRES_ALLOWED_REASON");
  }
  if (openedL2Evidence.length !== requestedEvidence.length && l2Reasons.length > 0) {
    unresolvedConflicts.push("INVALID_L2_REFERENCE_REJECTED");
  }

  const rejectedSiblingScopes = uniqueSorted(request.sibling_scope_candidates ?? [])
    .filter((scope) => scope !== request.project_scope && scope !== SPATIAL_WEB_SCOPE_KEY);

  const authorityDecisions = uniqueSorted([
    "GLOBAL_RESEARCH_REMAINS_NON_AUTHORITATIVE",
    "PROJECT_DECISIONS_REMAIN_IN_REGISTERED_PROJECT_SCOPE",
    "RETRIEVAL_EXPANSION_CANNOT_CHANGE_PROMOTION_STATE",
    ...(rejectedSiblingScopes.length > 0 ? ["UNREQUESTED_SIBLING_SCOPES_REJECTED"] : []),
  ]);

  const disclosureLevel: SpatialPacketAssemblyResult["disclosure_level"] = openedL2Evidence.length > 0
    ? "L2"
    : selectedL1Records.length > 0
      ? "L1"
      : "L0";

  const withoutFingerprint = {
    packet_id: "packet:spatial-web-core" as const,
    packet_version: "0.2.0" as const,
    status: "Candidate" as const,
    resolved_scope_key: request.scope_key,
    project_scope: request.project_scope,
    application_class: request.application_class,
    disclosure_level: disclosureLevel,
    selected_l0_records: selectedL0Records,
    selected_l1_records: selectedL1Records,
    opened_l2_evidence: openedL2Evidence,
    rejected_sibling_scopes: rejectedSiblingScopes,
    authority_decisions: authorityDecisions,
    unresolved_conflicts: uniqueSorted(unresolvedConflicts),
  };

  return {
    ...withoutFingerprint,
    packet_fingerprint: fingerprint(withoutFingerprint),
  };
};
