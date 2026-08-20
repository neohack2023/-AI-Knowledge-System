import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalReconcilerCapabilityId,
  canonicalReconciliationSchema,
  reconciliationProjectionClasses,
  type CanonicalStateProjection,
} from "../shared/canonical-state-reconciliation.ts";
import {
  CanonicalStateClassifierInputError,
  adapterReasonClassification,
  classifyCanonicalStateProjections,
  finalizeCanonicalStateReconciliation,
  reconciliationFindingPolicy,
} from "../shared/canonical-state-classifier.ts";
import { adapterReasonCodes } from "../shared/canonical-state-adapters.ts";

const makeProjection = (projection_class: CanonicalStateProjection["projection_class"]): CanonicalStateProjection => ({
  projection_class,
  adapter_id: `${projection_class}-adapter-v0.1`,
  source_system: projection_class === "runtime" ? "Google_Drive" : "Notion",
  source_id: `source:${projection_class}`,
  source_version: "v1",
  source_fingerprint: `fp:${projection_class}`,
  provenance_envelope_id: `prov:${projection_class}`,
  missing_provenance_reason: null,
  authority_owner: `owner:${projection_class}`,
  authority_domain: `domain:${projection_class}`,
  authority_state: projection_class === "runtime" ? "shadow" : "authoritative",
  freshness_anchor: `anchor:${projection_class}`,
  supersedes: null,
  status: "FRESH",
  reason_codes: [],
  observed_claims: {},
});

const healthy = () => reconciliationProjectionClasses.map(makeProjection);
const mutate = (
  projectionClass: CanonicalStateProjection["projection_class"],
  patch: Partial<CanonicalStateProjection>,
) => healthy().map((projection) => projection.projection_class === projectionClass ? { ...projection, ...patch } : projection);

const find = (result: ReturnType<typeof classifyCanonicalStateProjections>, reason: string) => (
  result.findings.find((finding) => finding.reason_code === reason)
);

test("every registered adapter reason code has a deterministic classifier mapping", () => {
  const registered = Object.values(adapterReasonCodes).flatMap((codes) => [...codes]).sort();
  assert.deepEqual(Object.keys(adapterReasonClassification).sort(), registered);
});

test("every registered finding class has an explicit policy row", () => {
  assert.deepEqual(
    Object.keys(reconciliationFindingPolicy).sort(),
    ["NO_DRIFT", "STALE_PROJECTION", "AUTHORITY_DRIFT", "POINTER_DRIFT", "SCHEMA_DRIFT", "UNAVAILABLE", "UNKNOWN", "PROJECTION_DRIFT", "SCOPE_ISOLATION_VIOLATION"].sort(),
  );
});

test("healthy projection set classifies as NO_DRIFT / HEALTHY", () => {
  const result = classifyCanonicalStateProjections("rec-healthy", healthy());
  assert.equal(result.overall_state, "HEALTHY");
  assert.equal(result.fail_visible, false);
  assert.equal(result.blocked_current_state_claim, false);
  assert.deepEqual(result.findings.map((finding) => finding.drift_class), ["NO_DRIFT"]);
});

test("stale projection classifies as STALE_PROJECTION / DRIFTED", () => {
  const result = classifyCanonicalStateProjections("rec-stale", mutate("handoff", {
    status: "STALE",
    reason_codes: ["HANDOFF_STALE"],
  }));
  assert.equal(result.overall_state, "DRIFTED");
  assert.equal(find(result, "HANDOFF_STALE")?.drift_class, "STALE_PROJECTION");
  assert.equal(result.fail_visible, true);
});

test("source unavailability classifies as UNAVAILABLE / DEGRADED", () => {
  const result = classifyCanonicalStateProjections("rec-unavailable", mutate("ledger", {
    status: "UNAVAILABLE",
    reason_codes: ["SOURCE_UNAVAILABLE"],
  }));
  assert.equal(result.overall_state, "DEGRADED");
  assert.equal(find(result, "SOURCE_UNAVAILABLE")?.drift_class, "UNAVAILABLE");
});

test("unproven freshness classifies as UNKNOWN / DEGRADED", () => {
  const result = classifyCanonicalStateProjections("rec-unknown", mutate("registry", {
    status: "UNKNOWN",
    reason_codes: ["FRESHNESS_UNPROVEN"],
  }));
  assert.equal(result.overall_state, "DEGRADED");
  assert.equal(find(result, "FRESHNESS_UNPROVEN")?.drift_class, "UNKNOWN");
});

test("scope leakage blocks before lower-severity drift", () => {
  const projections = mutate("scope", {
    status: "DRIFTED",
    reason_codes: ["SIBLING_SCOPE_LEAK"],
  });
  projections.find((projection) => projection.projection_class === "handoff")!.status = "STALE";
  projections.find((projection) => projection.projection_class === "handoff")!.reason_codes = ["HANDOFF_STALE"];
  const result = classifyCanonicalStateProjections("rec-scope-block", projections);
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(result.findings[0].drift_class, "SCOPE_ISOLATION_VIOLATION");
});

