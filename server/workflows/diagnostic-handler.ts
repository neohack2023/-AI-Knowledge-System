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

export class InternalDiagnosticWorkflowHandler implements WorkflowHandler {
  readonly workflow_id = "internal-runtime-diagnostic";
  readonly version = "1.1.0";
  readonly supports_pause = true;
  readonly supports_cancel = true;

  async start({ execution }: WorkflowHandlerContext): Promise<HandlerResult> {
    const keys = Object.keys(execution.input).sort();
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

  async advance({ execution, now }: WorkflowHandlerContext): Promise<HandlerResult> {
    if (execution.current_stage === "compute") {
      const serialized = stableJson(execution.input);
      return {
        status: "RUNNING",
        current_stage: "finalize",
        output: {
          ...(execution.output ?? {}),
          input_bytes: new TextEncoder().encode(serialized).byteLength,
          input_sha256: await checksum(serialized),
        },
        event_type: "diagnostic.computation.completed",
        event_data: { algorithm: "SHA-256" },
      };
    }

    if (execution.current_stage === "finalize") {
      return {
        status: "COMPLETED",
        current_stage: "completed",
        result_class: "DIAGNOSTIC_COMPLETE",
        output: {
          ...(execution.output ?? {}),
          diagnostic: "PASS",
          executed_on: "server",
          handler_version: this.version,
          finished_at: now(),
          external_systems_accessed: [],
        },
        event_type: "diagnostic.completed",
      };
    }

    throw new Error(`Diagnostic handler cannot advance from stage ${execution.current_stage ?? "null"}.`);
  }
}
