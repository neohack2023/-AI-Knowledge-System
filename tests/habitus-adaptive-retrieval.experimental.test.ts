import assert from "node:assert/strict";
import test from "node:test";

import {
  expHabitus001aAiosBaseHead,
  expHabitus001aCandidateId,
  expHabitus001aFixtureId,
  expHabitus001aHabitusSourceHead,
  type HabitusAdaptiveRetrievalSimulationInput,
} from "../server/capabilities/experimental/habitus-adaptive-retrieval.ts";
import {
  fixtures,
  runExpHabitus001aSimulation,
} from "../server/capabilities/experimental/habitus-adaptive-retrieval-fixture.ts";
import {
  experimentalReadOnlyBenchmarkRegistry,
  habitusAdaptiveRetrievalExperimentalEntry,
} from "../server/capabilities/experimental/registry.ts";

const input: HabitusAdaptiveRetrievalSimulationInput = {
  schema_name: "HabitusAdaptiveRetrievalSimulationInput",
  schema_version: "1.0",
  execution_id: "EXP-HABITUS-001A-TEST",
  mode: "SIMULATION",
  scope_key: "global-working-memory",
  candidate_id: expHabitus001aCandidateId,
  fixture_id: expHabitus001aFixtureId,
  habitus_source_head: expHabitus001aHabitusSourceHead,
  aios_base_head: expHabitus001aAiosBaseHead,
};

const runByFixture = (output: ReturnType<typeof runExpHabitus001aSimulation>, fixtureId: string) =>
  output.runs.find((run) => run.arm === "HOT_PATH_HABITUS_GATED" && run.fixture_id === fixtureId)!;

test("EXP-HABITUS-001A is registered as read-only SIMULATION-only A0", () => {
  assert.ok(experimentalReadOnlyBenchmarkRegistry.includes(habitusAdaptiveRetrievalExperimentalEntry));
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.lifecycle_status, "EXPERIMENTAL");
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.read_write_mode, "READ_ONLY");
  assert.deepEqual(habitusAdaptiveRetrievalExperimentalEntry.execution_modes, ["SIMULATION"]);
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.autonomy_band, "A0");
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.network_access, "NONE");
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.external_effects, "NONE");
  assert.equal(habitusAdaptiveRetrievalExperimentalEntry.runtime_binding_status, "BOUND_SIMULATION_ONLY");
});

test("five-arm frozen benchmark completes with no external effects", () => {
  const output = runExpHabitus001aSimulation(input);
  assert.equal(output.summaries.length, 5);
  assert.equal(output.runs.length, fixtures.length * 5);
  assert.equal(output.scope_isolation, "PASS");
  assert.equal(output.source_mutation, false);
  assert.equal(output.external_effects, 0);
  assert.equal(output.network_accessed, false);
  assert.equal(output.credential_use, false);
  assert.equal(output.runtime_binding, "SIMULATION_ONLY");
  assert.equal(output.result, "BENCHMARK_COMPLETED");
});

test("Habitus-gated arm recovers every required evidence chain with less unrelated expansion than current adaptive graph", () => {
  const output = runExpHabitus001aSimulation(input);
  const candidate = output.summaries.find((summary) => summary.arm === "HOT_PATH_HABITUS_GATED")!;
  const currentAdaptive = output.summaries.find((summary) => summary.arm === "QUERY_ADAPTIVE_GRAPH")!;
  const semantic = output.summaries.find((summary) => summary.arm === "METADATA_SEMANTIC")!;

  assert.equal(candidate.evidence_chain_completeness, 1);
  assert.equal(candidate.authority_violations, 0);
  assert.equal(candidate.scope_bleed_selected, 0);
  assert.equal(candidate.forbidden_selected, 0);
  assert.ok(candidate.raw_authority_rejections > 0);
  assert.ok(candidate.raw_scope_rejections > 0);
  assert.ok(candidate.unrelated_expansion_rate < currentAdaptive.unrelated_expansion_rate);
  assert.ok(candidate.unrelated_expansion_rate < semantic.unrelated_expansion_rate);
});

test("exact-scope route rejects stale history outside a conflict fixture", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "exact-scope-resume");
  assert.deepEqual(run.selected_ids, ["gw-handoff-current"]);
  assert.ok(run.rejected_state_ids.includes("gw-handoff-stale"));
});

test("poisoning fixture nominates hostile material but authority admission quarantines it", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "memory-poisoning");
  assert.ok(run.raw_candidate_ids.includes("poison-readme"));
  assert.ok(run.rejected_authority_ids.includes("poison-readme"));
  assert.ok(!run.selected_ids.includes("poison-readme"));
  assert.ok(run.selected_ids.includes("gw-poison-test"));
  assert.ok(run.selected_ids.includes("gw-graph-contract"));
});

test("conflict fixture preserves current and stale evidence with current first", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "stale-current-conflict");
  assert.ok(run.selected_ids.includes("gw-handoff-current"));
  assert.ok(run.selected_ids.includes("gw-handoff-stale"));
  assert.ok(run.selected_ids.indexOf("gw-handoff-current") < run.selected_ids.indexOf("gw-handoff-stale"));
});

test("provenance challenge recovers provenance, HOT_PATH doctrine, and graph non-authority basis", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "provenance-challenge");
  for (const required of ["gw-provenance-envelope", "gw-hotpath-doctrine", "gw-graph-contract"]) {
    assert.ok(run.selected_ids.includes(required), required);
  }
});

test("sibling-scope candidate is observable and rejected before packet admission", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "sibling-scope-bleed");
  assert.ok(run.raw_candidate_ids.includes("udio-sibling"));
  assert.ok(run.rejected_scope_ids.includes("udio-sibling"));
  assert.ok(!run.selected_ids.includes("udio-sibling"));
  assert.ok(run.selected_ids.includes("gw-graph-contract"));
});

test("repo freshness preserves live GitHub execution truth ahead of stale memory projection", () => {
  const output = runExpHabitus001aSimulation(input);
  const run = runByFixture(output, "repo-freshness");
  assert.ok(run.selected_ids.includes("github-live-head"));
  assert.ok(run.selected_ids.includes("notion-repo-projection"));
  assert.ok(run.selected_ids.indexOf("github-live-head") < run.selected_ids.indexOf("notion-repo-projection"));
});

test("source locks and SIMULATION boundary fail closed", () => {
  const cases: Array<[string, (value: Record<string, unknown>) => void, RegExp]> = [
    ["LIVE", (value) => { value.mode = "LIVE"; }, /EXPERIMENTAL_SIMULATION_ONLY/],
    ["scope", (value) => { value.scope_key = "udio-algorithms"; }, /SCOPE_NOT_ALLOWED/],
    ["fixture", (value) => { value.fixture_id = "OTHER"; }, /FIXTURE_NOT_FROZEN/],
    ["Habitus head", (value) => { value.habitus_source_head = "deadbeef"; }, /HABITUS_SOURCE_LOCK_MISMATCH/],
    ["AIOS base", (value) => { value.aios_base_head = "deadbeef"; }, /AIOS_BASE_LOCK_MISMATCH/],
  ];

  for (const [name, mutate, expected] of cases) {
    const altered = structuredClone(input) as unknown as Record<string, unknown>;
    mutate(altered);
    assert.throws(
      () => runExpHabitus001aSimulation(altered as unknown as HabitusAdaptiveRetrievalSimulationInput),
      expected,
      name,
    );
  }
});
