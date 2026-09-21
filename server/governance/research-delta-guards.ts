export type RepositoryInstructionInput = {
  primary_instruction: { present: boolean; digest: string | null };
  portable_instruction: { present: boolean; digest: string | null };
  provider_supports_portable_instruction: boolean;
};

export type RepositoryInstructionResolution = {
  contract: "RepositoryInstructionResolution/0.1";
  selected_source: "PRIMARY" | "PORTABLE" | "NONE";
  selected_digest: string | null;
  reason_codes: string[];
  provenance_complete: boolean;
};

const validDigest = (value: string | null) => typeof value === "string" && value.trim().length > 0;

export function resolveRepositoryInstructionSource(
  input: RepositoryInstructionInput,
): RepositoryInstructionResolution {
  const reasons: string[] = [];

  if (input.primary_instruction.present) {
    if (!validDigest(input.primary_instruction.digest)) {
      return {
        contract: "RepositoryInstructionResolution/0.1",
        selected_source: "NONE",
        selected_digest: null,
        reason_codes: ["PRIMARY_DIGEST_REQUIRED"],
        provenance_complete: false,
      };
    }
    if (input.portable_instruction.present) reasons.push("PORTABLE_SHADOWED_BY_PRIMARY");
    return {
      contract: "RepositoryInstructionResolution/0.1",
      selected_source: "PRIMARY",
      selected_digest: input.primary_instruction.digest,
      reason_codes: reasons,
      provenance_complete: true,
    };
  }

  if (!input.portable_instruction.present) {
    return {
      contract: "RepositoryInstructionResolution/0.1",
      selected_source: "NONE",
      selected_digest: null,
      reason_codes: ["NO_INSTRUCTION_SOURCE"],
      provenance_complete: true,
    };
  }

  if (!input.provider_supports_portable_instruction) {
    return {
      contract: "RepositoryInstructionResolution/0.1",
      selected_source: "NONE",
      selected_digest: null,
      reason_codes: ["PORTABLE_SOURCE_UNSUPPORTED_BY_PROVIDER"],
      provenance_complete: true,
    };
  }

  if (!validDigest(input.portable_instruction.digest)) {
    return {
      contract: "RepositoryInstructionResolution/0.1",
      selected_source: "NONE",
      selected_digest: null,
      reason_codes: ["PORTABLE_DIGEST_REQUIRED"],
      provenance_complete: false,
    };
  }

  return {
    contract: "RepositoryInstructionResolution/0.1",
    selected_source: "PORTABLE",
    selected_digest: input.portable_instruction.digest,
    reason_codes: [],
    provenance_complete: true,
  };
}

export type ModelVerificationBinding = {
  requested_model: string;
  resolved_model: string;
  availability_policy_revision: string;
  verification_digest: string;
  deprecated_at: string | null;
};

export type ModelVerificationReuseInput = {
  prior: ModelVerificationBinding;
  current: {
    requested_model: string;
    resolved_model: string;
    availability_policy_revision: string;
    substituted: boolean;
  };
  now: string;
};

export type ModelVerificationReuseAssessment = {
  contract: "ModelVerificationReuseAssessment/0.1";
  state: "FRESH" | "STALE";
  reason_codes: string[];
  inherited_behavioral_verification: boolean;
};

export function assessModelVerificationReuse(
  input: ModelVerificationReuseInput,
): ModelVerificationReuseAssessment {
  const reasons: string[] = [];
  const nowMs = Date.parse(input.now);
  const deprecatedAtMs = input.prior.deprecated_at ? Date.parse(input.prior.deprecated_at) : null;

  if (!input.prior.verification_digest.trim()) reasons.push("VERIFICATION_DIGEST_REQUIRED");
  if (input.prior.requested_model !== input.current.requested_model) reasons.push("REQUESTED_MODEL_CHANGED");
  if (input.prior.resolved_model !== input.current.resolved_model) reasons.push("RESOLVED_MODEL_CHANGED");
  if (input.prior.availability_policy_revision !== input.current.availability_policy_revision) {
    reasons.push("AVAILABILITY_POLICY_CHANGED");
  }
  if (input.current.substituted) reasons.push("MODEL_SUBSTITUTION_OCCURRED");
  if (!Number.isFinite(nowMs)) reasons.push("CURRENT_TIME_INVALID");
  if (input.prior.deprecated_at && !Number.isFinite(deprecatedAtMs)) {
    reasons.push("DEPRECATION_TIME_INVALID");
  } else if (deprecatedAtMs !== null && Number.isFinite(nowMs) && deprecatedAtMs <= nowMs) {
    reasons.push("MODEL_DEPRECATED");
  }

  return {
    contract: "ModelVerificationReuseAssessment/0.1",
    state: reasons.length ? "STALE" : "FRESH",
    reason_codes: reasons,
    inherited_behavioral_verification: reasons.length === 0,
  };
}

