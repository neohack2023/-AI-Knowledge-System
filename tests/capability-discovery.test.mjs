import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("capability-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const endpoint = "http://localhost/api/capabilities";

const post = async (body) => {
  const response = await worker.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "oai-authenticated-user-email": "capability-test@example.com" },
    body: JSON.stringify(body),
  }), env, ctx);
  return { response, body: await response.json() };
};

test("runtime capability inventory exposes summaries without preloading executable schemas", async () => {
  const response = await worker.fetch(new Request(endpoint), env, ctx);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.capability_registry_contract, "RuntimeCapabilityDefinition/1.0");
  assert.equal(body.capability_discovery_contract, "CapabilityDiscoveryEnvelope/1.0");
  assert.equal(body.capability_materialization_contract, "MaterializedCapability/1.0");
  assert.equal(body.execution_authority, "NONE");
  assert.equal(body.persistence, "PROCESS_LOCAL");
  assert.match(body.registry_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(body.registry_fingerprint_basis, "FULL_POLICY_DEFINITION");
  assert.match(body.inventory_projection_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(body.registry_fingerprint, body.inventory_projection_fingerprint);
  assert.ok(body.capabilities.some((capability) => capability.capability_id === "cap:internal-runtime-diagnostic"));
  assert.ok(body.capabilities.every((capability) => !("input_schema" in capability)));
});

test("materialized discovery schema matches the exact discover API response", async () => {
  const requestBody = {
    action: "discover",
    execution_id: "execution-discovery-contract-test",
    workflow_id: "aios-master-operator",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "capability-discovery",
    requested_capability_id: "cap:capability-discovery",
    authority_domains: ["runtime-capability-registry"],
  };
  const discovered = await post(requestBody);
  assert.equal(discovered.response.status, 201);

  const discoveryId = discovered.body.envelope.discovery_id;
  const selected = await post({
    action: "select",
    discovery_id: discoveryId,
    capability_id: "cap:capability-discovery",
  });
  assert.equal(selected.response.status, 200);

  const materialized = await post({ action: "materialize", discovery_id: discoveryId });
  assert.equal(materialized.response.status, 200);
  const capability = materialized.body.materialized_capability;
  assert.equal(capability.capability_version, "1.1.0");
  assert.equal(capability.input_schema.properties.action.const, "discover");
  assert.deepEqual(
    [...capability.input_schema.required].sort(),
    ["action", "intent_class", "mode", "scope_key"].sort(),
  );

  const outputSchema = capability.output_schema;
  assert.equal(outputSchema.additionalProperties, false);
  assert.ok(!("discovery_envelope" in outputSchema.properties));
  for (const requiredKey of outputSchema.required) {
    assert.ok(Object.hasOwn(discovered.body, requiredKey), `discover response is missing required key '${requiredKey}'`);
  }
  assert.deepEqual(
    Object.keys(discovered.body).sort(),
    Object.keys(outputSchema.properties).sort(),
  );
});

test("discovery preserves exact scope and records eligible and rejected candidates", async () => {
  const discovered = await post({
    action: "discover",
    execution_id: "execution-capability-test",
    workflow_id: "aios-master-operator",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "runtime-diagnostic",
    requested_capability_id: "cap:internal-runtime-diagnostic",
    authority_domains: ["server-runtime-execution-state"],
  });

  assert.equal(discovered.response.status, 201);
  assert.equal(discovered.body.requested_by, "capability-test@example.com");
  assert.equal(discovered.body.envelope.scope_key, "global-working-memory");
  assert.equal(discovered.body.envelope.execution_id, "execution-capability-test");
  assert.equal(discovered.body.envelope.workflow_id, "aios-master-operator");
  assert.equal(discovered.body.envelope.resolution_state, "MATCHED");
  assert.equal(discovered.body.envelope.recommended_capability_id, "cap:internal-runtime-diagnostic");
  assert.deepEqual(
    discovered.body.envelope.eligible_candidates.map((candidate) => candidate.capability_id),
    ["cap:internal-runtime-diagnostic"],
  );
  assert.ok(discovered.body.envelope.eligible_candidates[0].match_reasons.includes("explicit capability candidate constraint"));
  assert.ok(discovered.body.envelope.rejected_candidates.some((candidate) => (
    candidate.capability_id === "cap:capability-discovery"
    && candidate.reason_codes.includes("REQUESTED_CAPABILITY_MISMATCH")
  )));
  assert.deepEqual(discovered.body.events.map((event) => event.event_type), [
    "capability.discovery.started",
    "capability.candidate.returned",
    "capability.candidate.rejected",
    "capability.discovery.completed",
  ]);
});

test("explicit capability IDs constrain candidates but do not bypass intent boundaries", async () => {
  const discovered = await post({
    action: "discover",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "write-canon-now",
    requested_capability_id: "cap:internal-runtime-diagnostic",
    authority_domains: ["server-runtime-execution-state"],
  });

  assert.equal(discovered.response.status, 201);
  assert.equal(discovered.body.envelope.resolution_state, "NO_MATCH");
  assert.equal(discovered.body.envelope.recommended_capability_id, null);
  assert.deepEqual(discovered.body.envelope.eligible_candidates, []);
  const requested = discovered.body.envelope.rejected_candidates.find((candidate) => (
    candidate.capability_id === "cap:internal-runtime-diagnostic"
  ));
  assert.ok(requested);
  assert.ok(requested.match_reasons.includes("explicit capability candidate constraint"));
  assert.ok(requested.reason_codes.includes("INTENT_MISMATCH"));

  const selected = await post({
    action: "select",
    discovery_id: discovered.body.envelope.discovery_id,
    capability_id: "cap:internal-runtime-diagnostic",
  });
  assert.equal(selected.response.status, 409);
  assert.equal(selected.body.error.code, "CAPABILITY_SELECTION_BLOCKED");
});

test("schema materialization requires an eligible selection and never authorizes execution", async () => {
  const discovered = await post({
    action: "discover",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "runtime-diagnostic",
    requested_capability_id: "cap:internal-runtime-diagnostic",
    authority_domains: ["server-runtime-execution-state"],
  });
  const discoveryId = discovered.body.envelope.discovery_id;

  const premature = await post({ action: "materialize", discovery_id: discoveryId });
  assert.equal(premature.response.status, 409);
  assert.equal(premature.body.error.code, "CAPABILITY_NOT_SELECTED");

  const selected = await post({
    action: "select",
    discovery_id: discoveryId,
    capability_id: "cap:internal-runtime-diagnostic",
  });
  assert.equal(selected.response.status, 200);
  assert.equal(selected.body.selection.decision, "SELECTED");
  assert.equal(selected.body.selection.authorization_scope, "MATERIALIZATION_ONLY");
  assert.equal(selected.body.selection.execution_authorized, false);
  assert.equal(selected.body.selection.destination_write_authorized, false);

  const materialized = await post({ action: "materialize", discovery_id: discoveryId });
  assert.equal(materialized.response.status, 200);
  assert.equal(materialized.body.materialized_capability.capability_id, "cap:internal-runtime-diagnostic");
  assert.equal(materialized.body.materialized_capability.fingerprint_verified, true);
  assert.match(materialized.body.materialized_capability.schema_fingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.equal(materialized.body.materialized_capability.execution_authorized, false);
  assert.equal(materialized.body.materialized_capability.destination_write_authorized, false);
  assert.ok(materialized.body.materialized_capability.input_schema);
  assert.ok(materialized.body.events.some((event) => event.event_type === "capability.schema.loaded"));
});

test("authority mismatch rejects the requested capability and blocks selection", async () => {
  const discovered = await post({
    action: "discover",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "runtime-diagnostic",
    requested_capability_id: "cap:internal-runtime-diagnostic",
    authority_domains: ["notion-authoritative-memory"],
  });
  assert.equal(discovered.response.status, 201);
  assert.equal(discovered.body.envelope.resolution_state, "NO_MATCH");
  const rejected = discovered.body.envelope.rejected_candidates.find((candidate) => (
    candidate.capability_id === "cap:internal-runtime-diagnostic"
  ));
  assert.ok(rejected.reason_codes.includes("AUTHORITY_MISMATCH"));

  const selected = await post({
    action: "select",
    discovery_id: discovered.body.envelope.discovery_id,
    capability_id: "cap:internal-runtime-diagnostic",
  });
  assert.equal(selected.response.status, 409);
  assert.equal(selected.body.error.code, "CAPABILITY_SELECTION_BLOCKED");
});

test("unmatched intent returns an observable no-match result rather than inventing a tool", async () => {
  const discovered = await post({
    action: "discover",
    scope_key: "global-working-memory",
    mode: "LIVE",
    intent_class: "write-canon-now",
  });
  assert.equal(discovered.response.status, 201);
  assert.equal(discovered.body.envelope.resolution_state, "NO_MATCH");
  assert.equal(discovered.body.envelope.recommended_capability_id, null);
  assert.deepEqual(discovered.body.envelope.eligible_candidates, []);
  assert.ok(discovered.body.envelope.rejected_candidates.every((candidate) => (
    candidate.reason_codes.includes("INTENT_MISMATCH")
  )));
});
