import assert from "node:assert/strict";
import test from "node:test";

import {
  CodingHarnessReceiptValidationError,
  createCodingHarnessReceipt,
} from "../server/coding-harness/index.ts";

const HEAD = "38917a9028ef64161adf3d9a4d2212a3917e1b31";

test("changed paths preserve raw Git path identity including leading and all-space names", async () => {
  const changedPaths = ["foo", " foo", "   "];
  const receipt = await createCodingHarnessReceipt({
    repository: "neohack2023/-AI-Knowledge-System",
    head_sha: HEAD,
    profile: "PR",
    changed_paths: changedPaths,
    obligations: [{ obligation_id: "proof-validity", description: "Proof validity", required: true }],
    verifier_acceptances: [],
  });

  assert.deepEqual(receipt.changed_paths, changedPaths);
});

test("changed paths reject only exact duplicate path strings", async () => {
  await assert.rejects(
    () => createCodingHarnessReceipt({
      repository: "neohack2023/-AI-Knowledge-System",
      head_sha: HEAD,
      profile: "PR",
      changed_paths: ["foo", "foo"],
      obligations: [{ obligation_id: "proof-validity", description: "Proof validity", required: true }],
      verifier_acceptances: [],
    }),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("changed_paths contains duplicate foo"));
      return true;
    },
  );
});
