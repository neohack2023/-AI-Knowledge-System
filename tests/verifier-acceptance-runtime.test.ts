import assert from "node:assert/strict";
import test from "node:test";

import {
  CodingHarnessReceiptValidationError,
  VerifierAcceptanceValidationError,
  createCodingHarnessExecutionReceipt,
  createVerifierAcceptanceReceipt,
  resolveObligationAcceptance,
  verifyCodingHarnessReceipt,
  type CodingHarnessExecutionInput,
  type VerifierAcceptanceInput,
} from "../server/coding-harness/index.ts";

const HEAD = "38917a9028ef64161adf3d9a4d2212a3917e1b31";
const BASE = "4088c690ab8e0fbee761ff8e503bbe4273e4ed58";

const DEFAULT_OBLIGATIONS = [
  { obligation_id: "proof-validity", description: "Proof validity", required: true },
];

const acceptance = (overrides: Partial<VerifierAcceptanceInput> = {}): VerifierAcceptanceInput => ({
  acceptance_id: "acc-proof-001",
  scope_key: "global-working-memory",
  task_id: "task-verifier-runtime-001",
  artifact_or_object_id: "neohack2023/-AI-Knowledge-System",
  artifact_version_or_head: HEAD,
  artifact_digest: `git-sha:${HEAD}`,
  obligation_id: "proof-validity",
  obligation_description: "Proof validity",
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

const harness = (
  verifier_acceptance_inputs: VerifierAcceptanceInput[],
  obligations = DEFAULT_OBLIGATIONS,
  overrides: Partial<CodingHarnessExecutionInput> = {},
) => createCodingHarnessExecutionReceipt({
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
  ...overrides,
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

test("stale model advisory evidence stays non-terminal beside a valid verifier", () => {
  const model = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-stale-model-001",
    verifier_id: "model-reviewer-stale",
    verifier_authority_class: "MODEL_ADVISORY",
    verifier_freshness_state: "STALE",
    result: "PASS",
  }));
  const kernel = createVerifierAcceptanceReceipt(acceptance({ acceptance_id: "acc-current-kernel-001" }));
  assert.equal(model.terminal_acceptance_effect, "NO_TERMINAL_EFFECT");
  const resolution = resolveObligationAcceptance([model, kernel], HEAD, "proof-validity");
  assert.equal(resolution.state, "ACCEPTED");
  assert.deepEqual(resolution.advisory_acceptance_ids, ["acc-stale-model-001"]);
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

test("stale authoritative verifier fails closed instead of inheriting PASS", () => {
  const stale = createVerifierAcceptanceReceipt(acceptance({ verifier_freshness_state: "STALE" }));
  assert.equal(stale.terminal_acceptance_effect, "ESCALATE");
  assert.equal(resolveObligationAcceptance([stale], HEAD, "proof-validity").state, "BLOCKED");
});

test("scoped exact comparator cannot close unrelated required obligations", async () => {
  const comparator = acceptance({
    acceptance_id: "acc-provenance-001",
    obligation_id: "protected-provenance",
    obligation_description: "Protected provenance exact match",
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

test("receipt verification ignores semantically irrelevant obligation key order", async () => {
  const receipt = await harness([acceptance()]);
  const obligation = receipt.obligations[0];
  const reordered = {
    ...receipt,
    obligations: [{
      reason_codes: obligation.reason_codes,
      advisory_acceptance_ids: obligation.advisory_acceptance_ids,
      acceptance_ids: obligation.acceptance_ids,
      state: obligation.state,
      required: obligation.required,
      description: obligation.description,
      obligation_id: obligation.obligation_id,
    }],
  };

  assert.equal(reordered.receipt_digest, receipt.receipt_digest);
  assert.deepEqual(await verifyCodingHarnessReceipt(reordered), []);
});

test("receipt digest canonicalization does not depend on localeCompare", async () => {
  const originalLocaleCompare = String.prototype.localeCompare;
  try {
    String.prototype.localeCompare = () => {
      throw new Error("localeCompare must not participate in receipt canonicalization");
    };
    const receipt = await harness([acceptance()], DEFAULT_OBLIGATIONS, {
      environment: { z: "last-ascii", "ä": "non-ascii" },
    });
    assert.match(receipt.receipt_digest, /^sha256:[0-9a-f]{64}$/);
    assert.deepEqual(await verifyCodingHarnessReceipt(receipt), []);
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});

test("schema-bound check and artifact arrays reject non-object entries", async () => {
  await assert.rejects(
    () => harness([acceptance()], DEFAULT_OBLIGATIONS, {
      checks: [null as unknown as Record<string, unknown>],
    }),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("checks[0] must be an object"));
      return true;
    },
  );

  await assert.rejects(
    () => harness([acceptance()], DEFAULT_OBLIGATIONS, {
      artifacts: ["build" as unknown as Record<string, unknown>],
    }),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("artifacts[0] must be an object"));
      return true;
    },
  );
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

test("a priority cycle cannot be hidden by an unrelated maximal verifier", () => {
  const first = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-cycle-hidden-a",
    verifier_id: "kernel-cycle-a",
    higher_priority_verifier_ids: ["kernel-cycle-b"],
    result: "PASS",
  }));
  const second = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-cycle-hidden-b",
    verifier_id: "kernel-cycle-b",
    higher_priority_verifier_ids: ["kernel-cycle-a"],
    result: "FAIL",
  }));
  const unrelated = createVerifierAcceptanceReceipt(acceptance({
    acceptance_id: "acc-unrelated-maximal",
    verifier_id: "kernel-independent",
    result: "PASS",
  }));
  const resolution = resolveObligationAcceptance([first, second, unrelated], HEAD, "proof-validity");
  assert.equal(resolution.state, "BLOCKED");
  assert.ok(resolution.reason_codes.includes("VERIFIER_PRIORITY_CYCLE_OR_NO_MAXIMAL_OWNER"));
});

