import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { PlaneGeometry } from 'three';
import { canonicalJson, normalizeBlueprint } from '../src/core.mjs';
import { prepareSpatialInput } from '../src/index.mjs';
import { buildScene } from '../src/three-adapter.mjs';
import {
  runProcessLocalSpatialOrchestration,
  SpatialOrchestrationError,
} from '../src/process-local-orchestrator.mjs';

const BASE_SHA = '224f10592485a523bd85911837b0925fac48b430';
const EXECUTION_SHA = 'c'.repeat(40);
const SOURCE_DIGEST = `sha256:${'d'.repeat(64)}`;

const blueprint = {
  contract: 'SpatialAssetBlueprint/0.1',
  asset: {
    id: 'fixture.process-local-box',
    name: 'Process Local Box',
    revision: '1',
  },
  coordinateSystem: {
    units: 'm',
    upAxis: 'Y',
    forwardAxis: '-Z',
    handedness: 'right',
  },
  materials: [{
    id: 'material.process-local',
    name: 'Process Local Material',
    baseColor: '#2f6b88',
    metalness: 0.25,
    roughness: 0.6,
    emissive: '#000000',
    opacity: 1,
    alphaMode: 'OPAQUE',
    alphaCutoff: 0.5,
    doubleSided: false,
    extras: {},
  }],
  nodes: [{
    id: 'component-box',
    name: 'Component Box',
    type: 'box',
    parentId: null,
    transform: {
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    geometry: {
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1,
    },
    materialId: 'material.process-local',
    extras: {},
  }],
  extras: {},
};

const BLUEPRINT_DIGEST = `sha256:${normalizeBlueprint(prepareSpatialInput(blueprint)).digest}`;

const validationProfile = {
  contract: 'SpatialValidationProfile/0.1',
  profile_id: 'profile-process-local',
  version: '0.1',
  applies_to: {
    roles: ['PROP'],
    representations: ['PROCEDURAL_MESH_SOURCE'],
  },
  geometry_rules: {
    units: 'm',
    coordinate_system: 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD',
    max_vertices: 1000,
    max_faces: 1000,
    max_components: 10,
    watertight_requirement: 'NOT_REQUIRED',
    require_reimport: true,
  },
  material_rules: {
    uv_requirement: 'NOT_REQUIRED',
    allowed_channels: ['BASE_COLOR'],
  },
  rig_rules: {
    requirement: 'NOT_REQUIRED',
    max_influences: 4,
  },
  human_review: {
    required: false,
    reason_codes: [],
  },
  rights_rules: {
    accepted_states: ['SYNTHETIC_FIXTURE'],
  },
};

const executionRevision = {
  commit_sha: EXECUTION_SHA,
  github_run_id: 93,
  run_attempt: 1,
};

function makeDispatch(mutator = null) {
  const value = {
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
      base_sha: BASE_SHA,
      working_branch: 'agent/saf-n3d-0a-process-local',
    },
    candidate_package: {
      candidate_id: 'candidate-process-local',
      global_role: 'PROP',
      representation_family: 'PROCEDURAL_MESH_SOURCE',
      generation_method: 'MOCK_FIXTURE',
      blueprint_digest: BLUEPRINT_DIGEST,
      subtype_extensions: {},
    },
    sources: [{
      source_type: 'REPOSITORY_FIXTURE',
      logical_uri: 'repo://fixtures/process-local.json',
      temporary_fetch_url: null,
      fetch_url_expires_at: null,
      digest: SOURCE_DIGEST,
      provenance_envelope_id: 'prov-process-local',
    }],
    authorization: {
      authorization_ref: 'auth-process-local',
      issued_at: '2026-08-01T20:00:00.000Z',
      expires_at: '2027-08-02T20:00:00.000Z',
      issued_for_execution_id: 'exec-process-local',
      scope_key: 'global-working-memory',
      repository_full_name: 'neohack2023/-AI-Knowledge-System',
      base_sha: BASE_SHA,
      allowed_effects: ['READ_SOURCE', 'EXECUTE_BUILD', 'EMIT_RECEIPT'],
      forbidden_effects: [
        'MUTATE_NOTION',
        'WRITE_GOOGLE_DRIVE',
        'REGISTER_ASSET',
        'PROMOTE_CANON',
        'MERGE_DEFAULT_BRANCH',
        'INVOKE_NEURAL_PROVIDER',
        'SEND_CALLBACK',
      ],
      authorization_digest: SOURCE_DIGEST,
    },
  };
  if (mutator) mutator(value);
  sealAuthorization(value.authorization);
  return value;
}

