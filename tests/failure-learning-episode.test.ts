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
  validateHoldoutEvidenceCutoff,
} from "../server/failure-learning/holdout.ts";
import {
  assertCleanPreventionCutoff,
  buildBlindCandidatePool,
  freezeInitialCommitCutoff,
  freezeMutablePrDescriptionCutoff,
  selectBlindCandidate,
  validatePairedPredictions,
} from "../server/failure-learning/intake-worker.ts";

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


test("mutable PR metadata is not a clean prevention cutoff", () => {
  const cutoff = freezeMutablePrDescriptionCutoff({
    selected_candidate_id: "holdout:mutable",
  });
  const validation = validateHoldoutEvidenceCutoff(cutoff);
  assert.equal(validation.clean_for_prevention_claim, false);
  assert.equal(validation.reason_code, "MUTABLE_PR_METADATA_NOT_OPENING_STATE");
  assert.throws(() => assertCleanPreventionCutoff(cutoff));
});

test("blind intake worker admits structural candidates without task text", () => {
  const pool = buildBlindCandidatePool([
    {
      repository_id: "github:81598961",
      external_pr_number: 160001,
      opened_at: "2026-01-01T00:00:00Z",
      discussion_count: 12,
      review_count: 3,
      changed_file_count: 4,
      contamination_state: "CLEAN",
    },
    {
      repository_id: "github:81598961",
      external_pr_number: 160002,
      opened_at: "2026-01-02T00:00:00Z",
      discussion_count: 1,
      review_count: 0,
      changed_file_count: 2,
      contamination_state: "CLEAN",
    },
  ], "private-salt", {
    min_discussion_count: 8,
    min_review_count: 2,
    max_changed_file_count: 20,
  });
  assert.equal(pool.admitted.length, 1);
  assert.equal(pool.rejected_count, 1);
  assert.doesNotMatch(pool.admitted[0].opaque_candidate_id, /160001/);
  const selection = selectBlindCandidate(pool, "seed", "2026-09-20T00:00:00Z");
  assert.equal(selection.eligible_for_prevention_claim, true);
});

test("clean paired prevention run requires immutable initial commit binding", () => {
  const cutoff = freezeInitialCommitCutoff({
    selected_candidate_id: "holdout:clean",
    commit_sha: "abc123",
    immutable_diff_digest: "sha256:deadbeef",
    contamination_state: "CLEAN",
  });
  assert.equal(assertCleanPreventionCutoff(cutoff).clean_for_prevention_claim, true);
  assert.equal(validatePairedPredictions(cutoff, [
    {
      mode: "LESSONS_OFF",
      selected_candidate_id: "holdout:clean",
      source_digest: "sha256:deadbeef",
      mechanism_code: "M1",
      fix_class: "F1",
      validation_targets: ["T1"],
      activated_lesson_ids: [],
      created_before_reveal: true,
    },
    {
      mode: "LESSONS_ON",
      selected_candidate_id: "holdout:clean",
      source_digest: "sha256:deadbeef",
      mechanism_code: "M1",
      fix_class: "F2",
      validation_targets: ["T1"],
      activated_lesson_ids: ["L1"],
      created_before_reveal: true,
    },
  ]).valid, true);
});
