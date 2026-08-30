import assert from "node:assert/strict";
import test from "node:test";

import {
  CodingHarnessReceiptValidationError,
  createCodingHarnessExecutionReceipt,
  createVerifierAcceptanceReceipt,
  resolveObligationAcceptance,
  verifyCodingHarnessReceipt,
  type VerifierAcceptanceInput,
} from "../server/coding-harness/index.ts";

const HEAD = "38917a9028ef64161adf3d9a4d2212a3917e1b31";
const BASE = "4088c690ab8e0fbee761ff8e503bbe4273e4ed58";

const acceptance = (overrides: Partial<VerifierAcceptanceInput> = {}): VerifierAcceptanceInput => ({
  acceptance_id: "acc-proof-001",
  scope_key: "global-working-memory",
  task_id: "task-verifier-runtime-001",
  artifact_or_object_id: "neohack2023/-AI-Knowledge-System",
  artifact_version_or_head: HEAD,
  artifact_digest: `git-sha:${HEAD}`,
  obligation_id: "proof-validity",
  obligation_description: "The declared proof obligation is mechanically valid.",
  verifier_id: "kernel-01",
  verifier_version: "1.0.0",
  verifier_authority_class: "HARD_KERNEL",
  verifier_input_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  verifier_freshness_state: "CURRENT",
  coverage_state: "COMPLETE_FOR_OBLIGATION",
  result: "PASS",
  higher_priority_verifier_ids: [],
  lower_priority_evidence_ids: [],
  retry_allowed: true,
  repair_feedback_pointer: null,
  receipt_pointer: null,
  ...overrides,
});

const harness = (verifier_acceptance_inputs: VerifierAcceptanceInput[], obligations = [
  { obligation_id: "proof-validity", description: "Proof validity", required: true },
]) => createCodingHarnessExecutionReceipt({
  repository: "neohack2023/-AI-Knowledge-System",
  head_sha: HEAD,
  base_sha: BASE,
  profile: "PR",
  environment: { node: "22" },
  changed_paths: ["server/coding-harness/verifier-acceptance.ts"],
  checks: [{ id: "node-test", status: "PASS" }],
  artifacts: [],
  known_regressions_loaded: ["VOA-01", "VOA-07"],
  failed_reason_codes: [],
  obligations,
  verifier_acceptance_inputs,
});

test("current hard-kernel PASS closes only its complete declared obligation", () => {
  const receipt = createVerifierAcceptanceReceipt(acceptance());
  assert.equal(receipt.terminal_acceptance_effect, "ACCEPT");
  const resolution = resolveObligationAcceptance([receipt], HEAD, "proof-validity");
  assert.equal(resolution.state, "ACCEPTED");
});

test("model advisory PASS never gains terminal acceptance authority", () => {
  const receipt = createVerifierAcceptanceReceipt(acceptance({
    verifier_id: "model-reviewer-01",
    verifier_authority_class: "MODEL_ADVISORY",
  }));
  assert.equal(receipt.terminal_acceptance_effect, "NO_TERMINAL_EFFECT");
  assert.equal(resolveObligationAcceptance([receipt], HEAD, "proof-validity").state, "OPEN");
});

test("strong verifier FAIL beats model confidence", () => {
  const kernel = createVerifierAcceptanceReceipt(acceptance({ result: "FAIL" }));
  const model = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-model-001",
    verifier_id: "model-reviewer-01",
    verifier_authority_class: "MODEL_ADVISORY",
    result: "PASS",
  }));
  assert.equal(resolveObligationAcceptance([model, kernel], HEAD, "proof-validity").state, "REJECTED");
});

test("stale verifier fails closed instead of inheriting PASS", () => {
  const stale = createVerifierAcceptanceReceipt(acceptance({ verifier_freshness_state: "STALE" }));
  assert.equal(stale.terminal_acceptance_effect, "ESCALATE");
  assert.equal(resolveObligationAcceptance([stale], HEAD, "proof-validity").state, "BLOCKED");
});

test("scoped exact comparator cannot close unrelated required obligations", async () => {
  const comparator = acceptance({
    acceptance_id: "acc-provenance-001",
    obligation_id: "protected-provenance",
    obligation_description: "Protected provenance fields exact-match.",
    verifier_id: "protected-field-comparator-v1",
    verifier_authority_class: "EXACT_COMPARATOR",
  });
  const receipt = await harness([comparator], [
    { obligation_id: "protected-provenance", description: "Protected provenance exact match", required: true },
    { obligation_id: "security-boundary", description: "Security boundary is satisfied", required: true },
  ]);
  assert.equal(receipt.obligations[0].state, "ACCEPTED");
  assert.equal(receipt.obligations[1].state, "OPEN");
  assert.equal(receipt.terminal_status, "PARTIAL");
});

test("artifact/head mismatch is rejected before a harness receipt can be emitted", async () => {
  await assert.rejects(
    () => harness([acceptance({ artifact_version_or_head: BASE })]),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.some((issue) => issue.includes("artifact_version_or_head must equal harness head_sha")));
      return true;
    },
  );
});

test("required verifier rejection makes overall harness status FAIL", async () => {
  const receipt = await harness([acceptance({ result: "FAIL" })]);
  assert.equal(receipt.obligations[0].state, "REJECTED");
  assert.equal(receipt.terminal_status, "FAIL");
});

test("all required obligations accepted yields PASS", async () => {
  const receipt = await harness([acceptance()]);
  assert.equal(receipt.terminal_status, "PASS");
});

test("receipt digest and obligation states are mechanically replayable", async () => {
  const receipt = await harness([acceptance()]);
  assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(await verifyCodingHarnessReceipt(receipt), []);

  const tampered = {
    ...receipt,
    terminal_status: "FAIL" as const,
  };
  const issues = await verifyCodingHarnessReceipt(tampered);
  assert.ok(issues.some((issue) => issue.includes("terminal_status must be mechanically derived")));
  assert.ok(issues.some((issue) => issue.includes("receipt_digest mismatch")));
});

test("unresolved conflicting terminal verifiers fail closed", () => {
  const pass = createVerifierAcceptanceReceipt(acceptance({ acceptance_id: "acc-pass" }));
  const fail = createVerifierAcceptanceReceipt(acceptance({ acceptance_id: "acc-fail", verifier_id: "kernel-02", result: "FAIL" }));
  const resolution = resolveObligationAcceptance([pass, fail], HEAD, "proof-validity");
  assert.equal(resolution.state, "BLOCKED");
  assert.ok(resolution.reason_codes.includes("VERIFIER_CONFLICT_UNRESOLVED"));
});

test("cyclic verifier priority declarations fail closed", () => {
  const first = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-cycle-a",
    verifier_id: "kernel-a",
    higher_priority_verifier_ids: ["kernel-b"],
  }));
  const second = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-cycle-b",
    verifier_id: "kernel-b",
    higher_priority_verifier_ids: ["kernel-a"],
  }));
  const resolution = resolveObligationAcceptance([first, second], HEAD, "proof-validity");
  assert.equal(resolution.state, "BLOCKED");
  assert.ok(resolution.reason_codes.includes("VERIFIER_PRIORITY_CYCLE_OR_NO_MAXIMAL_OWNER"));
});
