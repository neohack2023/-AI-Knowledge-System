import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchRepositoryKnowledge,
  listRepositoryKnowledge,
  searchRepositoryKnowledge,
} from "../server/chat-bridge/repository-knowledge.ts";
import {
  evaluateChatBridgeWorkflow,
  listChatBridgeExecutableWorkflows,
} from "../server/chat-bridge/execution-policy.ts";

test("AIOS chat bridge projects only bounded repository execution truth", () => {
  const records = listRepositoryKnowledge();
  assert.ok(records.length >= 3);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  for (const record of records) {
    assert.equal(record.scope_key, "global-working-memory");
    assert.equal(record.metadata.authority, "GITHUB_EXECUTION_TRUTH");
    assert.match(record.url, /^https:\/\/github\.com\/neohack2023\/-AI-Knowledge-System\/blob\/main\//);
  }
});

test("AIOS chat bridge search and fetch preserve exact record identity", () => {
  const results = searchRepositoryKnowledge("workflow kernel provenance");
  assert.ok(results.length > 0);
  const first = results[0];
  const fetched = fetchRepositoryKnowledge(first.id);
  assert.ok(fetched);
  assert.deepEqual(fetched, first);
});

test("AIOS chat bridge does not fabricate unknown records", () => {
  assert.equal(fetchRepositoryKnowledge("repo:missing:fixture"), null);
  assert.deepEqual(searchRepositoryKnowledge("zzzz-no-match-fixture"), []);
});

test("ChatGPT bridge admits the internal A0 process-local diagnostic", () => {
  assert.deepEqual(
    evaluateChatBridgeWorkflow("internal-runtime-diagnostic", {}),
    { allowed: true, capability_id: "cap:internal-runtime-diagnostic" },
  );
  assert.ok(
    listChatBridgeExecutableWorkflows().some(
      (workflow) => workflow.workflow_id === "internal-runtime-diagnostic",
    ),
  );
});

test("ChatGPT bridge blocks governed-write probes and unknown workflows", () => {
  const governedWrite = evaluateChatBridgeWorkflow(
    "internal-runtime-diagnostic",
    { governed_write_probe: {} },
  );
  assert.equal(governedWrite.allowed, false);
  if (!governedWrite.allowed) assert.equal(governedWrite.code, "BRIDGE_GOVERNED_WRITE_BLOCKED");

  const unknown = evaluateChatBridgeWorkflow("unknown-workflow", {});
  assert.equal(unknown.allowed, false);
  if (!unknown.allowed) assert.equal(unknown.code, "BRIDGE_WORKFLOW_NOT_ADMITTED");
});
