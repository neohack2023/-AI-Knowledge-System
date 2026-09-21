import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReplayWindow,
  lessonIsEligible,
  scoreFailureHypothesis,
  type FailureLearningEpisode,
  type FailureLearningEvent,
} from "../server/failure-learning/replay.ts";
import {
  createFailureRiskModel,
  predictFailureRisk,
  updateFailureRiskModel,
} from "../server/failure-learning/model.ts";

const episode: FailureLearningEpisode = {
  episode_id: "github:python/cpython:pr:121143",
  repository_id: "github:81598961",
  external_pr_number: 121143,
  split: "TRAIN",
  state: "COMPLETE",
  terminal_label: "MERGED_THEN_REVERTED",
};

const events: FailureLearningEvent[] = [
  {
    event_id: "e1",
    sequence: 1,
    event_type: "PR_OPENED",
    occurred_at: "2024-07-05T00:00:00Z",
    source_ref: "github:python/cpython:pr:121143",
    source_digest: "sha256:a",
    features: ["test-strictness", "linux"],
    summary: { phase: "opened" },
  },
  {
    event_id: "e2",
    sequence: 2,
    event_type: "REVIEW_PORTABILITY_CONCERN",
    occurred_at: "2024-07-06T01:58:50Z",
    source_ref: "github:python/cpython:pr:121143:review:1667229329",
    source_digest: "sha256:b",
    features: ["platform-variance", "libc", "fragile-test"],
    summary: { phase: "review" },
  },
  {
    event_id: "e3",
    sequence: 3,
    event_type: "REVERTED",
    occurred_at: "2024-08-24T21:54:31Z",
    source_ref: "github:python/cpython:pr:123303",
    source_digest: "sha256:c",
    features: ["platform-variance", "raspbian"],
    summary: { phase: "terminal" },
  },
];

test("replay window hides future evidence and terminal outcome", () => {
  const replay = buildReplayWindow(episode, events, 2);
  assert.equal(replay.visible_events.length, 2);
  assert.equal(replay.hidden_event_count, 1);
  assert.equal(replay.episode.terminal_label, null);
  assert.equal(replay.future_evidence_visible, false);
});

test("terminal label is visible only after the full episode is revealed", () => {
  const replay = buildReplayWindow(episode, events, 3);
  assert.equal(replay.hidden_event_count, 0);
  assert.equal(replay.episode.terminal_label, "MERGED_THEN_REVERTED");
});

test("hypothesis scoring requires explicit support or contradiction", () => {
  const resolution = {
    supported_mechanism_codes: ["PLATFORM_LIBC_VARIANCE"],
    contradicted_mechanism_codes: ["ENCODING_ONLY"],
    supported_fix_classes: ["RELAX_INCIDENTAL_ASSERTION"],
    evidence_state: "RESOLVED" as const,
  };
  assert.equal(
    scoreFailureHypothesis("PLATFORM_LIBC_VARIANCE", "RELAX_INCIDENTAL_ASSERTION", resolution).verdict,
    "SUPPORTED",
  );
  assert.equal(scoreFailureHypothesis("ENCODING_ONLY", null, resolution).verdict, "REJECTED");
  assert.equal(scoreFailureHypothesis("UNKNOWN_OTHER", null, resolution).verdict, "INCONCLUSIVE");
});

test("lessons cannot leak from the target episode or from the future", () => {
  assert.equal(lessonIsEligible("episode-a", "episode-a", "2024-01-01", "2025-01-01"), false);
  assert.equal(lessonIsEligible("episode-a", "episode-b", "2026-01-01", "2025-01-01"), false);
  assert.equal(lessonIsEligible("episode-a", "episode-b", "2024-01-01", "2025-01-01"), true);
});

test("online risk model stays shadow-only and updates after outcomes", () => {
  const initial = createFailureRiskModel();
  const before = predictFailureRisk(initial, ["platform-variance", "fragile-test"]);
  assert.equal(before.state, "UNTRAINED");
  const trained = updateFailureRiskModel(
    initial,
    ["platform-variance", "fragile-test"],
    true,
    "episode-1",
  );
  const after = predictFailureRisk(trained, ["platform-variance", "fragile-test"]);
  assert.equal(after.state, "SHADOW_ONLY");
  assert.ok(after.risk > before.risk);
  assert.equal(after.authority_effect, "NONE");
});
