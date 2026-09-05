import {
  expHabitus001aAiosBaseHead,
  expHabitus001aCandidateId,
  expHabitus001aFixtureId,
  expHabitus001aHabitusSourceHead,
} from "../server/capabilities/experimental/habitus-adaptive-retrieval.ts";
import { runExpHabitus001aSimulation } from "../server/capabilities/experimental/habitus-adaptive-retrieval-fixture.ts";

const output = runExpHabitus001aSimulation({
  schema_name: "HabitusAdaptiveRetrievalSimulationInput",
  schema_version: "1.0",
  execution_id: "EXP-HABITUS-001A-CLI",
  mode: "SIMULATION",
  scope_key: "global-working-memory",
  candidate_id: expHabitus001aCandidateId,
  fixture_id: expHabitus001aFixtureId,
  habitus_source_head: expHabitus001aHabitusSourceHead,
  aios_base_head: expHabitus001aAiosBaseHead,
});

console.log(JSON.stringify(output, null, 2));
