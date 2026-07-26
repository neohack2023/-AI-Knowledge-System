import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCompiledCapabilityRegistry } from "../packages/capability-registry/compiled-provider.ts";
import { resolveScope } from "../packages/scope-router/index.ts";
import type { CompiledScopeRegistry } from "../packages/scope-router/types.ts";
import { compileRegistry } from "../scripts/registry/lib.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedNow = "2026-07-26T12:00:00.000Z";

const compiledFixture = async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "aios-scope-router-"));
  const result = await compileRegistry({ root: projectRoot, outDir, now: fixedNow });
  return {
    registry: result.compiled as CompiledScopeRegistry & { capabilities: Record<string, unknown>[] },
    cleanup: () => rm(outDir, { recursive: true, force: true }),
  };
};

test("compiler emits deterministic exact routing tables", async () => {
  const fixture = await compiledFixture();
  try {
    assert.equal(fixture.registry.routing_tables.exact_scope_keys["global-runtime"], "global-runtime");
    assert.equal(fixture.registry.routing_tables.exact_project_names["global runtime"], "global-runtime");
    assert.equal(fixture.registry.routing_tables.exact_aliases["core-runtime"], "global-runtime");
    assert.deepEqual(fixture.registry.routing_tables.children_by_parent, {});
  } finally {
    await fixture.cleanup();
  }
});

test("scope resolution follows exact key, project name, and alias precedence", async () => {
  const fixture = await compiledFixture();
  try {
    const byKey = resolveScope(fixture.registry, { requested_scope: " GLOBAL-RUNTIME ", now: fixedNow });
    assert.equal(byKey.resolution_state, "RESOLVED");
    assert.equal(byKey.resolution_method, "EXACT_SCOPE_KEY");
    assert.equal(byKey.resolved_scope_key, "global-runtime");

    const byProject = resolveScope(fixture.registry, { requested_scope: "Global   Runtime", now: fixedNow });
    assert.equal(byProject.resolution_method, "EXACT_PROJECT_NAME");
    assert.equal(byProject.resolved_scope_key, "global-runtime");

    const byAlias = resolveScope(fixture.registry, { requested_scope: "CORE-RUNTIME", now: fixedNow });
    assert.equal(byAlias.resolution_method, "REGISTERED_ALIAS");
    assert.equal(byAlias.resolved_scope_key, "global-runtime");
    assert.equal(byAlias.semantic_selection_used, false);
    assert.equal(byAlias.workflow_execution_authorized, false);
    assert.equal(byAlias.destination_write_authorized, false);
  } finally {
    await fixture.cleanup();
  }
});

test("parent-subproject resolution is explicit and continuity is caller-authorized", async () => {
  const fixture = await compiledFixture();
  try {
    const registry = structuredClone(fixture.registry);
    registry.scopes.push({
      schema_name: "ScopeDefinition",
      schema_version: "1.0",
      scope_key: "child-runtime",
      project_name: "Child Runtime",
      parent_scope_key: "global-runtime",
      status: "ACTIVE",
      health: { status: "VERIFIED", checked_at: fixedNow, expires_at: null },
    });
    registry.routing_tables.exact_scope_keys["child-runtime"] = "child-runtime";
    registry.routing_tables.children_by_parent["global-runtime"] = ["child-runtime"];

    const parentResolved = resolveScope(registry, {
      requested_scope: "Child Runtime",
      parent_scope_key: "global-runtime",
      now: fixedNow,
    });
    assert.equal(parentResolved.resolution_method, "EXPLICIT_PARENT_SUBPROJECT");
    assert.equal(parentResolved.resolved_scope_key, "child-runtime");

    const deniedContinuity = resolveScope(registry, {
      requested_scope: "continue this",
      continuity_scope_key: "global-runtime",
      continuity_authorized: false,
      now: fixedNow,
    });
    assert.equal(deniedContinuity.resolution_state, "NO_MATCH");
    assert.equal(deniedContinuity.resolved_scope_key, null);

    const allowedContinuity = resolveScope(registry, {
      requested_scope: "continue this",
      continuity_scope_key: "global-runtime",
      continuity_authorized: true,
      now: fixedNow,
    });
    assert.equal(allowedContinuity.resolution_method, "BOUNDED_CONTINUITY");
    assert.equal(allowedContinuity.resolved_scope_key, "global-runtime");
  } finally {
    await fixture.cleanup();
  }
});

test("blocked exact scopes fail closed instead of falling through", async () => {
  const fixture = await compiledFixture();
  try {
    const registry = structuredClone(fixture.registry);
    registry.scopes[0].status = "DEPRECATED";
    const result = resolveScope(registry, { requested_scope: "global-runtime", now: fixedNow });
    assert.equal(result.resolution_state, "NO_MATCH");
    assert.equal(result.resolution_method, "EXACT_SCOPE_KEY");
    assert.equal(result.durable_scope_selected, false);
    assert.deepEqual(result.candidates[0].reason_codes, ["SCOPE_STATUS_NOT_ACTIVE"]);
  } finally {
    await fixture.cleanup();
  }
});

test("compiled capability loader returns an immutable provider snapshot without authority", async () => {
  const fixture = await compiledFixture();
  try {
    const loaded = loadCompiledCapabilityRegistry(fixture.registry as any);
    assert.equal(loaded.registry_version, fixture.registry.registry_version);
    assert.equal(loaded.registry_fingerprint, fixture.registry.registry_fingerprint);
    assert.equal(loaded.execution_authority, "NONE");
    assert.equal(loaded.destination_write_authorized, false);

    const first = loaded.listDefinitions();
    assert.equal(first.length, 1);
    first[0].capability_id = "mutated";
    assert.equal(loaded.listDefinitions()[0].capability_id, "cap:internal-runtime-diagnostic");
  } finally {
    await fixture.cleanup();
  }
});

test("compiled capability loader rejects duplicate capability IDs", async () => {
  const fixture = await compiledFixture();
  try {
    const registry = structuredClone(fixture.registry);
    registry.capabilities.push(structuredClone(registry.capabilities[0]));
    assert.throws(
      () => loadCompiledCapabilityRegistry(registry as any),
      (error: unknown) => error instanceof Error && error.message.includes("appears more than once"),
    );
  } finally {
    await fixture.cleanup();
  }
});
