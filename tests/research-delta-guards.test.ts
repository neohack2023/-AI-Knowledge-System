import assert from "node:assert/strict";
import test from "node:test";

import {
  assessModelVerificationReuse,
  assessStagedArtifactPublication,
  evaluateAgentToolAuthority,
  resolveRepositoryInstructionSource,
} from "../server/governance/research-delta-guards.ts";
import { evaluateRetrieval } from "../shared/retrieval-evaluation.ts";

test("primary repository instruction wins over portable fallback", () => {
  const result = resolveRepositoryInstructionSource({
    primary_instruction: { present: true, digest: "sha256:primary" },
    portable_instruction: { present: true, digest: "sha256:portable" },
    provider_supports_portable_instruction: true,
  });
  assert.equal(result.selected_source, "PRIMARY");
  assert.equal(result.selected_digest, "sha256:primary");
  assert.ok(result.reason_codes.includes("PORTABLE_SHADOWED_BY_PRIMARY"));
});

test("portable repository instruction is blocked when provider support is absent", () => {
  const result = resolveRepositoryInstructionSource({
    primary_instruction: { present: false, digest: null },
    portable_instruction: { present: true, digest: "sha256:portable" },
    provider_supports_portable_instruction: false,
  });
  assert.equal(result.selected_source, "NONE");
  assert.deepEqual(result.reason_codes, ["PORTABLE_SOURCE_UNSUPPORTED_BY_PROVIDER"]);
});

test("instruction provenance fails closed when selected source has no digest", () => {
  const result = resolveRepositoryInstructionSource({
    primary_instruction: { present: true, digest: null },
    portable_instruction: { present: false, digest: null },
    provider_supports_portable_instruction: true,
  });
  assert.equal(result.provenance_complete, false);
  assert.deepEqual(result.reason_codes, ["PRIMARY_DIGEST_REQUIRED"]);
});

test("model verification is reusable only under the exact verified resolution", () => {
  const result = assessModelVerificationReuse({
    prior: {
      requested_model: "model-a",
      resolved_model: "model-a",
      availability_policy_revision: "policy-1",
      verification_digest: "sha256:verification",
      deprecated_at: "2026-10-19T00:00:00Z",
    },
    current: {
      requested_model: "model-a",
      resolved_model: "model-a",
      availability_policy_revision: "policy-1",
      substituted: false,
    },
    now: "2026-09-21T00:00:00Z",
  });
  assert.equal(result.state, "FRESH");
  assert.equal(result.inherited_behavioral_verification, true);
});

test("model substitution never inherits prior behavioral verification", () => {
  const result = assessModelVerificationReuse({
    prior: {
      requested_model: "model-a",
      resolved_model: "model-a",
      availability_policy_revision: "policy-1",
      verification_digest: "sha256:verification",
      deprecated_at: null,
    },
    current: {
      requested_model: "model-a",
      resolved_model: "model-b",
      availability_policy_revision: "policy-2",
      substituted: true,
    },
    now: "2026-09-21T00:00:00Z",
  });
  assert.equal(result.state, "STALE");
  assert.equal(result.inherited_behavioral_verification, false);
  assert.ok(result.reason_codes.includes("RESOLVED_MODEL_CHANGED"));
  assert.ok(result.reason_codes.includes("MODEL_SUBSTITUTION_OCCURRED"));
  assert.ok(result.reason_codes.includes("AVAILABILITY_POLICY_CHANGED"));
});

test("deprecation expiry makes a formerly exact model verification stale", () => {
  const result = assessModelVerificationReuse({
    prior: {
      requested_model: "model-a",
      resolved_model: "model-a",
      availability_policy_revision: "policy-1",
      verification_digest: "sha256:verification",
      deprecated_at: "2026-09-20T00:00:00Z",
    },
    current: {
      requested_model: "model-a",
      resolved_model: "model-a",
      availability_policy_revision: "policy-1",
      substituted: false,
    },
    now: "2026-09-21T00:00:00Z",
  });
  assert.equal(result.state, "STALE");
  assert.ok(result.reason_codes.includes("MODEL_DEPRECATED"));
});

test("stage-only authority cannot publish", () => {
  const result = assessStagedArtifactPublication({
    stage_authorized: true,
    publish_authorized: false,
    staged_digest: "sha256:artifact",
    approved_digest: "sha256:artifact",
    acknowledgement: "ACK",
    observed_published_digest: null,
  });
  assert.equal(result.state, "BLOCKED");
  assert.equal(result.publication_authorized, false);
  assert.ok(result.reason_codes.includes("PUBLISH_AUTHORITY_REQUIRED"));
});

test("artifact mutation after approval blocks publication", () => {
  const result = assessStagedArtifactPublication({
    stage_authorized: true,
    publish_authorized: true,
    staged_digest: "sha256:changed",
    approved_digest: "sha256:approved",
    acknowledgement: "UNKNOWN",
    observed_published_digest: null,
  });
  assert.equal(result.state, "BLOCKED");
  assert.ok(result.reason_codes.includes("APPROVAL_DIGEST_MISMATCH"));
});

