import { nativeRuntimeCapabilityRegistry } from "../capabilities/registry.ts";
import { workflowExecutionKernel } from "../workflows/kernel.ts";
import type { JsonObject } from "../workflows/types.ts";

export type ChatBridgeExecutionPolicyResult =
  | { allowed: true; capability_id: string }
  | { allowed: false; code: string; message: string };

export const evaluateChatBridgeWorkflow = (
  workflowId: string,
  input: JsonObject = {},
): ChatBridgeExecutionPolicyResult => {
  const capability = nativeRuntimeCapabilityRegistry.find((definition) => definition.workflow_id === workflowId);
  if (!capability) {
    return {
      allowed: false,
      code: "BRIDGE_WORKFLOW_NOT_ADMITTED",
      message: "Workflow is not bound to an admitted runtime capability.",
    };
  }

  const safe = (
    capability.status === "ACTIVE"
    && capability.trust_level === "INTERNAL_NATIVE"
    && capability.data_access === "EXECUTION_LOCAL"
    && capability.reversibility === "FULLY_REVERSIBLE"
    && capability.blast_radius === "PROCESS_LOCAL"
    && capability.autonomy_band === "A0"
    && capability.approval_required === false
    && capability.execution_modes.includes("LIVE")
  );
  if (!safe) {
    return {
      allowed: false,
      code: "BRIDGE_WORKFLOW_POLICY_BLOCKED",
      message: "Workflow does not satisfy the A0 / INTERNAL_NATIVE / EXECUTION_LOCAL / FULLY_REVERSIBLE / PROCESS_LOCAL bridge policy.",
    };
  }

  if (Object.hasOwn(input, "governed_write_probe")) {
    return {
      allowed: false,
      code: "BRIDGE_GOVERNED_WRITE_BLOCKED",
      message: "The ChatGPT bridge does not admit governed_write_probe input.",
    };
  }

  return { allowed: true, capability_id: capability.capability_id };
};

export const listChatBridgeExecutableWorkflows = () =>
  workflowExecutionKernel.listLiveWorkflows().filter((workflow) =>
    evaluateChatBridgeWorkflow(workflow.workflow_id, {}).allowed,
  );
