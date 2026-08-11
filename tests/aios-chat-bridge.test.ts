import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchRepositoryKnowledge,
  listRepositoryKnowledge,
  searchRepositoryKnowledge,
} from "../server/chat-bridge/repository-knowledge.ts";

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
