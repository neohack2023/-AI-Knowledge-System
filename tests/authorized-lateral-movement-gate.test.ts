import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256,
  AuthorizedLateralMovementGateError,
  runAuthorizedLateralMovementGate,
  type AuthorizedLateralMovementGateInput,
} from "../server/capabilities/quarantined/authorized-lateral-movement.ts";
import {
  authorizedLateralMovementQuarantinedEntry,
  quarantinedCapabilityRegistry,
} from "../server/capabilities/quarantined/registry.ts";
import { GET } from "../app/api/quarantined/authorized-lateral-movement/route.ts";

const fixedNow = () => "2026-08-07T00:08:00.000Z";

const boundedInput = (safeWord: string): AuthorizedLateralMovementGateInput => ({
  action: "plan",
  mode: "SIMULATION",
  safe_word: safeWord,
  environment: {
    name: "Owned training range",
    class: "OWNED_LAB",
    authorization_reference: "owner-asserted-lab-scope",
    target_boundary: ["node-a", "node-b", "node-c"],
    permitted_objective: "Compare bounded trust paths and defensive observation points.",
  },
  topology: {
    start_node: "node-a",
    goal_node: "node-c",
    nodes: [
      { id: "node-a", label: "Training node A", authorized: true },
      { id: "node-b", label: "Training node B", authorized: true },
      { id: "node-c", label: "Training node C", authorized: true },
    ],
    edges: [
      {
        from: "node-a",
        to: "node-b",
        relationship: "authorized administrative trust",
        detection_points: ["authentication telemetry", "remote-management audit event"],
      },
      {
        from: "node-b",
        to: "node-c",
        relationship: "authorized service trust",
        detection_points: ["service authentication telemetry"],
      },
    ],
  },
  constraints: {
    no_credentials: true,
    no_scanning: true,
    no_persistence: true,
    no_evasion: true,
    no_destructive_actions: true,
    no_availability_impact: true,
  },
});

test("quarantined registry requires a tool call and stores only a SHA-256 verifier", () => {
  assert.equal(quarantinedCapabilityRegistry.length, 1);
  assert.equal(authorizedLateralMovementQuarantinedEntry.lifecycle_status, "CANDIDATE_QUARANTINED");
  assert.equal(authorizedLateralMovementQuarantinedEntry.risk_class, "R5");
  assert.equal(authorizedLateralMovementQuarantinedEntry.tool_call_required, true);
  assert.equal(authorizedLateralMovementQuarantinedEntry.safe_word_state, "CONFIGURED_HASHED");
  assert.equal(authorizedLateralMovementQuarantinedEntry.safe_word_hash_algorithm, "SHA-256");
  assert.equal(authorizedLateralMovementQuarantinedEntry.safe_word_hash, AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256);
  assert.match(AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(authorizedLateralMovementQuarantinedEntry.plaintext_secret_persisted, false);
  assert.deepEqual(authorizedLateralMovementQuarantinedEntry.execution_modes, ["SIMULATION"]);
  assert.equal(authorizedLateralMovementQuarantinedEntry.network_access, "NONE");
  assert.equal(authorizedLateralMovementQuarantinedEntry.credential_access, "NONE");
  assert.equal(authorizedLateralMovementQuarantinedEntry.external_effects, "NONE");
});

test("metadata endpoint advertises no execution authority", async () => {
  const response = await GET();
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(body.execution_authority, "READ_ONLY_SIMULATION_PLANNING_ONLY");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("incorrect safe word is rejected before any planning output", async () => {
  await assert.rejects(
    runAuthorizedLateralMovementGate(boundedInput("definitely-not-the-configured-key"), fixedNow),
    (error: unknown) => {
      assert.ok(error instanceof AuthorizedLateralMovementGateError);
      assert.equal(error.code, "SAFE_WORD_REJECTED");
      assert.equal(error.httpStatus, 403);
      return true;
    },
  );
});

test("LIVE mode is blocked independently of the supplied safe word", async () => {
  const input = boundedInput("not-evaluated-in-live-mode") as AuthorizedLateralMovementGateInput & { mode: string };
  input.mode = "LIVE";
  await assert.rejects(
    runAuthorizedLateralMovementGate(input as AuthorizedLateralMovementGateInput, fixedNow),
    /QUARANTINED_SIMULATION_ONLY/,
  );
});

test("authorization reference is mandatory before safe-word evaluation", async () => {
  const input = boundedInput("not-evaluated-without-scope");
  input.environment.authorization_reference = "";
  await assert.rejects(
    runAuthorizedLateralMovementGate(input, fixedNow),
    /AUTHORIZATION_REFERENCE_REQUIRED/,
  );
});

const injectedSafeWord = process.env.AUTHORIZED_LATERAL_MOVEMENT_SAFE_WORD;

test(
  "secret-injected end-to-end tool call returns bounded path analysis without execution instructions",
  { skip: !injectedSafeWord },
  async () => {
    const output = await runAuthorizedLateralMovementGate(boundedInput(injectedSafeWord ?? ""), fixedNow);
    assert.equal(output.tool_call_required, true);
    assert.equal(output.tool_called, true);
    assert.equal(output.safe_word_verified, true);
    assert.equal(output.authorization_asserted, true);
    assert.equal(output.authorization_verified_by_system, false);
    assert.equal(output.output_scope, "READ_ONLY_PATH_ANALYSIS");
    assert.deepEqual(output.path.node_ids, ["node-a", "node-b", "node-c"]);
    assert.equal(output.path.hops.length, 2);
    assert.ok(output.path.hops.every((hop) => hop.execution_instructions === null));
    assert.equal(output.controls.external_effects, 0);
    assert.equal(output.controls.source_mutations, 0);
    assert.equal(output.controls.credentials_used, false);
    assert.equal(output.controls.scanning_performed, false);
    assert.equal(output.controls.persistence_performed, false);
    assert.equal(output.controls.evasion_performed, false);
  },
);
