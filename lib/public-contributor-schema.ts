export const IDENTITY_CONFIDENCE = ["SELF_DECLARED", "UNKNOWN"] as const;
export const CONTRIBUTION_CLASSIFICATION = [
  "DOCUMENTED_GAP",
  "OBSERVED_GAP",
  "PROPOSED_IMROVEMENT",
] as const;
export const REVIEW_RECOMMENDATION = [
  "KEEP_AS_CANDIDATE",
  "NEEDS_EVIDENCE",
  "REJECT_UNSAFE",
] as const;

export type IdentityConfidence = (typeof IDENTITY_CONFIDENCE)[number];
export type ContributionClassification = (typeof CONTRIBUTION_CLASSIFICATION)[number];
export type ReviewRecommendation = (typeof REVIEW_RECOMMENDATION)[number];

export type PublicContributorCandidate = {
  contributor: {
    provider: string;
    model: string;
    version?: string;
    runtime: string;
    pseudonymousContributorId: string;
    identityConfidence: IdentityConfidence;
  };
  candidate: {
    title: string;
    classification: ContributionClassification;
    affectedScope: string;
    documentedOrObservedGap: string;
    proposedImprovement: string;
    publicSafeProvenancePointers: string[];
    compatibilityAndRegressionSurface: string;
    risksAndFailureModes: string;
    verificationPlan: string;
    overlapResult: string;
    promotionRecommendation: ReviewRecommendation;
  };
  candidateState: "CANDIDATE";
  writeAuthorization: "NONE";
};

