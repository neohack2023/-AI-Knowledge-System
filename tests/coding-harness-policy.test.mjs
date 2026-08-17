import assert from "node:assert/strict";
import test from "node:test";

import { inspectWorkflowText } from "../scripts/coding-harness/workflow-policy.mjs";

function codes(text) {
  return inspectWorkflowText(text, "fixture.yml").map((finding) => finding.code);
}

const pinned = "11d5960a326750d5838078e36cf38b85af677262";

const valid = `name: fixture\non:\n  pull_request:\npermissions:\n  contents: read\nconcurrency:\n  group: fixture-\${{ github.ref }}\n  cancel-in-progress: true\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@${pinned}\n`;

test("workflow policy accepts a pinned, least-privilege, cancelable PR workflow", () => {
  assert.deepEqual(codes(valid), []);
});

test("workflow policy catches a floating action reference", () => {
  const broken = valid.replace(`actions/checkout@${pinned}`, "actions/checkout@v4");
  assert.ok(codes(broken).includes("ACTION_REF_NOT_IMMUTABLE_SHA"));
});

test("workflow policy catches missing permissions", () => {
  const broken = valid.replace("permissions:\n  contents: read\n", "");
  assert.ok(codes(broken).includes("WORKFLOW_PERMISSIONS_MISSING"));
});

test("workflow policy catches missing PR concurrency", () => {
  const broken = valid.replace("concurrency:\n  group: fixture-${{ github.ref }}\n  cancel-in-progress: true\n", "");
  assert.ok(codes(broken).includes("PR_CONCURRENCY_MISSING"));
});
