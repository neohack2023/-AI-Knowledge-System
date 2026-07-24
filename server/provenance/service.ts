import type {
  ContextProvenanceEmission,
  ContextProvenanceEnvelope,
  GovernedWriteAuthorization,
  ProvenanceExecutionBinding,
} from "./types.ts";

const nonEmpty = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

export class ProvenanceValidationError extends Error {
  constructor(readonly code: string, readonly issues: string[]) {
    super(issues.join(" "));
  }
}

export class ContextProvenanceService {
  emit(binding: ProvenanceExecutionBinding, input: ContextProvenanceEmission): ContextProvenanceEnvelope {
    const now = new Date().toISOString();
    const envelope: ContextProvenanceEnvelope = {
      schema_name: "ContextProvenanceEnvelope",
      schema_version: "1.0",
      envelope_id: crypto.randomUUID(),
      object_id: input.object_id,
      object_type: input.object_type,
      operation: input.operation,
      scope_key: binding.scope_key,

      source_system: input.source_system,
      source_id: input.source_id,
      source_version: input.source_version ?? null,
      source_fingerprint: input.source_fingerprint,
      retrieved_at: input.retrieved_at ?? null,
      object_fingerprint: input.object_fingerprint,

      parent_evidence_ids: [...(input.parent_evidence_ids ?? [])],
      transform_chain: structuredClone(input.transform_chain ?? []),

      authority_owner: input.authority_owner,
      authority_domain: input.authority_domain,
      authority_state: input.authority_state,
      authority_conflict_state: input.authority_conflict_state ?? "NONE",
      confidence: input.confidence ?? null,

      access_policy_refs: [...input.access_policy_refs],
      write_policy_refs: [...(input.write_policy_refs ?? [])],

      used_by_execution_id: binding.execution_id,
      workflow_id: binding.workflow_id,
      trace_id: input.trace_id ?? null,
      span_id: input.span_id ?? null,

      mason_episode_id: input.mason_episode_id ?? null,
      write_plan_id: input.write_plan_id ?? null,
      authorization_id: input.authorization_id ?? null,
      execution_receipt_id: input.execution_receipt_id ?? null,
      destination: input.destination ?? null,
      write_authorized: input.write_authorized ?? false,

      emitted_at: now,
      validated_at: now,
    };

    const issues = this.validate(envelope);
    if (issues.length) throw new ProvenanceValidationError("PROVENANCE_VALIDATION_FAILED", issues);
    return envelope;
  }

  validate(envelope: ContextProvenanceEnvelope): string[] {
    const issues: string[] = [];
    const requiredStrings: Array<[string, string | null | undefined]> = [
      ["envelope_id", envelope.envelope_id],
      ["object_id", envelope.object_id],
      ["object_type", envelope.object_type],
      ["scope_key", envelope.scope_key],
      ["source_system", envelope.source_system],
      ["source_id", envelope.source_id],
      ["source_fingerprint", envelope.source_fingerprint],
      ["object_fingerprint", envelope.object_fingerprint],
      ["authority_owner", envelope.authority_owner],
      ["authority_domain", envelope.authority_domain],
      ["used_by_execution_id", envelope.used_by_execution_id],
      ["workflow_id", envelope.workflow_id],
      ["emitted_at", envelope.emitted_at],
      ["validated_at", envelope.validated_at],
    ];

    for (const [field, value] of requiredStrings) {
      if (!nonEmpty(value)) issues.push(`${field} is required.`);
    }

    if (envelope.confidence !== null && (envelope.confidence < 0 || envelope.confidence > 1)) {
      issues.push("confidence must be between 0 and 1 when provided.");
    }
    if (envelope.access_policy_refs.length === 0) issues.push("access_policy_refs must not be empty.");

    if (envelope.operation === "RETRIEVAL") {
      if (!nonEmpty(envelope.retrieved_at)) issues.push("retrieved_at is required for RETRIEVAL envelopes.");
    }

    if (envelope.operation === "TRANSFORMATION") {
      if (envelope.parent_evidence_ids.length === 0) issues.push("TRANSFORMATION envelopes require parent_evidence_ids.");
      if (envelope.transform_chain.length === 0) issues.push("TRANSFORMATION envelopes require transform_chain.");
    }

    if (envelope.operation === "GOVERNED_WRITE") {
      if (envelope.parent_evidence_ids.length === 0) issues.push("GOVERNED_WRITE envelopes require parent_evidence_ids.");
      if (envelope.transform_chain.length === 0) issues.push("GOVERNED_WRITE envelopes require transform_chain.");
      if (!envelope.write_authorized) issues.push("GOVERNED_WRITE requires write_authorized=true.");
      if (envelope.write_policy_refs.length === 0) issues.push("GOVERNED_WRITE requires write_policy_refs.");
      if (!nonEmpty(envelope.mason_episode_id)) issues.push("GOVERNED_WRITE requires mason_episode_id.");
      if (!nonEmpty(envelope.write_plan_id)) issues.push("GOVERNED_WRITE requires write_plan_id.");
      if (!nonEmpty(envelope.authorization_id)) issues.push("GOVERNED_WRITE requires authorization_id.");
      if (!nonEmpty(envelope.execution_receipt_id)) issues.push("GOVERNED_WRITE requires execution_receipt_id.");
      if (!nonEmpty(envelope.destination)) issues.push("GOVERNED_WRITE requires destination.");
    }

    return issues;
  }

  assertGovernedWriteAuthorization(input: GovernedWriteAuthorization) {
    const issues: string[] = [];
    if (!input.write_authorized) issues.push("write_authorized must be true before a governed write may execute.");
    if (input.write_policy_refs.length === 0) issues.push("write_policy_refs must identify at least one governing policy.");
    if (!nonEmpty(input.mason_episode_id)) issues.push("mason_episode_id is required before a governed write may execute.");
    if (!nonEmpty(input.write_plan_id)) issues.push("write_plan_id is required before a governed write may execute.");
    if (!nonEmpty(input.authorization_id)) issues.push("authorization_id is required before a governed write may execute.");
    if (!nonEmpty(input.destination)) issues.push("destination is required before a governed write may execute.");
    if (issues.length) throw new ProvenanceValidationError("PROVENANCE_WRITE_NOT_AUTHORIZED", issues);
  }
}
