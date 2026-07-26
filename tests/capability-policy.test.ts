import assert from "node:assert/strict";
import test from "node:test";

import { internalRuntimeDiagnosticCapability } from "../server/capabilities/native-definitions.ts";
import { CapabilityDiscoveryError, CapabilityDiscoveryService } from "../server/capabilities/service.ts";
import type { CapabilityDiscoveryEnvelope, RuntimeCapabilityDefinition } from "../server/capabilities/types.ts";

const cloneDiagnostic = (): RuntimeCapabilityDefinition => structuredClone(internalRuntimeDiagnosticCapability);

const discoveryInput = (now: string) => ({
  scope_key: "global-working-memory",
  mode: "LIVE" as const,
  intent_class: "runtime-diagnostic",
  requested_capability_id: "cap:internal-runtime-diagnostic",
  authority_domains: ["server-runtime-execution-state"],
  now: () => now,
});

const expectCapabilityError = (code: string) => (error: unknown) => {
  assert.ok(error instanceof CapabilityDiscoveryError);
  assert.equal(error.code, code);
  return true;
};

test("expired VERIFIED health is rejected during discovery", async () => {
  const definition = cloneDiagnostic();
  definition.health.expires_at = "2026-07-26T14:59:59.000Z";
  const service = new CapabilityDiscoveryService(() => [definition]);

  const envelope = await service.discover(discoveryInput("2026-07-26T15:00:00.000Z"));
  assert.equal(envelope.resolution_state, "NO_MATCH");
  const rejected = envelope.rejected_candidates.find((candidate) => (
    candidate.capability_id === definition.capability_id
  ));
  assert.ok(rejected);
  assert.equal(rejected.health_compatible, false);
  assert.ok(rejected.reason_codes.includes("HEALTH_VERIFICATION_EXPIRED"));
});

test("health expiring after discovery blocks later materialization", async () => {
  const definition = cloneDiagnostic();
  definition.health.expires_at = "2026-07-26T15:05:00.000Z";
  const service = new CapabilityDiscoveryService(() => [definition]);

  const envelope = await service.discover(discoveryInput("2026-07-26T15:00:00.000Z"));
  assert.equal(envelope.resolution_state, "MATCHED");

  await assert.rejects(
    service.materialize(
      envelope,
      definition.capability_id,
      () => "2026-07-26T15:06:00.000Z",
    ),
    expectCapabilityError("CAPABILITY_HEALTH_EXPIRED"),
  );
});

test("definition version or schema identity changes invalidate discovery selection", async () => {
  let definitions: RuntimeCapabilityDefinition[] = [cloneDiagnostic()];
  const service = new CapabilityDiscoveryService(() => definitions);
  const envelope = await service.discover(discoveryInput("2026-07-26T15:00:00.000Z"));

  definitions = [{ ...structuredClone(definitions[0]), version: "1.2.1" }];

  await assert.rejects(
    service.materialize(
      envelope,
      internalRuntimeDiagnosticCapability.capability_id,
      () => "2026-07-26T15:01:00.000Z",
    ),
    expectCapabilityError("CAPABILITY_DEFINITION_CHANGED"),
  );
});

test("policy metadata drift invalidates the full discovery registry snapshot", async () => {
  let definitions: RuntimeCapabilityDefinition[] = [cloneDiagnostic()];
  const service = new CapabilityDiscoveryService(() => definitions);
  const envelope: CapabilityDiscoveryEnvelope = await service.discover(
    discoveryInput("2026-07-26T15:00:00.000Z"),
  );

  const changed = structuredClone(definitions[0]);
  changed.scope_denylist = ["global-working-memory"];
  definitions = [changed];

  await assert.rejects(
    service.materialize(
      envelope,
      internalRuntimeDiagnosticCapability.capability_id,
      () => "2026-07-26T15:01:00.000Z",
    ),
    expectCapabilityError("CAPABILITY_REGISTRY_CHANGED"),
  );
});
