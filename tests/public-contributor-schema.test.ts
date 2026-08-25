import assert from "node:assert/strict";
import test from "node:test";

import { validatePublicContributorCandidate } from "../shared/public-contributor-schema.ts";

const contrib0001Fixture = {
  contributor: {
    provider: "Clout AI",
    model: "Clout AI",
    version: "unknown",
    runtime: "external model runtime",
    pseudonymousContributorId: "external-model-0001",
    identityConfidence: "SELF_DECLARED",
  },
  candidate: {
    title: "HOT_PATH Passive Staleness Signal — stale_since Field + MASON-Write Invalidation Hook",
    classification: "OBSERVED_GAP",
    affectedScope: "global-working-memory",
    documentedOrObservedGap: "HOT_PATH currently discovers stale projections reactively during resolver reads.",
    proposedImprovement: "Add a stale_since invalidation signal and receipt-linked post-mutation invalidation path.",
    publicSafeProvenancePointers: [],
    compatibilityAndRegressionSurface: "HOT_PATH resolver, governed mutation lifecycle, dependency index, receipt completion semantics.",
    risksAndFailureModes: "Partial invalidation failure must fail closed and prevent affected fast-path use until reconciliation.",
    verificationPlan: "Exercise stale precheck bypass, full reconciliation, marker clear after successful re-verification, and partial failure semantics.",
    overlapResult: "No direct duplicate accepted; preserve existing freshness and drift classification authority.",
    promotionRecommendation: "KEEP_AS_CANDIDATE",
  },
  candidateState: "CANDIDATE",
  writeAuthorization: "NONE",
};

test("CONTRIB-0001 remains compatible with PUBLIC_CONTRIBUTOR_SCHEMA_01", () => {
  const result = validatePublicContributorCandidate(contrib0001Fixture);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.candidate.classification, "OBSERVED_GAP");
  assert.equal(result.value.writeAuthorization, "NONE");
  assert.ok(result.warnings.some((warning) => warning.includes("No public provenance")));
});

test("rejects missing required fields", () => {
  const result = validatePublicContributorCandidate({ candidateState: "CANDIDATE", writeAuthorization: "NONE" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("provider is required")));
  assert.ok(result.errors.some((error) => error.includes("title is required")));
});

test("rejects authority escalation", () => {
  const result = validatePublicContributorCandidate({ ...contrib0001Fixture, writeAuthorization: "OWNER" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.includes("writeAuthorization must remain NONE."));
});

test("rejects private internal knowledge-store pointers", () => {
  const privatePointer = "https://app." + "notion.com/p/private-page";
  const result = validatePublicContributorCandidate({
    ...contrib0001Fixture,
    candidate: { ...contrib0001Fixture.candidate, publicSafeProvenancePointers: [privatePointer] },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("Private/internal knowledge-store URLs")));
});

test("rejects credential-like material", () => {
  const result = validatePublicContributorCandidate({
    ...contrib0001Fixture,
    candidate: { ...contrib0001Fixture.candidate, proposedImprovement: "Use this api key to call the service directly." },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("private conversation material")));
});

test("accepts a public HTTPS provenance pointer", () => {
  const result = validatePublicContributorCandidate({
    ...contrib0001Fixture,
    candidate: { ...contrib0001Fixture.candidate, publicSafeProvenancePointers: ["https://github.com/example/public-repo/issues/1"] },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.candidate.publicSafeProvenancePointers.length, 1);
});
