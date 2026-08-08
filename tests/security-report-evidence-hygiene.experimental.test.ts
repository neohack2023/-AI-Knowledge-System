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

type MutableInput = Record<string, unknown> & {
  document: Record<string, unknown> & {
    observations: Array<Record<string, unknown>>;
  };
};

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
  assert.equal(output.extraction_digest_verified, true);
  assert.equal(output.sanitization_verification, "POLICY_VALIDATED");
  assert.equal(output.sanitization_policy_version, "1.0");
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

test("handler validates typed constants at runtime", async () => {
  const mutations: Array<[string, (input: MutableInput) => void, RegExp]> = [
    ["schema name", (input) => { input.schema_name = "OtherInput"; }, /INPUT_SCHEMA_NAME_MISMATCH/],
    ["schema version", (input) => { input.schema_version = "2.0"; }, /INPUT_SCHEMA_VERSION_MISMATCH/],
    ["candidate", (input) => { input.candidate_id = "skill-candidate:other"; }, /EXPERIMENTAL_CAPABILITY_MISMATCH/],
    ["baseline", (input) => { input.baseline_id = "SFVAL-OTHER"; }, /BASELINE_NOT_ACCEPTED/],
    ["media type", (input) => { input.document.media_type = "text/html"; }, /MEDIA_TYPE_NOT_ALLOWED/],
    ["state", (input) => { input.document.observations[0].state = "UNKNOWN"; }, /UNKNOWN_STATE/],
    ["confidence", (input) => { input.document.observations[0].confidence = "CERTAIN"; }, /UNKNOWN_CONFIDENCE/],
  ];

  for (const [name, mutate, expected] of mutations) {
    const input = structuredClone(cure53OdkInput) as unknown as MutableInput;
    mutate(input);
    await assert.rejects(
      runSecurityReportEvidenceHygieneSimulation(input as SecurityReportEvidenceHygieneSimulationInput, fixedNow),
      expected,
      name,
    );
  }
});

test("handler derives sanitization status and rejects caller assertions, identifiers, and unsafe source pointers", async () => {
  const assertedSanitization = structuredClone(cure53OdkInput) as unknown as MutableInput;
  assertedSanitization.document.sanitized_extract = true;
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(assertedSanitization as SecurityReportEvidenceHygieneSimulationInput, fixedNow),
    /INVALID_DOCUMENT_FIELDS/,
  );

  const personalIdentifier = structuredClone(cure53OdkInput);
  personalIdentifier.document.observations[0].observed.push("analyst@example.com");
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(personalIdentifier, fixedNow),
    /SENSITIVE_INPUT_BLOCKED/,
  );

  const unsafePointer = structuredClone(cure53OdkInput);
  unsafePointer.document.source_pointer = "https://example.com/report.pdf?token=not-public";
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(unsafePointer, fixedNow),
    /UNSAFE_SOURCE_POINTER/,
  );
});

test("handler verifies the extraction digest before emitting records", async () => {
  const altered = structuredClone(cure53OdkInput);
  altered.document.observations[0].observed[0] = "different bounded observation";
  await assert.rejects(
    runSecurityReportEvidenceHygieneSimulation(altered, fixedNow),
    /EXTRACTION_DIGEST_MISMATCH/,
  );
});