test("ambiguous publish acknowledgement blocks retry until readback", () => {
  const result = assessStagedArtifactPublication({
    stage_authorized: true,
    publish_authorized: true,
    staged_digest: "sha256:artifact",
    approved_digest: "sha256:artifact",
    acknowledgement: "UNKNOWN",
    observed_published_digest: null,
  });
  assert.equal(result.state, "AMBIGUOUS_NO_RETRY");
  assert.equal(result.retry_authorized, false);
  assert.deepEqual(result.reason_codes, ["READBACK_REQUIRED_BEFORE_RETRY"]);
});

test("readback can close an ambiguous publish without retry", () => {
  const result = assessStagedArtifactPublication({
    stage_authorized: true,
    publish_authorized: true,
    staged_digest: "sha256:artifact",
    approved_digest: "sha256:artifact",
    acknowledgement: "UNKNOWN",
    observed_published_digest: "sha256:artifact",
  });
  assert.equal(result.state, "VERIFIED_PUBLISHED");
  assert.equal(result.retry_authorized, false);
});

test("read-only agent tool cannot be admitted with a mutating expectation", () => {
  const result = evaluateAgentToolAuthority({
    principal_id: "principal:ci",
    principal_scopes: ["ci:read"],
    tool_id: "ci.read_run",
    tool_schema_revision: "schema-1",
    capability_class: "READ_ONLY",
    required_scopes: ["ci:read"],
    run_identity: "run:123",
    mutation_expected: true,
  });
  assert.equal(result.state, "BLOCK");
  assert.ok(result.reason_codes.includes("READ_ONLY_TOOL_CANNOT_DECLARE_MUTATION"));
});

test("mutating agent tool requires exact principal scope and an effect receipt", () => {
  const denied = evaluateAgentToolAuthority({
    principal_id: "principal:ci",
    principal_scopes: ["ci:read"],
    tool_id: "ci.rerun_job",
    tool_schema_revision: "schema-1",
    capability_class: "MUTATING",
    required_scopes: ["ci:write"],
    run_identity: "run:123",
    mutation_expected: true,
  });
  assert.equal(denied.state, "BLOCK");
  assert.ok(denied.reason_codes.includes("MISSING_SCOPE:ci:write"));

  const allowed = evaluateAgentToolAuthority({
    principal_id: "principal:ci",
    principal_scopes: ["ci:read", "ci:write"],
    tool_id: "ci.rerun_job",
    tool_schema_revision: "schema-1",
    capability_class: "MUTATING",
    required_scopes: ["ci:write"],
    run_identity: "run:123",
    mutation_expected: true,
  });
  assert.equal(allowed.state, "ALLOW");
  assert.equal(allowed.effect_receipt_required, true);
});

test("retrieval evaluation measures upstream file recall before generation", () => {
  const result = evaluateRetrieval({
    task_id: "task:retrieval:01",
    task_class: "EDIT_TO_RIPPLE",
    repository_revision: "sha:abc",
    gold_file_ids: ["a.ts", "b.ts"],
    retrieved_file_ids: ["b.ts", "c.ts", "a.ts"],
    token_budget: 2000,
    tokens_used: 1200,
  });
  assert.equal(result.recall, 1);
  assert.equal(result.precision, 0.6667);
  assert.equal(result.context_yield, 0.6667);
  assert.equal(result.budget_state, "WITHIN_BUDGET");
});

test("retrieval evaluation exposes total gold-file misses", () => {
  const result = evaluateRetrieval({
    task_id: "task:retrieval:02",
    task_class: "TRACE_TO_CODE",
    repository_revision: "sha:abc",
    gold_file_ids: ["fix.ts"],
    retrieved_file_ids: ["readme.md"],
    token_budget: 1000,
    tokens_used: 400,
  });
  assert.equal(result.recall, 0);
  assert.equal(result.matched_gold_count, 0);
});

test("no-gold retrieval cases measure abstention instead of inventing recall", () => {
  const abstained = evaluateRetrieval({
    task_id: "task:retrieval:03",
    task_class: "COMMENT_TO_CONTEXT",
    repository_revision: "sha:abc",
    gold_file_ids: [],
    retrieved_file_ids: [],
    token_budget: 500,
    tokens_used: 0,
  });
  assert.equal(abstained.gold_state, "NO_GOLD");
  assert.equal(abstained.recall, null);
  assert.equal(abstained.abstention_correct, true);

  const overretrieved = evaluateRetrieval({
    task_id: "task:retrieval:04",
    task_class: "COMMENT_TO_CONTEXT",
    repository_revision: "sha:abc",
    gold_file_ids: [],
    retrieved_file_ids: ["noise.ts"],
    token_budget: 500,
    tokens_used: 100,
  });
  assert.equal(overretrieved.abstention_correct, false);
});

test("retrieval evaluation keeps budget overruns visible", () => {
  const result = evaluateRetrieval({
    task_id: "task:retrieval:05",
    task_class: "CODE_TO_TEST",
    repository_revision: "sha:abc",
    gold_file_ids: ["test.ts"],
    retrieved_file_ids: ["test.ts"],
    token_budget: 100,
    tokens_used: 101,
  });
  assert.equal(result.budget_state, "OVER_BUDGET");
  assert.ok(result.issues.includes("TOKEN_BUDGET_EXCEEDED"));
});
