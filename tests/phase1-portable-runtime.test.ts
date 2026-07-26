import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GET as getCapabilities } from "../app/api/capabilities/route.ts";
import {
  GET as getScopeResolver,
  POST as resolveScopeRequest,
} from "../app/api/scopes/resolve/route.ts";
import { compiledPublicRegistry } from "../packages/runtime-composition/compiled-public-registry.ts";
import { portableAiosRuntime } from "../server/runtime/portable.ts";
import { compileRegistry } from "../scripts/registry/lib.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedNow = "2026-07-26T12:00:00.000Z";

test("checked-in runtime snapshot exactly matches deterministic compiler output", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "aios-runtime-registry-"));
  try {
    const result = await compileRegistry({ root: projectRoot, outDir, now: fixedNow });
    assert.deepEqual(compiledPublicRegistry, result.compiled);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("portable runtime binds scope resolution and capability discovery to one registry snapshot", async () => {
  const scope = portableAiosRuntime.resolveScope({
    requested_scope: "CORE-RUNTIME",
    now: fixedNow,
  });
  assert.equal(scope.resolution_state, "RESOLVED");
  assert.equal(scope.resolved_scope_key, "global-runtime");
  assert.equal(scope.registry_fingerprint, portableAiosRuntime.registry_fingerprint);
  assert.equal(scope.workflow_execution_authorized, false);

  const discovery = await portableAiosRuntime.capabilityDiscovery.discover({
    scope_key: scope.resolved_scope_key!,
    mode: "LIVE",
    intent_class: "runtime-diagnostic",
    authority_domains: ["server-runtime-execution-state"],
    now: () => fixedNow,
  });
  assert.equal(discovery.envelope.registry_version, portableAiosRuntime.registry_version);
  assert.equal(discovery.envelope.registry_fingerprint, portableAiosRuntime.registry_fingerprint);
  assert.equal(discovery.envelope.recommended_capability_id, "cap:internal-runtime-diagnostic");
  assert.equal(discovery.execution_authority, "NONE");

  portableAiosRuntime.capabilityDiscovery.select(
    discovery.envelope.discovery_id,
    "cap:internal-runtime-diagnostic",
  );
  const materialized = await portableAiosRuntime.capabilityDiscovery.materialize(
    discovery.envelope.discovery_id,
  );
  assert.equal(materialized.materialized_capability?.fingerprint_verified, true);
  assert.equal(materialized.materialized_capability?.execution_authorized, false);
  assert.equal(materialized.materialized_capability?.destination_write_authorized, false);
});

test("scope and capability HTTP surfaces expose the same compiled registry identity", async () => {
  const scopeMetadata = await (await getScopeResolver()).json() as Record<string, unknown>;
  const capabilityMetadata = await (
    await getCapabilities(new Request("https://example.test/api/capabilities"))
  ).json() as Record<string, unknown>;

  assert.equal(scopeMetadata.registry_version, portableAiosRuntime.registry_version);
  assert.equal(capabilityMetadata.registry_version, portableAiosRuntime.registry_version);
  assert.equal(scopeMetadata.registry_fingerprint, portableAiosRuntime.registry_fingerprint);
  assert.equal(capabilityMetadata.registry_fingerprint, portableAiosRuntime.registry_fingerprint);
  assert.equal(capabilityMetadata.registry_source, "COMPILED_PUBLIC_REGISTRY");
  assert.equal(capabilityMetadata.execution_authority, "NONE");

  const response = await resolveScopeRequest(new Request(
    "https://example.test/api/scopes/resolve",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requested_scope: "Global Runtime" }),
    },
  ));
  const resolved = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(resolved.resolution_state, "RESOLVED");
  assert.equal(resolved.resolved_scope_key, "global-runtime");
  assert.equal(resolved.workflow_execution_authorized, false);
  assert.equal(resolved.destination_write_authorized, false);
});
