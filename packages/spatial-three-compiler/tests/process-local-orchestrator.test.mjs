import assert from 'node:assert/strict';
import test from 'node:test';
import { runProcessLocalSpatialOrchestration, SpatialOrchestrationError } from '../src/process-local-orchestrator.mjs';

const HEX64 = `sha256:${'a'.repeat(64)}`;
const dispatch = {
  contract_version: 'SAF-N3D-Dispatch/0.1',
  workflow_version: '0.1',
  mode: 'SIMULATION',
  execution_profile: 'MOCK_FIXTURE',
  validation_profile_id: 'profile-process-local',
  scope_key: 'global-working-memory',
  execution_id: 'exec-process-local',
  trace_id: 'a'.repeat(32),
  span_id: 'b'.repeat(16),
  parent_execution_id: null,
  workflow_id: 'spatial-asset-foundry',
  repository: {
    full_name: 'neohack2023/-AI-Knowledge-System',
    base_sha: '224f10592485a523bd85911837b0925fac48b430',
    working_branch: 'agent/saf-n3d-0a-process-local',
  },
  candidate_package: {
    candidate_id: 'candidate-process-local',
    global_role: 'PROP',
    representation_family: 'PROCEDURAL_MESH_SOURCE',
    generation_method: 'MOCK_FIXTURE',
    blueprint_digest: HEX64,
    subtype_extensions: {},
  },
  sources: [{
    source_type: 'REPOSITORY_FIXTURE',
    logical_uri: 'repo://fixtures/process-local.json',
    temporary_fetch_url: null,
    fetch_url_expires_at: null,
    digest: HEX64,
    provenance_envelope_id: 'prov-process-local',
  }],
  authorization: {
    authorization_ref: 'auth-process-local',
    issued_at: '2026-08-01T20:00:00.000Z',
    expires_at: '2026-08-02T20:00:00.000Z',
    issued_for_execution_id: 'exec-process-local',
    scope_key: 'global-working-memory',
    repository_full_name: 'neohack2023/-AI-Knowledge-System',
    base_sha: '224f10592485a523bd85911837b0925fac48b430',
    allowed_effects: ['READ_SOURCE', 'EXECUTE_BUILD', 'EMIT_RECEIPT'],
    forbidden_effects: [
      'MUTATE_NOTION', 'WRITE_GOOGLE_DRIVE', 'REGISTER_ASSET', 'PROMOTE_CANON',
      'MERGE_DEFAULT_BRANCH', 'INVOKE_NEURAL_PROVIDER', 'SEND_CALLBACK',
    ],
    authorization_digest: HEX64,
  },
};

const validationProfile = {
  contract: 'SpatialValidationProfile/0.1',
  profile_id: 'profile-process-local',
  version: '0.1',
  applies_to: { roles: ['PROP'], representations: ['PROCEDURAL_MESH_SOURCE'] },
  geometry_rules: {
    units: 'm',
    coordinate_system: 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD',
    max_vertices: 1000,
    max_faces: 1000,
    max_components: 10,
    watertight_requirement: 'NOT_REQUIRED',
    require_reimport: true,
  },
  material_rules: {},
  rig_rules: {},
  human_review: {},
  rights_rules: {},
};

function report(overrides = {}) {
  return {
    contract: 'SpatialValidationReport/0.1',
    execution_id: dispatch.execution_id,
    candidate_id: dispatch.candidate_package.candidate_id,
    representation_family: dispatch.candidate_package.representation_family,
    validation_profile_id: validationProfile.profile_id,
    components: [{
      component_id: 'component-box',
      role: 'PROP',
      topology_family: 'TRIANGLE_MESH',
      units: 'm',
      coordinate_system: 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD',
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
      dimensions: [1, 1, 1],
      vertex_count: 8,
      face_count: 12,
      connected_components: 1,
      degenerate_faces: 0,
      zero_area_faces: 0,
      non_manifold_edges: 0,
      flipped_normals: 0,
      self_intersections: null,
      watertight_requirement: 'NOT_REQUIRED',
      watertight_observed: true,
      watertight_result: 'NOT_APPLICABLE',
    }],
    export_reimport: { export_result: 'PASS', reimport_result: 'PASS' },
    materials: {},
    rig: {},
    rights: {},
    technical_outcome: 'PASS',
    human_review: { requirement: 'NOT_REQUIRED', state: 'NOT_APPLICABLE' },
    acceptance: { state: 'PENDING', assigned_destination: 'CANDIDATE_ASSET_PACKAGE' },
    ...overrides,
  };
}

const fakeCompiler = async () => ({
  receipt: { contract: 'ThreeCompilerReceipt/0.1', status: 'PASS' },
  outputs: {},
});

const fixedClock = (() => {
  const values = [new Date('2026-08-02T01:00:00.000Z'), new Date('2026-08-02T01:00:00.010Z')];
  return () => values.shift();
})();

test('orchestrates compile, report, and receipt without granting authority', async () => {
  const result = await runProcessLocalSpatialOrchestration({
    dispatch,
    validationProfile,
    blueprint: {},
    compiler: fakeCompiler,
    createValidationReport: () => report(),
    clock: fixedClock,
  });

  assert.equal(result.receipt.status, 'COMPLETED');
  assert.equal(result.receipt.external_effect.effect_type, 'NONE');
  assert.equal(result.receipt.external_effect.performed, false);
  assert.equal(result.receipt.metadata.spatial_compute.storage_state, 'NOT_STAGED');
  assert.equal(result.validationReport.acceptance.state, 'PENDING');
  assert.deepEqual(result.authority, {
    execution_scope: 'PROCESS_LOCAL',
    external_effect: 'NONE',
    storage_state: 'NOT_STAGED',
    acceptance_state: 'PENDING',
  });
});

test('rejects any attempt to self-accept the candidate', async () => {
  await assert.rejects(
    runProcessLocalSpatialOrchestration({
      dispatch,
      validationProfile,
      blueprint: {},
      compiler: fakeCompiler,
      createValidationReport: () => report({
        acceptance: { state: 'ACCEPTED_AS_CANDIDATE', assigned_destination: 'CANDIDATE_ASSET_PACKAGE' },
      }),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'ORCHESTRATOR_CANNOT_ACCEPT',
  );
});

test('rejects neural-provider or external-source dispatches', async () => {
  const neural = structuredClone(dispatch);
  neural.mode = 'LIVE';
  neural.execution_profile = 'NEURAL_PROVIDER';
  await assert.rejects(
    runProcessLocalSpatialOrchestration({
      dispatch: neural,
      validationProfile,
      blueprint: {},
      compiler: fakeCompiler,
      createValidationReport: () => report(),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'PROCESS_LOCAL_ONLY',
  );
});
