import type {
  CapabilityCandidate,
  CapabilityDecisionReasonCode,
  CapabilityDiscoveryInput,
  CapabilityPolicyEvaluation,
  RuntimeCapabilityDefinition,
} from "./types.ts";

const normalize = (value: string) => value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
const tokens = (value: string) => new Set(normalize(value).split("-").filter(Boolean));

const tokenOverlap = (left: string, right: string) => {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let matches = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) matches += 1;
  return matches / Math.max(leftTokens.size, rightTokens.size);
};

const scopeMatches = (patterns: string[], scopeKey: string) => patterns.includes("*") || patterns.includes(scopeKey);

const candidateFrom = (
  definition: RuntimeCapabilityDefinition,
  score: number,
  matchReasons: string[],
  authorityCompatible: boolean,
  scopeCompatible: boolean,
  modeCompatible: boolean,
  healthCompatible: boolean,
): CapabilityCandidate => ({
  capability_id: definition.capability_id,
  capability_version: definition.version,
  name: definition.name,
  workflow_id: definition.workflow_id,
  match_score: Number(score.toFixed(4)),
  match_reasons: matchReasons,
  overlap_group: definition.overlap_group,
  precedence_priority: definition.precedence_priority,
  authority_compatible: authorityCompatible,
  scope_compatible: scopeCompatible,
  mode_compatible: modeCompatible,
  health_compatible: healthCompatible,
  autonomy_band: definition.autonomy_band,
  approval_required: definition.approval_required,
  materialization_requires_approval: definition.materialization_requires_approval,
  reversibility: definition.reversibility,
  blast_radius: definition.blast_radius,
  input_schema_ref: definition.input_schema_ref,
  output_schema_ref: definition.output_schema_ref,
  expected_schema_fingerprint: definition.expected_schema_fingerprint,
});

export const evaluateCapabilityPolicy = (
  definition: RuntimeCapabilityDefinition,
  input: CapabilityDiscoveryInput,
  handlerAvailable: boolean,
): CapabilityPolicyEvaluation => {
  const reasonCodes: CapabilityDecisionReasonCode[] = [];
  const reasonDetails: string[] = [];
  const matchReasons: string[] = [];
  const normalizedIntent = normalize(input.intent_class);
  const normalizedIntentText = normalize(input.intent_text ?? "");

  let score = 0;
  if (input.requested_capability_id) {
    if (definition.capability_id === input.requested_capability_id) {
      score = 1;
      matchReasons.push("explicit capability request");
    } else {
      reasonCodes.push("REQUESTED_CAPABILITY_MISMATCH");
      reasonDetails.push(`Request targeted '${input.requested_capability_id}', not '${definition.capability_id}'.`);
    }
  } else {
    const exactIntent = definition.intent_classes.find((intentClass) => normalize(intentClass) === normalizedIntent);
    if (exactIntent) {
      score = 1;
      matchReasons.push(`exact intent class '${exactIntent}'`);
    } else {
      const intentSimilarity = Math.max(0, ...definition.intent_classes.map((intentClass) => tokenOverlap(intentClass, input.intent_class)));
      const exampleSimilarity = Math.max(
        0,
        ...definition.positive_examples.map((example) => tokenOverlap(example, input.intent_text ?? input.intent_class)),
        tokenOverlap(definition.description, input.intent_text ?? input.intent_class),
      );
      score = Math.max(intentSimilarity * 0.85, exampleSimilarity * 0.7);
      if (score >= 0.35) matchReasons.push(`semantic boundary match ${score.toFixed(2)}`);
      else {
        reasonCodes.push("INTENT_MISMATCH");
        reasonDetails.push(`Intent '${input.intent_class}' did not match this capability's registered boundaries.`);
      }
    }
  }

  if (normalizedIntentText) {
    const negative = definition.negative_examples.find((example) => {
      const normalizedExample = normalize(example);
      return normalizedExample.length > 0 && normalizedIntentText.includes(normalizedExample);
    });
    if (negative) {
      reasonCodes.push("NEGATIVE_BOUNDARY_MATCH");
      reasonDetails.push(`Intent text matched negative boundary '${negative}'.`);
    }
  }

  if (definition.status !== "ACTIVE" || !definition.discoverable) {
    reasonCodes.push("STATUS_NOT_ACTIVE");
    reasonDetails.push(`Capability is ${definition.discoverable ? definition.status : "not discoverable"}.`);
  }

  const scopeDenied = scopeMatches(definition.scope_denylist, input.scope_key);
  const scopeCompatible = !scopeDenied && scopeMatches(definition.scope_allowlist, input.scope_key);
  if (scopeDenied) {
    reasonCodes.push("SCOPE_DENIED");
    reasonDetails.push(`Scope '${input.scope_key}' is explicitly denied.`);
  } else if (!scopeCompatible) {
    reasonCodes.push("SCOPE_MISMATCH");
    reasonDetails.push(`Scope '${input.scope_key}' is outside the capability allowlist.`);
  }

  const authorityCompatible = input.authority_domains?.length
    ? input.authority_domains.some((domain) => definition.authority_domains.includes(domain))
    : true;
  if (!authorityCompatible) {
    reasonCodes.push("AUTHORITY_MISMATCH");
    reasonDetails.push("Requested authority domains do not intersect the capability's declared authority domains.");
  }

  const modeCompatible = definition.execution_modes.includes(input.mode);
  if (!modeCompatible) {
    reasonCodes.push("MODE_UNSUPPORTED");
    reasonDetails.push(`Capability does not support ${input.mode}.`);
  }

  const healthCompatible = definition.health.status === "VERIFIED";
  if (!healthCompatible) {
    reasonCodes.push("HEALTH_NOT_VERIFIED");
    reasonDetails.push(`Capability health is ${definition.health.status}.`);
  }

  if (!handlerAvailable) {
    reasonCodes.push("HANDLER_UNAVAILABLE");
    reasonDetails.push(`No registered handler is available for '${definition.workflow_id}'.`);
  }

  const candidate = candidateFrom(
    definition,
    score,
    matchReasons,
    authorityCompatible,
    scopeCompatible,
    modeCompatible,
    healthCompatible,
  );

  return {
    candidate,
    eligible: reasonCodes.length === 0,
    reason_codes: reasonCodes,
    reason_details: reasonDetails,
  };
};
