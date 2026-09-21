import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  digestEpisodeFixture,
  validateEpisodeFixture,
  type FailureLearningEpisodeFixture,
} from "../server/failure-learning/episode.ts";
import {
  markHoldoutContaminated,
  opaqueHoldoutCandidateId,
  selectBlindHoldout,
} from "../server/failure-learning/holdout.ts";

const fixtureUrl = new URL("../config/failure-learning/episodes/cpython-pr-121143.v0.1.json", import.meta.url);

test("Episode 0001 fixture is temporally valid and materializable", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as FailureLearningEpisodeFixture;
  const result = validateEpisodeFixture(fixture);
  assert.equal(result.materializable, true);
  assert.equal(result.event_count, 12);
  assert.equal(result.hypothesis_count, 3);
  assert.equal(result.lesson_count, 7);
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(result.digest, digestEpisodeFixture(fixture));
});

test("episode validation rejects a hypothesis that sees its own resolving evidence", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as FailureLearningEpisodeFixture;
  fixture.hypotheses[0].evidence_cutoff_sequence = fixture.hypotheses[0].resolution_event_sequence;
  assert.throws(() => validateEpisodeFixture(fixture), /sealed before their resolving evidence/);
});

test("episode validation rejects self-promoted lessons", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as FailureLearningEpisodeFixture;
  (fixture.lessons[0] as { state: string }).state = "CANON";
  assert.throws(() => validateEpisodeFixture(fixture), /cannot self-promote/);
});

test("blind holdout IDs do not expose repository or PR identity", () => {
  const id = opaqueHoldoutCandidateId("github:81598961", 157461, "private-salt");
  assert.match(id, /^holdout:[0-9a-f]{64}$/);
  assert.doesNotMatch(id, /81598961|157461/);
});

test("blind sampler is deterministic and tainted discovery blocks prevention claims", () => {
  const clean = {
    opaque_candidate_id: opaqueHoldoutCandidateId("github:81598961", 150001, "private-salt"),
    repository_id: "github:81598961",
    external_pr_number: 150001,
    opened_at: "2025-01-01T00:00:00Z",
    contamination_state: "CLEAN" as const,
  };
  const tainted = markHoldoutContaminated({
    opaque_candidate_id: opaqueHoldoutCandidateId("github:81598961", 150002, "private-salt"),
    repository_id: "github:81598961",
    external_pr_number: 150002,
    opened_at: "2025-01-02T00:00:00Z",
    contamination_state: "CLEAN" as const,
  }, "TAINTED_DISCOVERY");

  const first = selectBlindHoldout([clean, tainted], "seed-a", "2026-09-21T00:00:00Z");
  const second = selectBlindHoldout([tainted, clean], "seed-a", "2026-09-21T00:00:00Z");
  assert.deepEqual(first, second);
  if (first.selected_candidate_id === tainted.opaque_candidate_id) {
    assert.equal(first.eligible_for_prevention_claim, false);
  }
  assert.equal(first.authority_effect, "NONE");
});