export type StagedArtifactPublicationInput = {
  stage_authorized: boolean;
  publish_authorized: boolean;
  staged_digest: string;
  approved_digest: string | null;
  acknowledgement: "ACK" | "REJECTED" | "UNKNOWN";
  observed_published_digest: string | null;
};

export type StagedArtifactPublicationAssessment = {
  contract: "StagedArtifactPublicationAssessment/0.1";
  state: "BLOCKED" | "FAILED" | "VERIFY_REQUIRED" | "AMBIGUOUS_NO_RETRY" | "VERIFIED_PUBLISHED";
  reason_codes: string[];
  retry_authorized: boolean;
  publication_authorized: boolean;
};

export function assessStagedArtifactPublication(
  input: StagedArtifactPublicationInput,
): StagedArtifactPublicationAssessment {
  const blocked: string[] = [];
  if (!input.stage_authorized) blocked.push("STAGE_AUTHORITY_REQUIRED");
  if (!input.publish_authorized) blocked.push("PUBLISH_AUTHORITY_REQUIRED");
  if (!input.staged_digest.trim()) blocked.push("STAGED_DIGEST_REQUIRED");
  if (!input.approved_digest?.trim()) blocked.push("APPROVED_DIGEST_REQUIRED");
  if (input.approved_digest && input.staged_digest !== input.approved_digest) {
    blocked.push("APPROVAL_DIGEST_MISMATCH");
  }

  if (blocked.length) {
    return {
      contract: "StagedArtifactPublicationAssessment/0.1",
      state: "BLOCKED",
      reason_codes: blocked,
      retry_authorized: false,
      publication_authorized: false,
    };
  }

  if (input.observed_published_digest && input.observed_published_digest !== input.staged_digest) {
    return {
      contract: "StagedArtifactPublicationAssessment/0.1",
      state: "BLOCKED",
      reason_codes: ["PUBLISHED_DIGEST_CONFLICT"],
      retry_authorized: false,
      publication_authorized: true,
    };
  }

  if (input.observed_published_digest === input.staged_digest) {
    return {
      contract: "StagedArtifactPublicationAssessment/0.1",
      state: "VERIFIED_PUBLISHED",
      reason_codes: [],
      retry_authorized: false,
      publication_authorized: true,
    };
  }

  if (input.acknowledgement === "REJECTED") {
    return {
      contract: "StagedArtifactPublicationAssessment/0.1",
      state: "FAILED",
      reason_codes: ["PUBLISH_REJECTED"],
      retry_authorized: true,
      publication_authorized: true,
    };
  }

  if (input.acknowledgement === "UNKNOWN") {
    return {
      contract: "StagedArtifactPublicationAssessment/0.1",
      state: "AMBIGUOUS_NO_RETRY",
      reason_codes: ["READBACK_REQUIRED_BEFORE_RETRY"],
      retry_authorized: false,
      publication_authorized: true,
    };
  }

  return {
    contract: "StagedArtifactPublicationAssessment/0.1",
    state: "VERIFY_REQUIRED",
    reason_codes: ["PUBLISH_READBACK_REQUIRED"],
    retry_authorized: false,
    publication_authorized: true,
  };
}

export type AgentToolAuthorityInput = {
  principal_id: string;
  principal_scopes: string[];
  tool_id: string;
  tool_schema_revision: string;
  capability_class: "READ_ONLY" | "MUTATING";
  required_scopes: string[];
  run_identity: string;
  mutation_expected: boolean;
};

export type AgentToolAuthorityAssessment = {
  contract: "AgentToolAuthorityAssessment/0.1";
  state: "ALLOW" | "BLOCK";
  reason_codes: string[];
  effect_receipt_required: boolean;
};

export function evaluateAgentToolAuthority(
  input: AgentToolAuthorityInput,
): AgentToolAuthorityAssessment {
  const reasons: string[] = [];
  const normalizedScopes = new Set(input.principal_scopes.map((scope) => scope.trim()).filter(Boolean));

  if (!input.principal_id.trim()) reasons.push("PRINCIPAL_ID_REQUIRED");
  if (!input.tool_id.trim()) reasons.push("TOOL_ID_REQUIRED");
  if (!input.tool_schema_revision.trim()) reasons.push("TOOL_SCHEMA_REVISION_REQUIRED");
  if (!input.run_identity.trim()) reasons.push("RUN_IDENTITY_REQUIRED");
  for (const scope of input.required_scopes) {
    if (!normalizedScopes.has(scope.trim())) reasons.push("MISSING_SCOPE:" + scope.trim());
  }

  if (input.capability_class === "READ_ONLY" && input.mutation_expected) {
    reasons.push("READ_ONLY_TOOL_CANNOT_DECLARE_MUTATION");
  }
  if (input.capability_class === "MUTATING" && !input.mutation_expected) {
    reasons.push("MUTATION_EXPECTATION_REQUIRED");
  }

  return {
    contract: "AgentToolAuthorityAssessment/0.1",
    state: reasons.length ? "BLOCK" : "ALLOW",
    reason_codes: reasons,
    effect_receipt_required: input.capability_class === "MUTATING",
  };
}
