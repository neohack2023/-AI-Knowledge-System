import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextPacketValidationError,
  assertTrustedContextPacketEntry,
  packetBindingSemantics,
  validateTrustedContextPacketEntry,
  type TrustedContextPacketEntry,
} from "../shared/context-packet.ts";

const informationalEntry = (): TrustedContextPacketEntry => ({
  schema_name: "TrustedContextPacketEntry",
  schema_version: "1.0",
  entry_id: "entry-001",
  object_id: "object-001",
  provenance_envelope_id: "envelope-001",
  binding_strength: "INFORMATIONAL",
  binding_basis_refs: [],
});

test("informational packet entries do not require a binding basis", () => {
  assert.deepEqual(validateTrustedContextPacketEntry(informationalEntry()), []);
});

test("non-informational packet entries require an explicit binding basis", () => {
  const entry: TrustedContextPacketEntry = {
    ...informationalEntry(),
    binding_strength: "AUTHORITY_FACT",
  };

  assert.throws(
    () => assertTrustedContextPacketEntry(entry),
    (error) => {
      assert.ok(error instanceof ContextPacketValidationError);
      assert.equal(error.code, "CONTEXT_PACKET_BINDING_INVALID");
      assert.match(error.message, /AUTHORITY_FACT requires at least one binding_basis_ref/);
      return true;
    },
  );
});

test("unknown binding strengths fail closed", () => {
  const entry = {
    ...informationalEntry(),
    binding_strength: "IMPORTANT_MEMORY",
  } as unknown as TrustedContextPacketEntry;

  const issues = validateTrustedContextPacketEntry(entry);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /binding_strength must be one of/);
});

test("only governance gates are execution-blocking in the contract", () => {
  assert.equal(packetBindingSemantics.GOVERNANCE_GATE.blocks_execution, true);
  assert.equal(packetBindingSemantics.AUTHORITY_FACT.blocks_execution, false);
  assert.equal(packetBindingSemantics.CANON_LOCK.blocks_execution, false);
});

test("binding basis references reject blanks and duplicates", () => {
  const entry: TrustedContextPacketEntry = {
    ...informationalEntry(),
    binding_strength: "WORKFLOW_RULE",
    binding_basis_refs: ["workflow:memory-audit", "", "workflow:memory-audit"],
  };

  const issues = validateTrustedContextPacketEntry(entry);
  assert.ok(issues.some((issue) => issue.includes("empty references")));
  assert.ok(issues.some((issue) => issue.includes("duplicate references")));
});
