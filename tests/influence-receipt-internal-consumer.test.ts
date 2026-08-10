import assert from "node:assert/strict";
import test from "node:test";

import {
  InfluenceReceiptReferenceValidationError,
  resolveInfluenceReceiptProvenanceReferences,
} from "../server/influence-receipt/reference-validator.ts";
import {
  WorkflowExecutionKernel,
  WorkflowKernelError,
} from "../server/workflows/kernel.ts";

const executeDiagnostic = async (kernel: WorkflowExecutionKernel, input: Record<string, unknown> = {}) => {
  const created = kernel.createExecution({
    workflow_id: "internal-runtime-diagnostic",
    scope_key: "global-working-memory",
    mode: "LIVE",
    input,
  });
  return kernel.runToCompletion(created.execution.execution_id);
};

const expectKernelError = (fn: () => unknown, code: string) => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof WorkflowKernelError);
    assert.equal(error.code, code);
    return true;
  });
};

const expectReferenceError = (fn: () => unknown, code: string) => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof InfluenceReceiptReferenceValidationError);
    assert.equal(error.code, code);
    return true;
  });
};

test("IC01 production internal consumer resolves one referenced envelope through merged adapter", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC01" });
  const referenced = snapshot.provenance_envelopes[0];
  const resolved = resolveInfluenceReceiptProvenanceReferences(kernel, {
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
  const resolved = resolveInfluenceReceiptProvenanceReferences(kernel, {
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
  expectKernelError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
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

  expectKernelError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
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

  expectKernelError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
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
  const [resolved] = resolveInfluenceReceiptProvenanceReferences(kernel, {
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

  resolveInfluenceReceiptProvenanceReferences(kernel, {
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

  const resolved = resolveInfluenceReceiptProvenanceReferences(kernel, {
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

test("IC09 reference count integrity remains fail-closed in the production component", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC09" });
  const referenced = snapshot.provenance_envelopes[0];

  expectReferenceError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: 2,
  }), "INFLUENCE_REFERENCE_COUNT_MISMATCH");
});

test("IC10 referenced count cannot exceed admitted count", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC10" });
  const referenced = snapshot.provenance_envelopes[0];

  expectReferenceError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [{
      provenance_envelope_id: referenced.envelope_id,
      contribution_class: "EVIDENCE",
      linkage_type: "CITED_IN_OUTPUT",
    }],
    admitted_object_count: 0,
    referenced_object_count: 1,
  }), "INFLUENCE_REFERENCE_EXCEEDS_ADMITTED");
});

test("IC11 admitted_object_count must remain a non-negative integer", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC11" });

  expectReferenceError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [],
    admitted_object_count: 1.5,
    referenced_object_count: 0,
  }), "INFLUENCE_REFERENCE_COUNT_INVALID");
});

test("IC12 referenced_object_count must remain a non-negative integer", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel, { fixture: "IC12" });

  expectReferenceError(() => resolveInfluenceReceiptProvenanceReferences(kernel, {
    execution_id: snapshot.execution.execution_id,
    resolved_scope: snapshot.execution.scope_key,
    referenced_sources: [],
    admitted_object_count: snapshot.provenance_envelopes.length,
    referenced_object_count: -1,
  }), "INFLUENCE_REFERENCE_COUNT_INVALID");
});
