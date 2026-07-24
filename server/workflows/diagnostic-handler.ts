import type {
  HandlerResult,
  JsonObject,
  WorkflowHandler,
  WorkflowHandlerContext,
} from "./types.ts";

const stableJson = (value: JsonObject) => JSON.stringify(
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
);

const checksum = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const requiredString = (record: Record<string, unknown>, key: string) => (
  typeof record[key] === "string" ? record[key] as string : ""
);

export class InternalDiagnosticWorkflowHandler implements WorkflowHandler {
  readonly workflow_id = "internal-runtime-diagnostic";
  readonly version = "1.2.0";
  readonly allowed_scope_keys = ["*"] as const;
  readonly supports_pause = true;
  readonly supports_cancel = true;

  async start({ execution, now, provenance }: WorkflowHandlerContext): Promise<HandlerResult> {
    const keys = Object.keys(execution.input).sort();
    const serialized = stableJson(execution.input);
    const inputSha256 = await checksum(serialized);
    provenance.emit({
      object_id: `workflow-input:${execution.execution_id}`,
      object_type: "workflow_execution_input",
      operation: "RETRIEVAL",
      source_system: "TRANSIENT_CONTEXT",
      source_id: "workflow_execution.input",
      source_version: null,
      source_fingerprint: `sha256:${inputSha256}`,
      retrieved_at: now(),
      object_fingerprint: `sha256:${inputSha256}`,
      authority_owner: "WorkflowExecutionKernel",
      authority_domain: "execution-local input",
      authority_state: "NON_AUTHORITATIVE",
      confidence: 1,
      access_policy_refs: ["execution-local-read"],
      write_policy_refs: [],
    });

    return {
      status: "RUNNING",
      current_stage: "compute",
      output: {
        validated: true,
        input_keys: keys,
        input_property_count: keys.length,
      },
      event_type: "diagnostic.input.validated",
      event_data: { input_property_count: keys.length },
    };
  }

  async advance({ execution, now, provenance }: WorkflowHandlerContext): Promise<HandlerResult> {
    if (execution.current_stage === "compute") {
      const serialized = stableJson(execution.input);
      const inputSha256 = await checksum(serialized);
      const retrieval = provenance.list().find((envelope) => (
        envelope.operation === "RETRIEVAL"
        && envelope.object_id === `workflow-input:${execution.execution_id}`
      ));
      if (!retrieval) throw new Error("Diagnostic transformation requires the validated retrieval provenance envelope.");

      provenance.emit({
        object_id: `diagnostic-digest:${execution.execution_id}`,
        object_type: "derived_execution_evidence",
        operation: "TRANSFORMATION",
        source_system: "WORKFLOW_KERNEL",
        source_id: "internal-runtime-diagnostic/compute",
        source_version: this.version,
        source_fingerprint: retrieval.object_fingerprint,
        retrieved_at: null,
        object_fingerprint: `sha256:${inputSha256}`,
        parent_evidence_ids: [retrieval.envelope_id],
        transform_chain: [{
          activity_id: `sha256:${execution.execution_id}`,
          activity_type: "SHA-256",
          executor: "InternalDiagnosticWorkflowHandler",
          input_evidence_ids: [retrieval.envelope_id],
          completed_at: now(),
        }],
        authority_owner: "WorkflowExecutionKernel",
        authority_domain: "derived execution evidence",
        authority_state: "DERIVED",
        confidence: 1,
        access_policy_refs: ["execution-local-read"],
        write_policy_refs: [],
      });

      return {
        status: "RUNNING",
        current_stage: "finalize",
        output: {
          ...(execution.output ?? {}),
          input_bytes: new TextEncoder().encode(serialized).byteLength,
          input_sha256: inputSha256,
        },
        event_type: "diagnostic.computation.completed",
        event_data: { algorithm: "SHA-256" },
      };
    }

    if (execution.current_stage === "finalize") {
      const output: JsonObject = {
        ...(execution.output ?? {}),
        diagnostic: "PASS",
        executed_on: "server",
        handler_version: this.version,
        finished_at: now(),
        external_systems_accessed: [],
      };

      const writeProbe = asRecord(execution.input.governed_write_probe);
      if (!writeProbe) {
        return {
          status: "COMPLETED",
          current_stage: "completed",
          result_class: "DIAGNOSTIC_COMPLETE",
          output,
          event_type: "diagnostic.completed",
        };
      }

      const writePolicyRefs = Array.isArray(writeProbe.write_policy_refs)
        ? writeProbe.write_policy_refs.filter((value): value is string => typeof value === "string")
        : [];
      const authorization = {
        write_authorized: writeProbe.write_authorized === true,
        write_policy_refs: writePolicyRefs,
        mason_episode_id: requiredString(writeProbe, "mason_episode_id"),
        write_plan_id: requiredString(writeProbe, "write_plan_id"),
        authorization_id: requiredString(writeProbe, "authorization_id"),
        destination: requiredString(writeProbe, "destination"),
      };
      provenance.assertGovernedWriteAuthorization(authorization);

      const parent = provenance.list().find((envelope) => envelope.operation === "TRANSFORMATION");
      if (!parent) throw new Error("Governed write probe requires transformation provenance.");
      const executionReceiptId = requiredString(writeProbe, "execution_receipt_id");
      const writeFingerprint = await checksum(stableJson({
        destination: authorization.destination,
        parent_fingerprint: parent.object_fingerprint,
        execution_receipt_id: executionReceiptId,
      }));

      output.governed_write_probe = {
        status: "PROCESS_LOCAL_ONLY",
        destination: authorization.destination,
        execution_receipt_id: executionReceiptId,
      };

      return {
        status: "COMPLETED",
        current_stage: "completed",
        result_class: "DIAGNOSTIC_COMPLETE",
        output,
        provenance_emissions: [{
          object_id: `governed-write-probe:${execution.execution_id}`,
          object_type: "process_local_write_receipt",
          operation: "GOVERNED_WRITE",
          source_system: "WORKFLOW_KERNEL",
          source_id: "WorkflowExecution.output/governed_write_probe",
          source_version: this.version,
          source_fingerprint: parent.object_fingerprint,
          retrieved_at: null,
          object_fingerprint: `sha256:${writeFingerprint}`,
          parent_evidence_ids: [parent.envelope_id],
          transform_chain: [{
            activity_id: `governed-write:${execution.execution_id}`,
            activity_type: "PROCESS_LOCAL_GOVERNED_WRITE_PROBE",
            executor: "WorkflowExecutionKernel",
            input_evidence_ids: [parent.envelope_id],
            completed_at: now(),
          }],
          authority_owner: "WorkflowExecutionKernel",
          authority_domain: "process-local diagnostic execution state",
          authority_state: "NON_AUTHORITATIVE",
          confidence: 1,
          access_policy_refs: ["execution-local-read"],
          write_policy_refs: writePolicyRefs,
          mason_episode_id: authorization.mason_episode_id,
          write_plan_id: authorization.write_plan_id,
          authorization_id: authorization.authorization_id,
          execution_receipt_id: executionReceiptId,
          destination: authorization.destination,
          write_authorized: true,
        }],
        event_type: "diagnostic.completed",
        event_data: { governed_write_probe: "PROCESS_LOCAL_ONLY" },
      };
    }

    throw new Error(`Diagnostic handler cannot advance from stage ${execution.current_stage ?? "null"}.`);
  }
}
