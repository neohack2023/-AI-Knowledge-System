import assert from "node:assert/strict";
import test from "node:test";
import { capabilitySchemaFingerprint } from "../server/capabilities/fingerprint.ts";
import { repositoryContextRetrievalCapability } from "../server/capabilities/native-definitions.ts";
import { retrieveRepositoryContext } from "../server/vertical-slice/repository-source.ts";
import { resolveRegisteredScope, ScopeResolutionError } from "../server/vertical-slice/scope-router.ts";
import { VerticalSliceRuntime } from "../server/vertical-slice/runtime.ts";

test("scope router resolves exact keys and registered aliases without semantic guessing", () => {
  assert.equal(resolveRegisteredScope("global-working-memory").resolution_method, "EXACT_SCOPE_KEY");
  assert.deepEqual(resolveRegisteredScope("AI_MEMORY_OS"), {
    requested_scope: "AI_MEMORY_OS",
    normalized_request: "ai_memory_os",
    resolved_scope_key: "global-working-memory",
    resolution_method: "REGISTERED_ALIAS",
  });
  assert.throws(
    () => resolveRegisteredScope("probably the global project"),
    (error: unknown) => error instanceof ScopeResolutionError && error.code === "SCOPE_NOT_REGISTERED",
  );
});

test("repository retrieval capability schema fingerprint is current", async () => {
  assert.equal(
    await capabilitySchemaFingerprint(repositoryContextRetrievalCapability),
    repositoryContextRetrievalCapability.expected_schema_fingerprint,
  );
});

test("repository source projects facts from the live capability registry", () => {
  const retrieval = retrieveRepositoryContext(
    "global-working-memory",
    "repository context retrieval capability",
  );
  const liveDefinition = retrieval.included.find((record) => (
    record.resource_id === "repo:capability:cap:repository-context-retrieval"
  ));
  assert.ok(liveDefinition);
  assert.match(liveDefinition.content, /cap:repository-context-retrieval v1\.0\.0 is ACTIVE/);
  assert.equal(liveDefinition.source_ref, "server/capabilities/registry.ts");
});

test("vertical slice executes request through receipt with measured evidence", async () => {
  let clockIndex = 0;
  const timerValues = [0, 1, 1, 2, 2, 5, 5, 6, 6, 7, 8];
  const runtime = new VerticalSliceRuntime(
    () => `2026-08-08T00:00:${String(clockIndex++).padStart(2, "0")}.000Z`,
    () => timerValues.shift() ?? 8,
  );
  const trace = await runtime.execute({
    request_text: "Show runtime capability discovery and context packet governance",
    requested_scope: "AI_MEMORY_OS",
  });

  assert.equal(trace.status, "COMPLETED");
  assert.equal(trace.resolved_scope_key, "global-working-memory");
  assert.equal(trace.capability_id, "cap:repository-context-retrieval");
  assert.ok(trace.packet);
  assert.ok(trace.packet.source_count >= 1);
  assert.ok(trace.packet.packet_bytes > 0);
  assert.ok(trace.packet.token_estimate > 0);
  assert.equal(trace.receipt?.outcome, "COMPLETED");
  assert.equal(trace.receipt?.stage_timings.length, 5);
  assert.equal(trace.receipt?.retrieved_sources, trace.packet.source_count);
  assert.equal(trace.events.at(-1)?.event_type, "performance.receipt.created");
});

test("vertical slice preserves resolved sibling scope but fails closed without adapter", async () => {
  const runtime = new VerticalSliceRuntime();
  const trace = await runtime.execute({ request_text: "Find a vocal workflow", requested_scope: "music-system" });
  assert.equal(trace.resolved_scope_key, "udio-algorithms");
  assert.equal(trace.status, "FAILED");
  assert.equal(trace.error?.code, "SOURCE_ADAPTER_UNAVAILABLE");
  assert.equal(trace.receipt?.outcome, "FAILED");
});

test("vertical slice records a no-match receipt for unregistered scope", async () => {
  const runtime = new VerticalSliceRuntime();
  const trace = await runtime.execute({ request_text: "Find a project", requested_scope: "invented-scope" });
  assert.equal(trace.status, "FAILED");
  assert.equal(trace.error?.code, "SCOPE_NOT_REGISTERED");
  assert.equal(trace.receipt?.outcome, "NO_MATCH");
});