function sealAuthorization(authorization) {
  const { authorization_digest: ignored, ...unsigned } = authorization;
  authorization.authorization_digest = sha256Digest(unsigned);
}

function reportFor(dispatch, overrides = {}) {
  const base = {
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
      bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      dimensions: [1, 1, 1],
      vertex_count: 24,
      face_count: 12,
      connected_components: 1,
      degenerate_faces: 0,
      zero_area_faces: 0,
      non_manifold_edges: 0,
      flipped_normals: 0,
      self_intersections: null,
      watertight_requirement: 'NOT_REQUIRED',
      watertight_observed: true,
      watertight_result: 'PASS',
    }],
    export_reimport: {
      export_result: 'PASS',
      reimport_result: 'PASS',
      structural_digest_match: true,
    },
    materials: {
      uv_present: true,
      uv_overlap_result: 'PASS',
      channels_present: ['BASE_COLOR'],
      translation_loss: [],
    },
    rig: {
      state: 'NOT_RUN',
    },
    rights: {
      state: 'SYNTHETIC_FIXTURE',
      distribution: 'TEST_ONLY',
    },
    technical_outcome: 'PASS',
    human_review: {
      requirement: 'NOT_REQUIRED',
      state: 'NOT_APPLICABLE',
    },
    acceptance: {
      state: 'PENDING',
      assigned_destination: 'CANDIDATE_ASSET_PACKAGE',
    },
  };
  return { ...base, ...overrides };
}

async function fakeCompiler(input) {
  const normalizedBlueprint = normalizeBlueprint(prepareSpatialInput(input));
  const { scene } = buildScene(normalizedBlueprint);
  return {
    normalizedBlueprint,
    scene,
    receipt: {
      contract: 'ThreeCompilerReceipt/0.1',
      status: 'PASS',
    },
    validation: [
      { format: 'gltf', errorCount: 0 },
      { format: 'glb', errorCount: 0 },
    ],
    roundTrip: [
      { format: 'gltf', equal: true },
      { format: 'glb', equal: true },
    ],
    outputs: {},
  };
}

function fixedClock() {
  const values = [
    new Date('2026-08-02T01:00:00.000Z'),
    new Date('2026-08-02T01:00:00.010Z'),
  ];
  return () => values.shift();
}

function run(overrides = {}) {
  const dispatch = overrides.dispatch ?? makeDispatch();
  return runProcessLocalSpatialOrchestration({
    dispatch,
    validationProfile,
    blueprint,
    compiler: fakeCompiler,
    validationReport: reportFor(dispatch),
    executionRevision,
    observeExecutionRevision: () => executionRevision,
    clock: fixedClock(),
    ...overrides,
  });
}

test('orchestrates compile, compiler-observation binding, derived validation, and receipt without granting authority', async () => {
  const dispatch = makeDispatch();
  const result = await run({ dispatch });

  assert.equal(result.receipt.status, 'COMPLETED');
  assert.equal(result.receipt.input_digest, BLUEPRINT_DIGEST);
  assert.equal(result.receipt.external_effect.effect_type, 'NONE');
  assert.equal(result.receipt.external_effect.performed, false);
  assert.equal(result.receipt.metadata.spatial_compute.storage_state, 'NOT_STAGED');
  assert.equal(result.receipt.metadata.spatial_compute.commit_sha, EXECUTION_SHA);
  assert.equal(result.receipt.metadata.spatial_compute.environment.fixture_subject_base_sha, BASE_SHA);
  assert.equal(result.validationReport.acceptance.state, 'PENDING');
  assert.equal(result.derivedValidation.technical_outcome, 'PASS');
  assert.ok(result.receipt.authority_decisions.includes('COMPILER_OBSERVATIONS_BOUND'));
  assert.deepEqual(result.authority, {
    execution_scope: 'PROCESS_LOCAL',
    external_effect: 'NONE',
    storage_state: 'NOT_STAGED',
    acceptance_state: 'PENDING',
  });
});

