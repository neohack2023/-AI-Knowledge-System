import assert from "node:assert/strict";
import test from "node:test";

import { GET as workflowGet } from "../app/api/workflow-executions/route.ts";
import type { ContextProvenanceEnvelope } from "../server/provenance/types.ts";
import {
  WorkflowExecutionKernel,
  WorkflowKernelError,
  workflowExecutionKernel,
} from "../server/workflows/kernel.ts";

type KernelInternals = {
  provenance: Map<string, ContextProvenanceEnvelope[]>;
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

const firstEnvelope = (kernel: WorkflowExecutionKernel, executionId: string) => {
  const internals = kernel as unknown as KernelInternals;
  const envelope = internals.provenance.get(executionId)?.[0];
  assert.ok(envelope);
  return envelope;
};

const expectKernelError = (fn: () => unknown, code: string) => {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof WorkflowKernelError);
    assert.equal(error.code, code);
    return true;
  });
};

test("C01 known execution + envelope + matching scope returns VALID projection", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = snapshot.provenance_envelopes[0];
  const projection = kernel.getProvenanceEnvelope(
    snapshot.execution.execution_id,
    envelope.envelope_id,
    "global-working-memory",
  );
  assert.equal(projection.validity, "VALID");
  assert.equal(projection.envelope_id, envelope.envelope_id);
  assert.equal(projection.used_by_execution_id, snapshot.execution.execution_id);
});

test("C02 known execution + unknown envelope fails closed", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  expectKernelError(
    () => kernel.getProvenanceEnvelope(snapshot.execution.execution_id, crypto.randomUUID()),
    "PROVENANCE_ENVELOPE_NOT_FOUND",
  );
});

test("C03 unknown execution fails closed", () => {
  const kernel = new WorkflowExecutionKernel();
  expectKernelError(
    () => kernel.getProvenanceEnvelope(crypto.randomUUID(), crypto.randomUUID()),
    "EXECUTION_NOT_FOUND",
  );
});

test("C04 envelope bound to another execution is rejected", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = firstEnvelope(kernel, snapshot.execution.execution_id);
  envelope.used_by_execution_id = crypto.randomUUID();
  expectKernelError(
    () => kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id),
    "PROVENANCE_EXECUTION_BINDING_MISMATCH",
  );
});

test("C05 caller scope differing from execution is rejected", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = snapshot.provenance_envelopes[0];
  expectKernelError(
    () => kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id, "other-scope"),
    "PROVENANCE_SCOPE_MISMATCH",
  );
});

test("C06 envelope scope differing from execution is rejected", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = firstEnvelope(kernel, snapshot.execution.execution_id);
  envelope.scope_key = "other-scope";
  expectKernelError(
    () => kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id),
    "PROVENANCE_SCOPE_MISMATCH",
  );
});

test("C07 stored envelope failing current validation is rejected", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = firstEnvelope(kernel, snapshot.execution.execution_id);
  envelope.object_id = "";
  expectKernelError(
    () => kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id),
    "PROVENANCE_ENVELOPE_INVALID",
  );
});

test("C08 minimum projection excludes payload, correlation, policy, and timestamp fields", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = firstEnvelope(kernel, snapshot.execution.execution_id) as ContextProvenanceEnvelope & Record<string, unknown>;
  envelope.source_body = "forbidden source body";
  envelope.prompt = "forbidden prompt";
  envelope.output = { forbidden: true };
  const projection = kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id) as Record<string, unknown>;
  for (const field of [
    "source_body",
    "prompt",
    "output",
    "source_fingerprint",
    "object_fingerprint",
    "access_policy_refs",
    "write_policy_refs",
    "retrieved_at",
    "validated_at",
  ]) {
    assert.equal(field in projection, false, `${field} must not be projected`);
  }
});

test("C09 envelope existing only in another execution does not trigger global fallback", async () => {
  const kernel = new WorkflowExecutionKernel();
  const first = await executeDiagnostic(kernel, { execution: 1 });
  const second = await executeDiagnostic(kernel, { execution: 2 });
  const otherEnvelope = second.provenance_envelopes[0];
  expectKernelError(
    () => kernel.getProvenanceEnvelope(first.execution.execution_id, otherEnvelope.envelope_id),
    "PROVENANCE_ENVELOPE_NOT_FOUND",
  );
});

test("C10 authority metadata does not project write authorization", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = snapshot.provenance_envelopes[0];
  const projection = kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id) as Record<string, unknown>;
  assert.ok("authority_state" in projection);
  assert.equal("write_authorized" in projection, false);
  assert.equal("authorization_id" in projection, false);
  assert.equal("destination" in projection, false);
});

test("C11 policy metadata is not exposed and no policy-enforcement result is implied", async () => {
  const kernel = new WorkflowExecutionKernel();
  const snapshot = await executeDiagnostic(kernel);
  const envelope = snapshot.provenance_envelopes[0];
  assert.ok(envelope.access_policy_refs.length > 0);
  const projection = kernel.getProvenanceEnvelope(snapshot.execution.execution_id, envelope.envelope_id) as Record<string, unknown>;
  assert.equal("access_policy_refs" in projection, false);
  assert.equal("policy_evaluated" in projection, false);
  assert.equal("read_authorized" in projection, false);
});

test("C12 workflow GET route does not expose a provenance-envelope lookup primitive", async () => {
  const snapshot = await executeDiagnostic(workflowExecutionKernel, { route_fixture: true });
  const envelope = snapshot.provenance_envelopes[0];
  const request = new Request(
    `http://localhost/api/workflow-executions?execution_id=${snapshot.execution.execution_id}`
      + `&provenance_envelope_id=${envelope.envelope_id}`,
  );
  const response = await workflowGet(request);
  assert.equal(response.status, 200);
  const body = await response.json() as Record<string, unknown>;
  assert.equal("schema_name" in body, false);
  assert.ok("execution" in body);
  assert.ok("provenance_envelopes" in body);
});