test("authority overreach blocks current state", () => {
  const result = classifyCanonicalStateProjections("rec-authority", mutate("runtime", {
    status: "DRIFTED",
    reason_codes: ["SHADOW_AUTHORITY_OVERREACH"],
  }));
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(find(result, "SHADOW_AUTHORITY_OVERREACH")?.drift_class, "AUTHORITY_DRIFT");
});

test("runtime schema mismatch classifies as SCHEMA_DRIFT / BLOCKED", () => {
  const result = classifyCanonicalStateProjections("rec-schema", mutate("runtime", {
    status: "DRIFTED",
    reason_codes: ["RUNTIME_SCHEMA_DRIFT"],
  }));
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(find(result, "RUNTIME_SCHEMA_DRIFT")?.drift_class, "SCHEMA_DRIFT");
});

test("missing supersession classifies as POINTER_DRIFT / BLOCKED", () => {
  const result = classifyCanonicalStateProjections("rec-pointer", mutate("handoff", {
    status: "DRIFTED",
    reason_codes: ["SUPERSESSION_MISSING"],
  }));
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(find(result, "SUPERSESSION_MISSING")?.drift_class, "POINTER_DRIFT");
});

test("interface mode mismatch classifies as PROJECTION_DRIFT / DRIFTED", () => {
  const result = classifyCanonicalStateProjections("rec-projection", mutate("interface", {
    status: "DRIFTED",
    reason_codes: ["INTERFACE_MODE_DRIFT"],
  }));
  assert.equal(result.overall_state, "DRIFTED");
  assert.equal(find(result, "INTERFACE_MODE_DRIFT")?.drift_class, "PROJECTION_DRIFT");
});

test("competing authoritative owners over one domain fail as AUTHORITY_DRIFT", () => {
  const projections = healthy();
  const scope = projections.find((projection) => projection.projection_class === "scope")!;
  const handoff = projections.find((projection) => projection.projection_class === "handoff")!;
  scope.authority_domain = "project-current-state";
  handoff.authority_domain = "project-current-state";
  scope.authority_owner = "Notion";
  handoff.authority_owner = "Drive";
  const result = classifyCanonicalStateProjections("rec-domain-conflict", projections);
  const conflict = find(result, "AUTHORITY_DOMAIN_CONFLICT");
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(conflict?.drift_class, "AUTHORITY_DRIFT");
  assert.deepEqual(conflict?.projection_classes, ["scope", "handoff"]);
});

test("unknown reason code fails closed as classifier schema drift", () => {
  const result = classifyCanonicalStateProjections("rec-unknown-code", mutate("registry", {
    status: "DRIFTED",
    reason_codes: ["TOTALLY_NEW_REASON"],
  }));
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(find(result, "CLASSIFIER_UNREGISTERED_REASON_CODE")?.drift_class, "SCHEMA_DRIFT");
});

test("non-current status without reason code fails closed", () => {
  const result = classifyCanonicalStateProjections("rec-missing-reason", mutate("handoff", {
    status: "STALE",
    reason_codes: [],
  }));
  assert.equal(result.overall_state, "BLOCKED");
  assert.equal(find(result, "CLASSIFIER_STATUS_REASON_MISSING")?.drift_class, "SCHEMA_DRIFT");
});

test("finding order and identities are deterministic across projection ordering", () => {
  const projections = mutate("interface", {
    status: "DRIFTED",
    reason_codes: ["INTERFACE_IMPLEMENTATION_OVERCLAIM", "INTERFACE_MODE_DRIFT"],
  });
  const forward = classifyCanonicalStateProjections("rec-order", projections);
  const reverse = classifyCanonicalStateProjections("rec-order", [...projections].reverse());
  assert.deepEqual(reverse, forward);
});

test("classifier rejects incomplete projection sets before policy evaluation", () => {
  assert.throws(
    () => classifyCanonicalStateProjections("rec-incomplete", healthy().slice(0, 5)),
    (error: unknown) => error instanceof CanonicalStateClassifierInputError
      && error.code === "CANONICAL_STATE_CLASSIFIER_INPUT_INVALID",
  );
});

test("finalizer injects deterministic findings and status into the reconciliation envelope", () => {
  const result = finalizeCanonicalStateReconciliation({
    schema: canonicalReconciliationSchema,
    reconciliation_id: "rec-finalize",
    execution_id: "exec-finalize",
    scope_key: "global-working-memory",
    capability_id: canonicalReconcilerCapabilityId,
    generated_at: "2026-08-20T22:35:00.000Z",
    mode: "READ_ONLY",
    write_authorization: "NONE",
    mutation_performed: false,
    projection_requirements: [...reconciliationProjectionClasses],
    projections: mutate("handoff", { status: "STALE", reason_codes: ["HANDOFF_STALE"] }),
  });
  assert.equal(result.overall_state, "DRIFTED");
  assert.equal(result.fail_visible, true);
  assert.equal(result.findings[0].reason_code, "HANDOFF_STALE");
});
