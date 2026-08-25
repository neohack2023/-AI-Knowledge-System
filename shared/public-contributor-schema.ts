export const IDENTITY_CONFIDENCE = ["SELF_DECLARED", "UNKNOWN"] as const;
export const CONTRIBUTION_CLASSIFICATION = ["DOCUMENTED_GAP", "OBSERVED_GAP", "PROPOSED_IMPROVEMENT"] as const;
export const REVIEW_RECOMMENDATION = ["KEEP_AS_CANDIDATE", "NEEDS_EVIDENCE", "REJECT_UNSAFE"] as const;

export type PublicContributorCandidate = {
  contributor: { provider: string; model: string; version?: string; runtime: string; pseudonymousContributorId: string; identityConfidence: (typeof IDENTITY_CONFIDENCE)[number] };
  candidate: { title: string; classification: (typeof CONTRIBUTION_CLASSIFICATION)[number]; affectedScope: string; documentedOrObservedGap: string; proposedImprovement: string; publicSafeProvenancePointers: string[]; compatibilityAndRegressionSurface: string; risksAndFailureModes: string; verificationPlan: string; overlapResult: string; promotionRecommendation: (typeof REVIEW_RECOMMENDATION)[number] };
  candidateState: "CANDIDATE";
  writeAuthorization: "NONE";
};

export type PublicContributorValidationResult =
  | { ok: true; value: PublicContributorCandidate; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

const sensitive = [
  /\b(password|passwd|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|authorization header)\b/i,
  /\b(private conversation|private chat|raw transcript|account identifier|session cookie)\b/i,
  /\b(sk-[a-z0-9_-]{12,})\b/i,
  /\b(gh[pousr]_[a-z0-9]{20,})\b/i,
];
const escalation = [
  /\b(write authorization|write_authorization)\s*[:=]\s*(?!none\b)/i,
  /\b(promote|promotion)\s+(directly\s+)?to\s+(canon|memory|registry)/i,
  /\b(bypass|skip)\s+(stone|mason|approval|governance)/i,
  /\b(authority|permission)\s*[:=]\s*(owner|write|admin|mason)/i,
];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const required = (value: unknown, label: string, errors: string[]) => {
  if (typeof value !== "string" || !value.trim()) { errors.push(`${label} is required.`); return ""; }
  return value.trim();
};
const optional = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
function enumValue<T extends readonly string[]>(value: unknown, allowed: T, label: string, errors: string[]): T[number] | undefined {
  if (typeof value !== "string" || !allowed.includes(value)) { errors.push(`${label} must be one of: ${allowed.join(", ")}.`); return; }
  return value as T[number];
}
function validatePointer(value: string, errors: string[]) {
  let url: URL;
  try { url = new URL(value.trim()); } catch { errors.push(`Provenance pointer is not a valid URL: ${value}`); return null; }
  if (url.protocol !== "https:") { errors.push(`Provenance pointers must use https: ${value}`); return null; }
  const blockedHosts = ["app.notion.com", "drive.google.com", "docs.google.com"];
  if (blockedHosts.includes(url.hostname)) { errors.push(`Private/internal knowledge-store URLs are not accepted as public provenance: ${url.hostname}`); return null; }
  if (url.username || url.password || url.searchParams.has("token") || url.searchParams.has("key")) { errors.push(`Provenance pointer may contain credentials or access material: ${value}`); return null; }
  return url.toString();
}

export function validatePublicContributorCandidate(input: unknown): PublicContributorValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["Candidate payload must be an object."], warnings };
  const contributor = isRecord(input.contributor) ? input.contributor : {};
  const candidate = isRecord(input.candidate) ? input.candidate : {};
  const identityConfidence = enumValue(contributor.identityConfidence, IDENTITY_CONFIDENCE, "identityConfidence", errors) ?? "UNKNOWN";
  const classification = enumValue(candidate.classification, CONTRIBUTION_CLASSIFICATION, "classification", errors) ?? "OBSERVED_GAP";
  const promotionRecommendation = enumValue(candidate.promotionRecommendation, REVIEW_RECOMMENDATION, "promotionRecommendation", errors) ?? "KEEP_AS_CANDIDATE";
  if (input.candidateState !== "CANDIDATE") errors.push("candidateState must remain CANDIDATE.");
  if (input.writeAuthorization !== "NONE") errors.push("writeAuthorization must remain NONE.");
  const pointers: string[] = [];
  if (candidate.publicSafeProvenancePointers !== undefined) {
    if (!Array.isArray(candidate.publicSafeProvenancePointers)) errors.push("publicSafeProvenancePointers must be an array.");
    else for (const raw of candidate.publicSafeProvenancePointers) {
      if (typeof raw !== "string") errors.push("Each provenance pointer must be a URL string.");
      else { const valid = validatePointer(raw, errors); if (valid) pointers.push(valid); }
    }
  }
  const value: PublicContributorCandidate = {
    contributor: {
      provider: required(contributor.provider, "provider", errors),
      model: required(contributor.model, "model", errors),
      version: optional(contributor.version),
      runtime: required(contributor.runtime, "runtime", errors),
      pseudonymousContributorId: required(contributor.pseudonymousContributorId, "pseudonymousContributorId", errors),
      identityConfidence,
    },
    candidate: {
      title: required(candidate.title, "title", errors),
      classification,
      affectedScope: required(candidate.affectedScope, "affectedScope", errors),
      documentedOrObservedGap: required(candidate.documentedOrObservedGap, "documentedOrObservedGap", errors),
      proposedImprovement: required(candidate.proposedImprovement, "proposedImprovement", errors),
      publicSafeProvenancePointers: pointers,
      compatibilityAndRegressionSurface: required(candidate.compatibilityAndRegressionSurface, "compatibilityAndRegressionSurface", errors),
      risksAndFailureModes: required(candidate.risksAndFailureModes, "risksAndFailureModes", errors),
      verificationPlan: required(candidate.verificationPlan, "verificationPlan", errors),
      overlapResult: required(candidate.overlapResult, "overlapResult", errors),
      promotionRecommendation,
    },
    candidateState: "CANDIDATE",
    writeAuthorization: "NONE",
  };
  const textFields = [
    ...Object.values(value.contributor).filter((v): v is string => typeof v === "string"),
    ...Object.values(value.candidate).filter((v): v is string => typeof v === "string"),
  ];
  if (textFields.some((value) => sensitive.some((pattern) => pattern.test(value)))) errors.push("Candidate appears to contain private conversation material, credentials, tokens, or account identifiers.");
  if (textFields.some((value) => escalation.some((pattern) => pattern.test(value)))) errors.push("Candidate attempts to claim or bypass authority. Public contributions must remain candidate-only and write-blocked.");
  if (identityConfidence === "UNKNOWN") warnings.push("Model identity is unverified and should be presented as UNKNOWN.");
  if (!pointers.length) warnings.push("No public provenance pointer supplied. Review may classify the candidate as NEEDS_EVIDENCE.");
  return errors.length ? { ok: false, errors, warnings } : { ok: true, value, warnings };
}