test('rejects a mismatched blueprint digest before invoking the compiler', async () => {
  const dispatch = makeDispatch();
  dispatch.candidate_package.blueprint_digest = `sha256:${'e'.repeat(64)}`;
  let compilerCalls = 0;

  await assert.rejects(
    run({
      dispatch,
      compiler: async () => {
        compilerCalls += 1;
        return fakeCompiler(blueprint);
      },
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'BLUEPRINT_DIGEST_MISMATCH',
  );
  assert.equal(compilerCalls, 0);
});

test('rejects a compiler digest that differs from the independently prepared blueprint', async () => {
  await assert.rejects(
    run({
      compiler: async () => ({
        normalizedBlueprint: { digest: 'f'.repeat(64) },
        receipt: { contract: 'ThreeCompilerReceipt/0.1', status: 'PASS' },
      }),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'COMPILER_BLUEPRINT_DIGEST_MISMATCH',
  );
});

test('rejects expired authorization before invoking the compiler', async () => {
  const dispatch = makeDispatch((value) => {
    value.authorization.expires_at = '2026-08-02T00:59:59.000Z';
  });
  let compilerCalls = 0;

  await assert.rejects(
    run({
      dispatch,
      compiler: async () => {
        compilerCalls += 1;
        return fakeCompiler(blueprint);
      },
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'AUTHORIZATION_EXPIRED',
  );
  assert.equal(compilerCalls, 0);
});

test('rechecks authorization at completion before emitting a receipt', async () => {
  const dispatch = makeDispatch((value) => {
    value.authorization.expires_at = '2026-08-02T01:00:00.005Z';
  });
  const values = [
    new Date('2026-08-02T01:00:00.000Z'),
    new Date('2026-08-02T01:00:00.010Z'),
  ];

  await assert.rejects(
    run({ dispatch, clock: () => values.shift() }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'AUTHORIZATION_EXPIRED',
  );
});

test('rejects missing required effects and a tampered authorization digest', async () => {
  const missingEffect = makeDispatch((value) => {
    value.authorization.allowed_effects = ['READ_SOURCE', 'EMIT_RECEIPT'];
  });
  await assert.rejects(
    run({ dispatch: missingEffect }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'REQUIRED_EFFECT_NOT_AUTHORIZED',
  );

  const tampered = makeDispatch();
  tampered.authorization.authorization_digest = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(
    run({ dispatch: tampered }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'AUTHORIZATION_DIGEST_MISMATCH',
  );
});

test('rejects caller-reported geometry that differs from compiler observations', async () => {
  const dispatch = makeDispatch();
  const forgedReport = reportFor(dispatch, {
    components: [{
      ...reportFor(dispatch).components[0],
      vertex_count: 8,
    }],
  });

  await assert.rejects(
    run({
      dispatch,
      validationReport: forgedReport,
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'COMPILER_OBSERVATION_MISMATCH',
  );
});

test('snapshots declarative inputs before trusted compiler execution', async () => {
  const dispatch = makeDispatch();
  const originalExecutionId = dispatch.execution_id;
  const report = reportFor(dispatch);
  const suppliedProfile = structuredClone(validationProfile);
  const suppliedBlueprint = structuredClone(blueprint);
  const result = await run({
    dispatch,
    validationProfile: suppliedProfile,
    blueprint: suppliedBlueprint,
    validationReport: report,
    compiler: async (input) => {
      const compiled = await fakeCompiler(input);
      dispatch.execution_id = 'forged-execution';
      report.execution_id = 'forged-execution';
      suppliedProfile.geometry_rules.max_vertices = 1;
      suppliedBlueprint.asset.id = 'forged-blueprint';
      setTimeout(() => {
        compiled.validation.length = 0;
        compiled.scene.clear();
      }, 0);
      return compiled;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(result.receipt.execution_id, originalExecutionId);
  assert.equal(result.validationReport.execution_id, originalExecutionId);
  assert.equal(result.compiled.validation.length, 2);
  assert.equal(result.compiled.components.length, 1);
  assert.equal(Object.isFrozen(result.validationReport), true);
  assert.equal(Object.isFrozen(result.compiled.components[0]), true);
  assert.equal(result.receipt.metadata.spatial_compute.commit_sha, EXECUTION_SHA);
});

test('rejects incomplete, duplicate, or malformed compiler evidence', async () => {
  for (const compiler of [
    async (input) => ({ ...(await fakeCompiler(input)), validation: [] }),
    async (input) => ({
      ...(await fakeCompiler(input)),
      validation: [
        { format: 'gltf', errorCount: 0 },
        { format: 'gltf', errorCount: 0 },
      ],
    }),
    async (input) => ({
      ...(await fakeCompiler(input)),
      roundTrip: [
        { format: 'gltf', equal: true },
        { format: 'glb', equal: 'yes' },
      ],
    }),
  ]) {
    await assert.rejects(
      run({ compiler }),
      (error) => error instanceof SpatialOrchestrationError && error.code === 'INCOMPLETE_COMPILER_EVIDENCE',
    );
  }
});

test('requires and binds the reported structural match observation', async () => {
  const dispatch = makeDispatch();
  const report = reportFor(dispatch);
  delete report.export_reimport.structural_digest_match;

  await assert.rejects(
    run({ dispatch, validationReport: report }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'COMPILER_OBSERVATION_MISMATCH',
  );
});

test('derives watertightness from compiler geometry before profile evaluation', async () => {
  const dispatch = makeDispatch();
  const requiredProfile = structuredClone(validationProfile);
  requiredProfile.geometry_rules.watertight_requirement = 'REQUIRED';
  const forgedReport = reportFor(dispatch, {
    components: [{
      ...reportFor(dispatch).components[0],
      bounds: { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      dimensions: [1, 1, 0],
      vertex_count: 4,
      face_count: 2,
      watertight_requirement: 'REQUIRED',
      watertight_result: 'PASS',
    }],
  });

  await assert.rejects(
    run({
      dispatch,
      validationProfile: requiredProfile,
      compiler: async (input) => {
        const compiled = await fakeCompiler(input);
        compiled.scene.traverse((object) => {
          if (object.isMesh) object.geometry = new PlaneGeometry(1, 1, 1, 1);
        });
        return compiled;
      },
      validationReport: forgedReport,
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'COMPILER_OBSERVATION_MISMATCH',
  );
});

test('rejects a declared outcome that conflicts with the selected profile after observations are bound', async () => {
  const dispatch = makeDispatch();
  const restrictiveProfile = structuredClone(validationProfile);
  restrictiveProfile.geometry_rules.max_vertices = 20;

  await assert.rejects(
    run({
      dispatch,
      validationProfile: restrictiveProfile,
      validationReport: reportFor(dispatch),
    }),
    (error) => error instanceof SpatialOrchestrationError &&
      error.code === 'DERIVED_VALIDATION_MISMATCH' &&
      error.message.includes('TECHNICAL_OUTCOME_MISMATCH'),
  );
});

test('rejects a validation report for a different representation family', async () => {
  const dispatch = makeDispatch();
  await assert.rejects(
    run({
      dispatch,
      validationReport: reportFor(dispatch, {
        representation_family: 'MESH_ASSET_DRAFT',
      }),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'REPORT_BINDING_MISMATCH',
  );
});

test('rejects any attempt to self-accept the candidate', async () => {
  const dispatch = makeDispatch();
  await assert.rejects(
    run({
      dispatch,
      validationReport: reportFor(dispatch, {
        acceptance: {
          state: 'ACCEPTED_AS_CANDIDATE',
          assigned_destination: 'CANDIDATE_ASSET_PACKAGE',
        },
      }),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'ORCHESTRATOR_CANNOT_ACCEPT',
  );
});

test('rejects neural-provider or external-source dispatches', async () => {
  const neural = makeDispatch((value) => {
    value.mode = 'LIVE';
    value.execution_profile = 'NEURAL_PROVIDER';
  });
  await assert.rejects(
    run({ dispatch: neural }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'PROCESS_LOCAL_ONLY',
  );
});

test('requires the actual executing revision instead of copying the fixture subject SHA', async () => {
  await assert.rejects(
    run({ executionRevision: undefined }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'EXECUTION_REVISION_REQUIRED',
  );
});

test('rejects a declared execution revision that differs from the trusted runtime observation', async () => {
  await assert.rejects(
    run({
      observeExecutionRevision: () => ({
        ...executionRevision,
        commit_sha: 'e'.repeat(40),
      }),
    }),
    (error) => error instanceof SpatialOrchestrationError && error.code === 'EXECUTION_REVISION_MISMATCH',
  );
});

test('canonicalizes semantically identical report payloads before receipt hashing', async () => {
  const dispatch = makeDispatch();
  const normal = reportFor(dispatch);
  const reordered = reverseKeys(normal);

  const left = await run({
    dispatch,
    validationReport: normal,
  });
  const right = await run({
    dispatch,
    validationReport: reordered,
  });

  assert.equal(left.receipt.output_digest, right.receipt.output_digest);
});

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).reverse().map((key) => [key, reverseKeys(value[key])]),
    );
  }
  return value;
}

function sha256Digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
