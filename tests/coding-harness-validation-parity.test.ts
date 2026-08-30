import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CodingHarnessReceiptValidationError,
  VerifierAcceptanceValidationError,
  createCodingHarnessExecutionReceipt,
  createCodingHarnessReceipt,
  createVerifierAcceptanceReceipt,
  type CodingHarnessExecutionInput,
  type CodingHarnessReceiptInput,
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

const executionInput = (overrides: Partial<CodingHarnessExecutionInput> = {}): CodingHarnessExecutionInput => ({
  repository: "neohack2023/-AI-Knowledge-System",
  head_sha: HEAD,
  base_sha: BASE,
  profile: "PR",
  environment: { node: "22" },
  changed_paths: ["server/coding-harness/receipt.ts"],
  checks: [{ id: "node-test", status: "PASS" }],
  artifacts: [],
  known_regressions_loaded: ["VOA-01"],
  failed_reason_codes: [],
  obligations: [{ obligation_id: "proof-validity", description: "Proof validity", required: true }],
  verifier_acceptance_inputs: [acceptance()],
  ...overrides,
});

test("whitespace-padded obligation identifiers fail closed before matching or emission", async () => {
  await assert.rejects(
    () => createCodingHarnessExecutionReceipt(executionInput({
      obligations: [{ obligation_id: " proof-validity ", description: "Proof validity", required: true }],
    })),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("obligation_id must not have leading or trailing whitespace"));
      return true;
    },
  );
});

test("non-object execution inputs produce controlled validation errors before dereference", async () => {
  for (const malformed of [null, []]) {
    await assert.rejects(
      () => createCodingHarnessExecutionReceipt(malformed as unknown as CodingHarnessExecutionInput),
      (error) => {
        assert.ok(error instanceof CodingHarnessReceiptValidationError);
        assert.ok(error.issues.includes("execution input must be an object"));
        return true;
      },
    );
  }
});

test("published receipt schema and runtime both require at least one mandatory obligation", async () => {
  await assert.rejects(
    () => createCodingHarnessExecutionReceipt(executionInput({
      obligations: [{ obligation_id: "proof-validity", description: "Proof validity", required: false }],
      verifier_acceptance_inputs: [],
    })),
    (error) => {
      assert.ok(error instanceof CodingHarnessReceiptValidationError);
      assert.ok(error.issues.includes("at least one obligation must be required"));
      return true;
    },
  );

  const schema = JSON.parse(await readFile(
    new URL("../schemas/aios-coding-harness-receipt-v0.1.schema.json", import.meta.url),
    "utf8",
  )) as {
    properties?: {
      obligations?: {
        minContains?: number;
        contains?: {
          required?: string[];
          properties?: { required?: { const?: boolean } };
        };
      };
    };
  };

  const obligations = schema.properties?.obligations;
  assert.equal(obligations?.minContains, 1);
  assert.deepEqual(obligations?.contains?.required, ["required"]);
  assert.equal(obligations?.contains?.properties?.required?.const, true);
});

test("published harness receipt schema mirrors runtime canonical obligation identifiers", async () => {
  const schema = JSON.parse(await readFile(
    new URL("../schemas/aios-coding-harness-receipt-v0.1.schema.json", import.meta.url),
    "utf8",
  )) as {
    properties?: {
      obligations?: {
        items?: {
          properties?: {
            obligation_id?: { pattern?: string };
          };
        };
      };
    };
  };

  const canonicalIdentifierPattern = /^(?:\S|\S[\s\S]*\S)$/;
  const obligationPattern = schema.properties?.obligations?.items?.properties?.obligation_id?.pattern;
  assert.equal(obligationPattern, canonicalIdentifierPattern.source);

  for (const candidate of [" proof-validity ", "proof-validity ", " proof-validity", "\tproof-validity", "proof-validity\n"]) {
    assert.equal(canonicalIdentifierPattern.test(candidate), false);
  }
  for (const candidate of ["proof-validity", "proof validity", "π-proof"] ) {
    assert.equal(canonicalIdentifierPattern.test(candidate), true);
  }
});

test("verifier node IDs and priority references reject surrounding whitespace before graph matching", () => {
  assert.throws(
    () => createVerifierAcceptanceReceipt(acceptance({ verifier_id: " kernel-01 " })),
    (error) => {
      assert.ok(error instanceof VerifierAcceptanceValidationError);
      assert.ok(error.issues.includes("verifier_id must not have leading or trailing whitespace"));
      return true;
    },
  );

  assert.throws(
    () => createVerifierAcceptanceReceipt(acceptance({
      higher_priority_verifier_ids: [" kernel-high "],
    })),
    (error) => {
      assert.ok(error instanceof VerifierAcceptanceValidationError);
      assert.ok(error.issues.includes("higher_priority_verifier_ids must not contain identifiers with leading or trailing whitespace"));
      return true;
    },
  );
});

test("published verifier schema mirrors runtime canonical identifier boundaries", async () => {
  const schema = JSON.parse(await readFile(
    new URL("../schemas/aios-verifier-acceptance-v0.1.schema.json", import.meta.url),
    "utf8",
  )) as {
    properties?: {
      verifier_id?: { pattern?: string };
      higher_priority_verifier_ids?: { items?: { pattern?: string } };
      lower_priority_evidence_ids?: { items?: { pattern?: string } };
    };
  };

  const canonicalIdentifierPattern = /^(?:\S|\S[\s\S]*\S)$/;
  assert.equal(schema.properties?.verifier_id?.pattern, canonicalIdentifierPattern.source);
  assert.equal(schema.properties?.higher_priority_verifier_ids?.items?.pattern, canonicalIdentifierPattern.source);
  assert.equal(schema.properties?.lower_priority_evidence_ids?.items?.pattern, canonicalIdentifierPattern.source);

  for (const candidate of [" kernel-01 ", "kernel-01 ", " kernel-01", "\tkernel-01", "kernel-01\n"]) {
    assert.equal(canonicalIdentifierPattern.test(candidate), false);
  }
  for (const candidate of ["kernel-01", "kernel high", "κernel-01"]) {
    assert.equal(canonicalIdentifierPattern.test(candidate), true);
  }
});

test("direct CodingHarness receipt construction guards null and array roots", async () => {
  for (const malformed of [null, []]) {
    await assert.rejects(
      () => createCodingHarnessReceipt(malformed as unknown as CodingHarnessReceiptInput),
      (error) => {
        assert.ok(error instanceof CodingHarnessReceiptValidationError);
        assert.ok(error.issues.includes("receipt input must be an object"));
        return true;
      },
    );
  }
});
