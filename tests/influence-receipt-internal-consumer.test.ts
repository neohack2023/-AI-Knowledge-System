import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowExecutionKernel,
  WorkflowKernelError,
} from "../server/workflows/kernel.ts";

type ReferencedProvenanceSource = {
  provenance_envelope_id: string;
  contribution_class: "EVIDENCE" | "CONSTRAINT" | "CURRENT_STATE" | "AUTHORITY_REFERENCE" | "ACTION_INPUT";
  linkage_type: "CITED_IN_OUTPUT" | "NAMED_IN_DECISION_RECEIPT" | "LINKED_TO_ACTION_INPUT" | "LINKED_TO_VERIFICATION_RECEIPT";
};

type InfluenceReceiptReferenceFixture = {
  execution_id: string;
  resolved_scope: string;
  referenced_sources: ReferencedProvenanceSource[];
  admitted_object_count: number;
  referenced_object_count: number;
};

const executeDiagnostic = async (kernel: WorkflowExecutionKernel, input: Record<string, unknown> = {}) => {
  const created = kernel.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
    input,
  });
  return kernel.runToCompletion(created.execution.execution_id);
};

const resolveInfluenceReceiptReferences = (
  kernel: WorkflowExecutionKernel,
  receipt: InfluenceReceiptReferenceFixture,
) => {
  if (receipt.referenced_object_count !== receipt.referenced_sources.length) {
    throw new Error("INFLUENCE_REFERENCE_COUNT_MISMATCH");
  }
  if (receipt.referenced_object_count > receipt.admitted_object_count) {
    throw new Error("INFLUENCE_REFERENCE_EXCEEDS_ADMITTED");
  }

  return receipt.referenced_sources.map((source) => ({
    contribution_class: source.contribution_class,
    linkage_type: source.linkage_type,
    provenance: kernel.getProvenanceEnvelope(
      receipt.execution_id,
      source.provenance_envelope_id,
      receipt.resolved_scope,
    ),
  }));
};

const expectKernelError = (fn: () => unknown, code: string) => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof WorkflowKernelError);
    assert.equal(error.code, code);
    return true;
  });
};

test("IC01 admitted InfluenceReceipt consumer resolves one referenced envelope through merged adapter", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC01" });
  const referenced = snapshot.provenance_envelopes[0];
  const resolved = resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].provenance.envelope_id, referenced.envelope_id);
  assert.equal(resolved[0].provenance.used_by_execution_id, snapshot.execution.execution_id);
  assert.equal(resolved[0].provenance.validity, "VALID");
});

test("IC02 admitted-but-unreferenced envelope is not resolved merely because it was present", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC02" });
  assert.ok(snapshot.provenance_envelopes.length >= 2);

  const referenced = snapshot.provenance_envelopes[0];
  const unused = snapshot.provenance_envelopes[1];
  const resolved = resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  });

  assert.equal(resolved.some((entry) => entry.provenance.envelope_id === unused.envelope_id), false);
});

test("IC03 unknown provenance envelope fails closed", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC03" });
  expectKernelError(() => resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: crypto.randomUUID(),
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  }), "PROVENANCE_ENVELOPE_NOT_FOUND");
});

test("IC04 reference from another execution cannot resolve through the receipt execution", async () => {
  const kernel = new WorkflowExecutionKernel();
  const first = await executeDiagnostic(kernel, { fixture: "IC04-a" });
  const second = await executeDiagnostic(kernel, { fixture: "IC04-b" });
  const other = second.provenance_envelopes[0];

  expectKernelError(() => resolveInfluenceReceiptReferences(kernel, {
    execution_id: first.execution.execution_id,
    resolved_scope: first.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: other.envelope_id,
      contribution_class: "CURRENT_STATE",
      linkage_type: "NAMED_IN_DECISION_RECEIPT",
    }],
    admitted_object_count: first.provenance_envelopes.length,
    referenced_object_count: 1,
  }), "PROVENANCE_ENVELOPE_NOT_FOUND");
});

test("IC05 receipt scope mismatch fails closed", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC05" });
  const referenced = snapshot.provenance_envelopes[0];

  expectKernelError(() => resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: "wrong-scope",
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "CONSTRAINT",
      linkage_type: "LINKED_TO_VERIFICATION_RECEIPT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  }), "PROVENANCE_SCOPE_MISMATCH");
});

test("IC06 resolved authority metadata does not become action or write authorization", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC06" });
  const referenced = snapshot.provenance_envelopes[0];
  const [resolved] = resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "AUTHORITY_REFERENCE",
      linkage_type: "NAMED_IN_DECISION_RECEIPT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  });

  const projection = resolved.provenance as Record<string, unknown>;
  assert.ok("authority_state" in projection);
  assert.equal("write_authorized" in projection, false);
  assert.equal("authorization_id" in projection, false);
  assert.equal("read_authorized" in projection, false);
});

test("IC07 consumer read leaves execution events and provenance collections unchanged", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC07" });
  const referenced = snapshot.provenance_envelopes[0];
  const before = kernel.getExecution(snapshot.execution.execution_id);

  resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "LINKED_TO_VERIFICATION_RECEIPT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 1,
  });

  const after = kernel.getExecution(snapshot.execution.execution_id);
  assert.deepEqual(after.events, before.events);
  assert.deepEqual(after.provenance_envelopes, before.provenance_envelopes);
});

test("IC08 two explicitly referenced envelopes resolve exactly two projections", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC08" });
  const [retrieval, transformation] = snapshot.provenance_envelopes;
  assert.ok(retrieval);
  assert.ok(transformation);

  const resolved = resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [
      {
        provenance_envelope_id: retrieval.envelope_id,
        contribution_class: "EVIDENCE",
        linkage_type: "CITED_IN_OUTPUT",
      },
      {
        provenance_envelope_id: transformation.envelope_id,
        contribution_class: "ACTION_INPUT",
        linkage_type: "LINKED_TO_ACTION_INPUT",
      },
    ],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 2,
  });

  assert.equal(resolved.length, 2);
  assert.deepEqual(
    resolved.map((entry) => entry.provenance.envelope_id),
    [retrieval.envelope_id, transformation.envelope_id],
  );
});

test("IC09 reference count integrity remains fail-closed in the consumer", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC09" });
  const referenced = snapshot.provenance_envelopes[0];

  assert.throws(() => resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 2,
  }), /INFLUENCE_REFERENCE_COUNT_MISMATCH/);
});

test("IC10 referenced count cannot exceed admitted count", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC10" });
  const referenced = snapshot.provenance_envelopes[0];

  assert.throws(() => resolveInfluenceReceiptReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: 0,
    referenced_object_count: 1,
  }), /INFLUENCE_REFERENCE_EXCEEDS_ADMITTED/);
});
