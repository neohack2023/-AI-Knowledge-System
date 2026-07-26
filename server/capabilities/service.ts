import { capabilitySchemaFingerprint, sha256Fingerprint } from "./fingerprint.ts";
import { evaluateCapabilityPolicy } from "./policy.ts";
import type {
  CapabilityCandidate,
  CapabilityDiscoveryEnvelope,
  CapabilityDiscoveryInput,
  MaterializedCapability,
  RejectedCapabilityCandidate,
  RuntimeCapabilityDefinition,
} from "./types.ts";

export class CapabilityDiscoveryError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 409) {
    super(message);
  }
}

export type CapabilityRegistryProvider = () => readonly RuntimeCapabilityDefinition[];

const reject = (
  candidate: CapabilityCandidate,
  reasonCodes: RejectedCapabilityCandidate["reason_codes"],
  reasonDetails: string[],
): RejectedCapabilityCandidate => ({
  ...candidate,
  decision: "REJECTED",
  reason_codes: reasonCodes,
  reason_details: reasonDetails,
});

export class CapabilityDiscoveryService {
  constructor(private readonly registryProvider: CapabilityRegistryProvider) {}

  listDefinitions() {
    return this.registryProvider().map((definition) => structuredClone(definition));
  }

  listSummaries() {
    return this.registryProvider().map((definition) => ({
      capability_id: definition.capability_id,
      name: definition.name,
      workflow_id: definition.workflow_id,
      version: definition.version,
      status: definition.status,
      intent_classes: [...definition.intent_classes],
      scope_allowlist: [...definition.scope_allowlist],
      autonomy_band: definition.autonomy_band,
      approval_required: definition.approval_required,
      health_status: definition.health.status,
      schema_refs: [definition.input_schema_ref, definition.output_schema_ref],
      source_authority: definition.source_authority,
    }));
  }

  async registryFingerprint() {
    return sha256Fingerprint(this.listSummaries());
  }

  async discover(input: CapabilityDiscoveryInput): Promise<CapabilityDiscoveryEnvelope> {
    if (!input.intent_class.trim()) {
      throw new CapabilityDiscoveryError("CAPABILITY_INTENT_REQUIRED", "intent_class is required.", 400);
    }
    if (!input.scope_key.trim()) {
      throw new CapabilityDiscoveryError("CAPABILITY_SCOPE_REQUIRED", "scope_key is required.", 400);
    }

    const definitions = this.registryProvider();
    const eligible: CapabilityCandidate[] = [];
    const rejected: RejectedCapabilityCandidate[] = [];

    for (const definition of definitions) {
      const evaluation = evaluateCapabilityPolicy(definition, input, definition.handler_ref.trim().length > 0);
      if (evaluation.eligible) eligible.push(evaluation.candidate);
      else rejected.push(reject(evaluation.candidate, evaluation.reason_codes, evaluation.reason_details));
    }

    const eligibleByOverlap = new Map<string, CapabilityCandidate[]>();
    for (const candidate of eligible) {
      if (!candidate.overlap_group) continue;
      const group = eligibleByOverlap.get(candidate.overlap_group) ?? [];
      group.push(candidate);
      eligibleByOverlap.set(candidate.overlap_group, group);
    }

    for (const [groupName, candidates] of eligibleByOverlap) {
      if (candidates.length < 2) continue;
      const ordered = [...candidates].sort((left, right) => (
        right.match_score - left.match_score
        || right.precedence_priority - left.precedence_priority
        || left.capability_id.localeCompare(right.capability_id)
      ));
      const winner = ordered[0];
      for (const loser of ordered.slice(1)) {
        const index = eligible.findIndex((candidate) => candidate.capability_id === loser.capability_id);
        if (index >= 0) eligible.splice(index, 1);
        rejected.push(reject(
          loser,
          ["OVERLAP_PRECEDENCE_LOST"],
          [`Overlap group '${groupName}' resolved to '${winner.capability_id}'.`],
        ));
      }
    }

    eligible.sort((left, right) => (
      right.match_score - left.match_score
      || right.precedence_priority - left.precedence_priority
      || left.capability_id.localeCompare(right.capability_id)
    ));
    rejected.sort((left, right) => left.capability_id.localeCompare(right.capability_id));

    const top = eligible[0];
    const second = eligible[1];
    const confidenceMargin = top && second ? Number((top.match_score - second.match_score).toFixed(4)) : top ? top.match_score : null;
    const ambiguous = Boolean(top && second && confidenceMargin !== null && confidenceMargin < 0.1);
    const generatedAt = (input.now ?? (() => new Date().toISOString()))();
    const registryFingerprint = await this.registryFingerprint();

    return {
      schema_name: "CapabilityDiscoveryEnvelope",
      schema_version: "1.0",
      discovery_id: crypto.randomUUID(),
      execution_id: input.execution_id ?? null,
      workflow_id: input.workflow_id ?? null,
      scope_key: input.scope_key,
      mode: input.mode,
      intent_class: input.intent_class,
      intent_text: input.intent_text ?? null,
      requested_capability_id: input.requested_capability_id ?? null,
      authority_domains: [...(input.authority_domains ?? [])],
      registry_version: "runtime-handler-registry/1.0",
      registry_fingerprint: registryFingerprint,
      candidates_considered: definitions.length,
      eligible_candidates: structuredClone(eligible),
      rejected_candidates: structuredClone(rejected),
      recommended_capability_id: ambiguous ? null : top?.capability_id ?? null,
      selection_confidence: top?.match_score ?? null,
      confidence_margin: confidenceMargin,
      resolution_state: eligible.length === 0 ? "NO_MATCH" : ambiguous ? "AMBIGUOUS" : "MATCHED",
      generated_at: generatedAt,
    };
  }