test("undeclared verifier fields are rejected before a schema-bound receipt is emitted", () => {
  const malformed = {
    ...acceptance(),
    undeclared_review_hint: "should-not-survive",
  } as unknown as VerifierAcceptanceInput;

  assert.throws(
    () => createVerifierAcceptanceReceipt(malformed),
    (error) => {
      assert.ok(error instanceof VerifierAcceptanceValidationError);
      assert.ok(error.issues.includes("unknown field undeclared_review_hint"));
      return true;
    },
  );
});

test("malformed obligation entries fail with a controlled validation error before dereference", async () => {
  await assert.rejects(
    () => harness(
      [acceptance()],
      [null as unknown as (typeof DEFAULT_OBLIGATIONS)[number]],
    ),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("obligations[0] must be an object"));
      return true;
    },
  );
});

test("undeclared obligation input fields are rejected before schema-bound emission", async () => {
  const malformedObligations = [{
    obligation_id: "proof-validity",
    description: "Proof validity",
    required: true,
    note: "undeclared",
  }] as unknown as typeof DEFAULT_OBLIGATIONS;

  await assert.rejects(
    () => harness([acceptance()], malformedObligations),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("obligations[0] contains unknown field note"));
      return true;
    },
  );
});

test("undeclared top-level receipt fields are rejected during verification", async () => {
  const receipt = await harness([acceptance()]);
  const malformed = {
    ...receipt,
    undeclared_receipt_note: "schema-closed",
  } as typeof receipt & { undeclared_receipt_note: string };

  const issues = await verifyCodingHarnessReceipt(malformed);
  assert.ok(issues.includes("receipt contains unknown field undeclared_receipt_note"));
});

test("verification requires schema-required top-level fields even when creation would default them", async () => {
  const receipt = await harness([acceptance()]);
  const { environment: _removed, ...malformed } = receipt;
  const issues = await verifyCodingHarnessReceipt(malformed as unknown as typeof receipt);
  assert.ok(issues.includes("receipt missing required field environment"));
});

test("verification requires normalized verifier receipt fields before priority traversal", async () => {
  const receipt = await harness([acceptance()]);
  const [first, ...rest] = receipt.verifier_acceptances;
  const { higher_priority_verifier_ids: _removed, ...malformedAcceptance } = first;
  const malformed = {
    ...receipt,
    verifier_acceptances: [malformedAcceptance, ...rest],
  } as unknown as typeof receipt;

  const issues = await verifyCodingHarnessReceipt(malformed);
  assert.ok(issues.some((issue) => issue.includes("missing required field higher_priority_verifier_ids")));
});

test("verification shape-checks receipt obligations before projecting their fields", async () => {
  const receipt = await harness([acceptance()]);
  const malformed = {
    ...receipt,
    obligations: [null],
  } as unknown as typeof receipt;

  const issues = await verifyCodingHarnessReceipt(malformed);
  assert.ok(issues.includes("receipt obligations[0] must be an object"));
});