export type PublicContributorValidationResult =
  | { ok: true; value: PublicContributorCandidate; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const PRIVATE_OR_SENSITIVE_PATTERNS: RegExp[] = [
  /\b(password|passwd|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|authorization header)\b/i,
  /\b(private conversation|private chat|raw transcript|account identifier|session cookie)\b/i,
  /\b(sk-[a-z0-9_-]{12,})\b/i,
  /\b(gh[pousr]_[a-z0-9]{20,})\b/i,
];

const FORBIDDEN_AUTHORITY_PATTERNS: RegExp[] = [
  /\b(write authorization|write_authorization)\s*[:=]\s*(?!none\b)/i,
  /\b(promote|promotion)\s+(directly\s+)?to\s+(canon|memory|registry)/i,
  /\b(bypass|skip)\s+(stone|mason|approval|governance)/i,
  /\b(authority|permission)\s*[:=]\s*(owner|write|admin|mason)/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} is required.`);
    return "";
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return typeof value === "string" ? value.trim() : undefined;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
  errors: string[],
): T[number] | undefined {
  if (typeof value !== "string" || !allowed.includes(value)) {
    errors.push(`${label} must be one of: ${allowed.join(", ")}.`);
    return undefined;
  }
  return value as T[number];
}

function containsSensitiveMaterial(value: string): boolean {
  return PRIVATE_OR_SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
}

function containsAuthorityEscalation(value: string): boolean {
  return FORBIDDEN_AUTHORITY_PATTERNS.some((pattern) => pattern.test(value));
}

function validatePublicPointer(value: string, errors: string[]): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    errors.push(`Provenance pointer is not a valid URL: ${trimmed}`);
    return null;
  }

  if (url.protocol !== "https:") {
    errors.push(`Provenance pointers must use https: ${trimmed}`);
    return null;
  }

  const blockedHosts = ["app.notion.com", "drive.google.com", "docs.google.com"];
  if (blockedHosts.includes(url.hostname)) {
    errors.push(`Private/internal knowledge-store URLs are not accepted as public provenance: ${url.hostname}`);
    return null;
  }

  if (url.username || url.password || url.searchParams.has("token") || url.searchParams.has("key")) {
    errors.push(`Provenance pointer may contain credentials or access material: ${trimmed}`);
    return null;
  }

  return url.toString();
}

function inspectTextFields(candidate: PublicContributorCandidate, errors: string[]) {
  const fields = [
    candidate.contributor.provider,
    candidate.contributor.model,
    candidate.contributor.version ?? "",
    candidate.contributor.runtime,
    candidate.contributor.pseudonymousContributorId,
    candidate.candidate.title,
    candidate.candidate.affectedScope,
    candidate.candidate.documentedOrObservedGap,
    candidate.candidate.proposedImprovement,
    candidate.candidate.compatibilityAndRegressionSurface,
    candidate.candidate.risksAndFailureModes,
    candidate.candidate.verificationPlan,
    candidate.candidate.overlapResult,
  ];

  if (fields.some(containsSensitiveMaterial)) {
    errors.push("Candidate appears to contain private conversation material, credentials, tokens, or account identifiers.");
  }

  if (fields.some(containsAuthorityEscalation)) {
    errors.push("Candidate attempts to claim or bypass authority. Public contributions must remain candidate-only and write-blocked.");
  }
}

export function validatePublicContributorCandidate(input: unknown): PublicContributorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) return { ok: false, errors: ["Candidate payload must be an object."], warnings };

  const contributorInput = isRecord(input.contributor) ? input.contributor : {};
  const candidateInput = isRecord(input.candidate) ? input.candidate : {};

  const identityConfidence = enumValue(
    contributorInput.identityConfidence,
    IDENTITY_CONFIDENCE,
    "identityConfidence",
    errors,
  );
  const classification = enumValue(
    candidateInput.classification,
    CONTRIBUTION_CLASSIFICATION,
    "classification",
    errors,
  );
  const promotionRecommendation = enumValue(
    candidateInput.promotionRecommendation,
    REVIEW_RECOMMENDATION,
    "promotionRecommendation",
    errors,
  );

  if (input.candidateState !== "CANDIDATE") {
    errors.push("candidateState must remain CANDIDATE.");
  }
  if (input.writeAuthorization !== "NONE") {
    errors.push("writeAuthorization must remain NONE.");
  }

  const rawPointers = candidateInput.publicSafeProvenancePointers;
  const publicSafeProvenancePointers: string[] = [];
  if (rawPointers !== undefined) {
    if (!Array.isArray(rawPointers)) {
      errors.push("publicSafeProvenancePointers must be an array.");
    } else {
      for (const pointer of rawPointers) {
        if (typeof pointer !== "string") {
          errors.push("Each provenance pointer must be a URL string.");
          continue;
        }
        const valid = validatePublicPointer(pointer, errors);
        if (valid) publicSafeProvenancePointers.push(valid);
      }
    }
  }

  const value: PublicContributorCandidate = {
    contributor: {
      provider: nonEmptyString(contributorInput.provider, "provider", errors),
      model: nonEmptyString(contributorInput.model, "model", errors),
      version: optionalString(contributorInput.version),
      runtime: nonEmptyString(contributorInput.runtime, "runtime", errors),
      pseudonymousContributorId: nonEmptyString(
        contributorInput.pseudonymousContributorId,
        "pseudonymousContributorId",
        errors,
      ),
      identityConfidence: identityConfidence ?? "UNKNOWN",
    },
    candidate: {
      title: nonEmptyString(candidateInput.title, "title", errors),
      classification: classification ?? "OBSERVED_GAP",
      affectedScope: nonEmptyString(candidateInput.affectedScope, "affectedScope", errors),
      documentedOrObservedGap: nonEmptyString(
        candidateInput.documentedOrObservedGap,
        "documentedOrObservedGap",
        errors,
      ),
      proposedImprovement: nonEmptyString(candidateInput.proposedImprovement, "proposedImprovement", errors),
      publicSafeProvenancePointers,
      compatibilityAndRegressionSurface: nonEmptyString(
        candidateInput.compatibilityAndRegressionSurface,
        "compatibilityAndRegressionSurface",
        errors,
      ),
      risksAndFailureModes: nonEmptyString(candidateInput.risksAndFailureModes, "risksAndFailureModes", errors),
      verificationPlan: nonEmptyString(candidateInput.verificationPlan, "verificationPlan", errors),
      overlapResult: nonEmptyString(candidateInput.overlapResult, "overlapResult", errors),
      promotionRecommendation: promotionRecommendation ?? "KEEP_AS_CANDIDATE",
    },
    candidateState: "CANDIDATE",
    writeAuthorization: "NONE",
  };

  inspectTextFields(value, errors);

  if (value.contributor.identityConfidence === "UNKNOWN") {
    warnings.push("Model identity is unverified and should be presented as UNKNOWN.");
  }
  if (value.candidate.publicSafeProvenancePointers.length === 0) {
    warnings.push("No public provenance pointer supplied. Review may classify the candidate as NEEDS_EVIDENCE.");
  }

  return errors.length > 0 ? { ok: false, errors, warnings } : { ok: true, value, warnings };
}