  async materialize(
    envelope: CapabilityDiscoveryEnvelope,
    capabilityId: string,
    now: () => string = () => new Date().toISOString(),
  ): Promise<MaterializedCapability> {
    const candidate = envelope.eligible_candidates.find((item) => item.capability_id === capabilityId);
    if (!candidate) {
      const blocked = envelope.rejected_candidates.find((item) => item.capability_id === capabilityId);
      if (blocked) {
        throw new CapabilityDiscoveryError(
          "CAPABILITY_MATERIALIZATION_BLOCKED",
          blocked.reason_details.join(" ") || `Capability '${capabilityId}' is not eligible.`,
        );
      }
      throw new CapabilityDiscoveryError("CAPABILITY_NOT_DISCOVERED", `Capability '${capabilityId}' was not returned by this discovery.`, 404);
    }

    const definition = this.registryProvider().find((item) => item.capability_id === capabilityId);
    if (!definition) throw new CapabilityDiscoveryError("CAPABILITY_DEFINITION_MISSING", `Capability '${capabilityId}' is no longer registered.`, 409);
    if (definition.health.status !== "VERIFIED") {
      throw new CapabilityDiscoveryError("CAPABILITY_HEALTH_BLOCKED", `Capability health is ${definition.health.status}.`, 409);
    }

    const fingerprint = await capabilitySchemaFingerprint(definition);
    if (fingerprint !== definition.expected_schema_fingerprint) {
      throw new CapabilityDiscoveryError(
        "CAPABILITY_SCHEMA_FINGERPRINT_MISMATCH",
        `Schema fingerprint mismatch for '${capabilityId}'.`,
        409,
      );
    }

    return {
      schema_name: "MaterializedCapability",
      schema_version: "1.0",
      discovery_id: envelope.discovery_id,
      execution_id: envelope.execution_id,
      capability_id: definition.capability_id,
      capability_version: definition.version,
      workflow_id: definition.workflow_id,
      scope_key: envelope.scope_key,
      input_schema_ref: definition.input_schema_ref,
      output_schema_ref: definition.output_schema_ref,
      input_schema: structuredClone(definition.input_schema),
      output_schema: structuredClone(definition.output_schema),
      schema_fingerprint: fingerprint,
      expected_schema_fingerprint: definition.expected_schema_fingerprint,
      fingerprint_verified: true,
      authorization_scope: "MATERIALIZATION_ONLY",
      execution_authorized: false,
      destination_write_authorized: false,
      materialized_at: now(),
    };
  }
}
