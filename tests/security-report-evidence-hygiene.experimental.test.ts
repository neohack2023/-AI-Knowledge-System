import assert from "node:assert/strict";
import test from "node:test";

import {
  observabilityProjection,
  runSecurityReportEvidenceHygieneSimulation,
  securityReportEvidenceHygieneCheckIds,
  type SecurityReportEvidenceHygieneSimulationInput,
} from "../server/capabilities/experimental/security-report-evidence-hygiene.ts";
import {
  experimentalReadOnlyCapabilityRegistry,
  securityReportEvidenceHygieneExperimentalEntry,
} from "../server/capabilities/experimental/registry.ts";
import {
  crossRunBaseline,
  cure53OdkInput,
  rosUshahidiInput,
} from "./fixtures/security-report-evidence-hygiene.ts";

const fixedNow = () => "2026-08-06T23:42:00.000Z";

test("experimental registry exposes one read-only SIMULATION-only capability", () => {
  assert.equal(experimentalReadOnlyCapabilityRegistry.length, 1);
  assert.equal(securityReportEvidenceHygieneExperimentalEntry.lifecycle_status, "EXPERIMENTAL");
  assert.equal(securityReportEvidenceHygieneExperimentalEntry.read_write_mode, "READ_ONLY");
  assert.deepEqual(securityReportEvidenceHygieneExperimentalEntry.execution_modes, ["SIMULATION"]);
  assert.equal(securityReportEvidenceHygieneExperimentalEntry.network_access, "NONE");
  assert.equal(securityReportEvidenceHygieneExperimentalEntry.external_effects, "NONE");
  assert.equal(securityReportEvidenceHygieneExperimentalEntry.runtime_binding_status, "BOUND_SIMULATION_ONLY");
});

test("replay of Cure53 ODK sanitized extraction matches the accepted baseline projection", async () => {
  const output = await runSecurityReportEvidenceHygieneSimulation(cure53OdkInput, fixedNow);
  assert.deepEqual(observabilityProjection(output), crossRunBaseline.projection[output.document_id]);
  assert.equal(output.observability_records.length, securityReportEvidenceHygieneCheckIds.length);
  assert.equal(output.events.length, securityReportEvidenceHygieneCheckIds.length + 3);
  assert.equal(output.source_mutation, false);
  assert.equal(output.external_effects, 0);
  assert.equal(output.network_accessed, false);
  assert.equal(output.credential_use, false);
  assert.equal(output.scope_isolation, "PASS");
});

test("replay of ROS Ushahidi sanitized extraction matches the accepted baseline projection", async () => {
  const output = await runSecurityReportEvidenceHygieneSimulation(rosUshahidiInput, fixedNow);
  assert.deepEqual(observabilityProjection(output), crossRunBaseline.projection[output.document_id]);
  assert.equal(output.observability_records.length, securityReportEvidenceHygieneCheckIds.length);
  assert.equal(output.events.length, securityReportEvidenceHygieneCheckIds.length + 3);
  assert.equal(output.source_mutation, false);
  assert.equal(output.external_effects, 0);
  assert.equal(output.network_accessed, false);
  assert.equal(output.credential_use, false);
  assert.equal(output.scope_isolation, "PASS");
});

test("cross-run replay preserves the baseline check family without control drift", async () => {
  const inputs = [cure53OdkInput, rosUshahidiInput];
  const outputs = await Promise.all(inputs.map((input) => runSecurityReportEvidenceHygieneSimulation(input, fixedNow)));

  for (const output of outputs) {
    assert.deepEqual(output.observability_records.map((record) => record.check_id), [...securityReportEvidenceHygieneCheckIds]);
    assert.deepEqual(observabilityProjection(output), crossRunBaseline.projection[output.document_id]);
  }

  const summary = {
    control_drift: "NONE",
    contradictory_behavior: "NONE",
    unsupported_success_claims: outputs.reduce((count, output) => count + output.observability_records.filter((record) => record.finding_code !== "NO_UNSUPPORTED_CLEAN_PASS" && record.check_id === "unsupported_clean_pass_claim").length, 0),
    scope_leaks: outputs.filter((output) => output.scope_isolation !== "PASS").length,
    external_effects: outputs.reduce((count, output) => count + output.external_effects, 0),
    source_mutations: outputs.filter((output) => output.source_mutation).length,
    stable_check_family_count: securityReportEvidenceHygieneCheckIds.length,
    independent_real_episode_count: outputs.length,
    provider_diversity: new Set(inputs.map((input) => input.document.provider)).size,
    engagement_diversity: new Set(inputs.map((input) => input.document.engagement)).size,
  };

  assert.deepEqual(summary, crossRunBaseline.cross_run_expectations);
});

test("handler rejects LIVE execution and raw secret material before emitting records", async () => {
  const liveInput = structuredClone(rosUshahidiInput) as SecurityReportEvidenceHygieneSimulationInput & { mode: string };
  liveInput.mode = "LIVE";
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(liveInput as SecurityReportEvidenceHygieneSimulationInput, fixedNow),
    /EXPERIMENTAL_SIMULATION_ONLY/,
  );

  const unsafeInput = structuredClone(rosUshahidiInput);
  unsafeInput.document.observations[0].observed.push("Bearer abcdefghijklmnopqrstuvwxyz123456");
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(unsafeInput, fixedNow),
    /SENSITIVE_INPUT_BLOCKED/,
  );
});
