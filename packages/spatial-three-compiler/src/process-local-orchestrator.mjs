import { createHash } from 'node:crypto';
import { validateDispatch } from '../../../scripts/saf-n3d-0a/dispatch-contract.mjs';
import { assertDerivedValidation } from '../../../scripts/saf-n3d-0a/evaluate-validation.mjs';
import { validateReceipt } from '../../../scripts/saf-n3d-0a/receipt-contract.mjs';
import {
  validateValidationProfile,
  validateValidationReport,
} from '../../../scripts/saf-n3d-0a/validation-contract.mjs';
import { canonicalJson, normalizeBlueprint } from './core.mjs';
import { compileSpatialAsset, prepareSpatialInput } from './index.mjs';
import { projectScene } from './three-adapter.mjs';

const REQUIRED_ALLOWED_EFFECTS = new Set([
  'READ_SOURCE',
  'EXECUTE_BUILD',
  'EMIT_RECEIPT',
]);

const FORBIDDEN_EFFECTS = new Set([
  'MUTATE_NOTION',
  'WRITE_GOOGLE_DRIVE',
  'REGISTER_ASSET',
  'PROMOTE_CANON',
  'MERGE_DEFAULT_BRANCH',
  'INVOKE_NEURAL_PROVIDER',
  'SEND_CALLBACK',
]);

export class SpatialOrchestrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SpatialOrchestrationError';
    this.code = code;
  }
}

export async function runProcessLocalSpatialOrchestration({
  dispatch,
  validationProfile,
  blueprint,
  validationReport,
  compiler = compileSpatialAsset,
  clock = () => new Date(),
}) {
  const trustedDispatch = immutableSnapshot(dispatch);
  const trustedValidationProfile = immutableSnapshot(validationProfile);
  const trustedBlueprint = immutableSnapshot(blueprint);
  const trustedValidationReport = immutableSnapshot(validationReport);

  validateDispatch(trustedDispatch);
  validateValidationProfile(trustedValidationProfile);
  assertProcessLocalBoundary(trustedDispatch);
  const observedExecutionRevision = observeRuntimeExecutionRevision();

  const startedAt = trustedDate(clock(), 'INVALID_TRUSTED_CLOCK');
  assertCurrentAuthorization(trustedDispatch.authorization, startedAt);

  if (trustedDispatch.validation_profile_id !== trustedValidationProfile.profile_id) {
    throw new SpatialOrchestrationError('VALIDATION_PROFILE_MISMATCH', 'Dispatch and validation profile IDs must match.');
  }
  const preparedBlueprint = prepareSpatialInput(trustedBlueprint);
  const normalizedInput = normalizeBlueprint(preparedBlueprint);
  const observedBlueprintDigest = `sha256:${normalizedInput.digest}`;
  if (observedBlueprintDigest !== trustedDispatch.candidate_package.blueprint_digest) {
    throw new SpatialOrchestrationError(
      'BLUEPRINT_DIGEST_MISMATCH',
      `Dispatch declares ${trustedDispatch.candidate_package.blueprint_digest}, observed ${observedBlueprintDigest}.`,
    );
  }

  const compiled = await compiler(structuredClone(trustedBlueprint), { generatedAt: startedAt.toISOString() });
  if (compiled?.normalizedBlueprint?.digest !== normalizedInput.digest) {
    throw new SpatialOrchestrationError(
      'COMPILER_BLUEPRINT_DIGEST_MISMATCH',
      'Compiler normalized blueprint digest does not match the independently prepared input digest.',
    );
  }

  const compilerEvidence = captureCompilerEvidence(compiled, normalizedInput);
  validateValidationReport(trustedValidationReport);
  assertReportBinding(trustedDispatch, trustedValidationProfile, trustedValidationReport);
  assertCompilerObservations(compilerEvidence, trustedValidationReport);

  if (trustedValidationReport.acceptance.state !== 'PENDING') {
    throw new SpatialOrchestrationError('ORCHESTRATOR_CANNOT_ACCEPT', 'Process-local orchestration cannot assign candidate acceptance.');
  }

  let derivedValidation;
  try {
    derivedValidation = assertDerivedValidation(trustedValidationProfile, trustedValidationReport);
  } catch (error) {
    throw new SpatialOrchestrationError('DERIVED_VALIDATION_MISMATCH', error instanceof Error ? error.message : String(error));
  }

  const completedAt = trustedDate(clock(), 'INVALID_COMPLETION_CLOCK');
  if (completedAt.getTime() < startedAt.getTime()) {
    throw new SpatialOrchestrationError('CLOCK_MOVED_BACKWARDS', 'Completion time cannot precede start time.');
  }
  assertCurrentAuthorization(trustedDispatch.authorization, completedAt);

  const receipt = buildReceipt({
    dispatch: trustedDispatch,
    compilerEvidence,
    validationReport: trustedValidationReport,
    executionRevision: observedExecutionRevision,
    observedBlueprintDigest,
    startedAt,
    completedAt,
  });
  validateReceipt(receipt);

  return Object.freeze({
    compiled: compilerEvidence.publicProjection,
    validationReport: trustedValidationReport,
    derivedValidation: Object.freeze(derivedValidation),
    receipt: Object.freeze(receipt),
    authority: Object.freeze({
      execution_scope: 'PROCESS_LOCAL',
      external_effect: 'NONE',
      storage_state: 'NOT_STAGED',
      acceptance_state: 'PENDING',
    }),
  });
}

export function computeAuthorizationDigest(authorization) {
  const { authorization_digest: ignored, ...unsignedAuthorization } = authorization;
  return digestJson(unsignedAuthorization);
}

function assertProcessLocalBoundary(dispatch) {
  if (dispatch.mode !== 'SIMULATION' || dispatch.execution_profile !== 'MOCK_FIXTURE') {
    throw new SpatialOrchestrationError('PROCESS_LOCAL_ONLY', 'This adapter accepts SIMULATION / MOCK_FIXTURE dispatches only.');
  }
  if (dispatch.sources.some((source) => source.source_type !== 'REPOSITORY_FIXTURE')) {
    throw new SpatialOrchestrationError('REPOSITORY_FIXTURE_ONLY', 'This adapter cannot read Drive or transient external sources.');
  }
  for (const effect of FORBIDDEN_EFFECTS) {
    if (!dispatch.authorization.forbidden_effects.includes(effect)) {
      throw new SpatialOrchestrationError('MISSING_FORBIDDEN_EFFECT', `Dispatch must forbid ${effect}.`);
    }
  }
}

function assertCurrentAuthorization(authorization, trustedNow) {
  if (computeAuthorizationDigest(authorization) !== authorization.authorization_digest) {
    throw new SpatialOrchestrationError('AUTHORIZATION_DIGEST_MISMATCH', 'Authorization digest does not match its canonical unsigned payload.');
  }

  const issuedAt = Date.parse(authorization.issued_at);
  const expiresAt = Date.parse(authorization.expires_at);
  const now = trustedNow.getTime();
  if (now < issuedAt) {
    throw new SpatialOrchestrationError('AUTHORIZATION_NOT_YET_VALID', 'Authorization is not valid yet.');
  }
  if (now >= expiresAt) {
    throw new SpatialOrchestrationError('AUTHORIZATION_EXPIRED', 'Authorization has expired.');
  }

  for (const effect of REQUIRED_ALLOWED_EFFECTS) {
    if (!authorization.allowed_effects.includes(effect)) {
      throw new SpatialOrchestrationError('REQUIRED_EFFECT_NOT_AUTHORIZED', `Authorization must allow ${effect}.`);
    }
  }
}

function assertReportBinding(dispatch, validationProfile, validationReport) {
  if (validationReport.execution_id !== dispatch.execution_id ||
      validationReport.candidate_id !== dispatch.candidate_package.candidate_id ||
      validationReport.validation_profile_id !== validationProfile.profile_id ||
      validationReport.representation_family !== dispatch.candidate_package.representation_family) {
    throw new SpatialOrchestrationError('REPORT_BINDING_MISMATCH', 'Validation report is not bound to the dispatch, representation, and selected profile.');
  }
}

function captureCompilerEvidence(compiled, normalizedInput) {
  if (!compiled?.scene) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Compiler result must include its process-local scene for independent observation.');
  }

  const projection = projectScene(compiled.scene, normalizedInput.blueprint.asset.id);
  const observedComponents = projection.nodes.filter((node) => node.geometry !== null);
  const topologyByComponent = observeMeshTopology(compiled.scene);
  const validation = requireCompleteFormatEvidence(compiled.validation, 'validation');
  const roundTrip = requireCompleteFormatEvidence(compiled.roundTrip, 'roundTrip');

  const components = observedComponents.map((observed) => {
    const observedFaces = observed.geometry.indexCount > 0
      ? observed.geometry.indexCount / 3
      : observed.geometry.positionCount / 3;
    if (!Number.isInteger(observedFaces)) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', `Compiler geometry for ${observed.id} is not a complete triangle mesh.`);
    }
    const topology = topologyByComponent.get(observed.id);
    if (!topology) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', `Missing topology evidence for compiler-observed ${observed.id}.`);
    }
    return {
      component_id: observed.id,
      vertex_count: observed.geometry.positionCount,
      face_count: observedFaces,
      bounds: observed.geometry.bounds,
      dimensions: observed.geometry.bounds.max.map(
        (maximum, index) => maximum - observed.geometry.bounds.min[index],
      ),
      ...topology,
    };
  });

  const observedExport = validation.every((entry) => entry.errorCount === 0) ? 'PASS' : 'FAIL';
  const observedReimport = roundTrip.every((entry) => entry.equal === true) ? 'PASS' : 'FAIL';
  const observedStructuralMatch = roundTrip.every((entry) => entry.equal === true);
  const receipt = immutableSnapshot(compiled.receipt);
  const evidence = {
    normalized_blueprint_digest: normalizedInput.digest,
    scene_projection: projection,
    components,
    validation,
    round_trip: roundTrip,
    export_result: observedExport,
    reimport_result: observedReimport,
    structural_digest_match: observedStructuralMatch,
    compiler_receipt: receipt,
  };
  return Object.freeze({
    ...evidence,
    publicProjection: immutableSnapshot(evidence),
  });
}

function assertCompilerObservations(compilerEvidence, validationReport) {
  const observedComponents = compilerEvidence.components;
  const reportedComponents = new Map(validationReport.components.map((component) => [component.component_id, component]));

  if (reportedComponents.size !== validationReport.components.length ||
      observedComponents.length !== validationReport.components.length) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATION_MISMATCH', 'Reported component set does not match compiler-observed mesh components.');
  }

  for (const observed of observedComponents) {
    const reported = reportedComponents.get(observed.component_id);
    if (!reported) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATION_MISMATCH', `Missing report component for compiler-observed ${observed.component_id}.`);
    }

    const expectedWatertightResult = observed.watertight ? 'PASS' : 'FAIL';
    if (reported.vertex_count !== observed.vertex_count ||
        reported.face_count !== observed.face_count ||
        !vectorsClose(reported.bounds.min, observed.bounds.min) ||
        !vectorsClose(reported.bounds.max, observed.bounds.max) ||
        !vectorsClose(reported.dimensions, observed.dimensions) ||
        reported.connected_components !== observed.connected_components ||
        reported.degenerate_faces !== observed.degenerate_faces ||
        reported.zero_area_faces !== observed.zero_area_faces ||
        reported.non_manifold_edges !== observed.non_manifold_edges ||
        reported.flipped_normals !== observed.flipped_normals ||
        reported.watertight_observed !== true ||
        reported.watertight_result !== expectedWatertightResult) {
      throw new SpatialOrchestrationError(
        'COMPILER_OBSERVATION_MISMATCH',
        `Geometry and topology observations for ${observed.component_id} do not match the compiler scene.`,
      );
    }
  }

  if (typeof validationReport.export_reimport.structural_digest_match !== 'boolean' ||
      validationReport.export_reimport.export_result !== compilerEvidence.export_result ||
      validationReport.export_reimport.reimport_result !== compilerEvidence.reimport_result ||
      validationReport.export_reimport.structural_digest_match !== compilerEvidence.structural_digest_match) {
    throw new SpatialOrchestrationError(
      'COMPILER_OBSERVATION_MISMATCH',
      'Reported export/reimport evidence does not match compiler validation and round-trip observations.',
    );
  }
}

function requireCompleteFormatEvidence(entries, kind) {
  if (!Array.isArray(entries)) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', `Compiler result must include ${kind} evidence.`);
  }
  const expectedFormats = new Set(['gltf', 'glb']);
  const observed = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !expectedFormats.has(entry.format) || observed.has(entry.format)) {
      throw new SpatialOrchestrationError('INCOMPLETE_COMPILER_EVIDENCE', `${kind} evidence must contain unique gltf and glb records only.`);
    }
    if (kind === 'validation' && (!Number.isInteger(entry.errorCount) || entry.errorCount < 0)) {
      throw new SpatialOrchestrationError('INCOMPLETE_COMPILER_EVIDENCE', 'Validation evidence must include a non-negative integer errorCount.');
    }
    if (kind === 'roundTrip' && typeof entry.equal !== 'boolean') {
      throw new SpatialOrchestrationError('INCOMPLETE_COMPILER_EVIDENCE', 'Round-trip evidence must include a boolean equal observation.');
    }
    observed.set(entry.format, immutableSnapshot(entry));
  }
  if (observed.size !== expectedFormats.size) {
    throw new SpatialOrchestrationError('INCOMPLETE_COMPILER_EVIDENCE', `${kind} evidence must include both gltf and glb records.`);
  }
  return [...observed.values()].sort((left, right) => left.format.localeCompare(right.format));
}

function observeMeshTopology(scene) {
  const observations = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    const componentId = object.userData?.aios?.componentId;
    if (!componentId || !object.isMesh) return;
    if (observations.has(componentId)) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', `Duplicate compiler mesh component ${componentId}.`);
    }
    observations.set(componentId, analyzeTriangleTopology(object.geometry));
  });
  return observations;
}

function analyzeTriangleTopology(geometry) {
  const positions = geometry?.getAttribute?.('position');
  if (!positions || positions.itemSize < 3) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Mesh geometry must expose three-dimensional positions.');
  }
  const rawIndices = geometry.getIndex();
  const indices = rawIndices
    ? Array.from({ length: rawIndices.count }, (_, index) => rawIndices.getX(index))
    : Array.from({ length: positions.count }, (_, index) => index);
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Mesh geometry must contain complete triangle evidence.');
  }

  const welded = new Map();
  const weldedIds = Array.from({ length: positions.count }, (_, index) => {
    const key = [positions.getX(index), positions.getY(index), positions.getZ(index)]
      .map((value) => Math.round(value * 1e9)).join(':');
    if (!welded.has(key)) welded.set(key, welded.size);
    return welded.get(key);
  });
  const parent = Array.from({ length: welded.size }, (_, index) => index);
  const edgeCounts = new Map();
  const normals = geometry.getAttribute('normal');
  let degenerateFaces = 0;
  let zeroAreaFaces = 0;
  let flippedNormals = 0;

  for (let offset = 0; offset < indices.length; offset += 3) {
    const original = [indices[offset], indices[offset + 1], indices[offset + 2]];
    if (original.some((index) => !Number.isInteger(index) || index < 0 || index >= positions.count)) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Mesh geometry contains an invalid position index.');
    }
    const triangle = original.map((index) => weldedIds[index]);
    if (new Set(triangle).size < 3) degenerateFaces += 1;
    union(parent, triangle[0], triangle[1]);
    union(parent, triangle[1], triangle[2]);
    for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }

    const a = [positions.getX(original[0]), positions.getY(original[0]), positions.getZ(original[0])];
    const b = [positions.getX(original[1]), positions.getY(original[1]), positions.getZ(original[1])];
    const c = [positions.getX(original[2]), positions.getY(original[2]), positions.getZ(original[2])];
    const cross = triangleCross(a, b, c);
    const magnitudeSquared = cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2;
    if (magnitudeSquared <= 1e-24) zeroAreaFaces += 1;
    if (normals && normals.itemSize >= 3) {
      const averageNormal = original.reduce((sum, index) => [
        sum[0] + normals.getX(index),
        sum[1] + normals.getY(index),
        sum[2] + normals.getZ(index),
      ], [0, 0, 0]);
      const alignment = cross[0] * averageNormal[0] + cross[1] * averageNormal[1] + cross[2] * averageNormal[2];
      if (alignment < -1e-12) flippedNormals += 1;
    }
  }

  const roots = new Set(weldedIds.map((index) => find(parent, index)));
  const nonManifoldEdges = [...edgeCounts.values()].filter((count) => count > 2).length;
  const watertight = degenerateFaces === 0 && zeroAreaFaces === 0 &&
    edgeCounts.size > 0 && [...edgeCounts.values()].every((count) => count === 2);
  return {
    connected_components: roots.size,
    degenerate_faces: degenerateFaces,
    zero_area_faces: zeroAreaFaces,
    non_manifold_edges: nonManifoldEdges,
    flipped_normals: flippedNormals,
    watertight,
  };
}

function triangleCross(a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

function find(parent, value) {
  let current = value;
  while (parent[current] !== current) {
    parent[current] = parent[parent[current]];
    current = parent[current];
  }
  return current;
}

function union(parent, left, right) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
}

function assertExecutionRevision(value) {
  if (!value || typeof value !== 'object') {
    throw new SpatialOrchestrationError('EXECUTION_REVISION_REQUIRED', 'Actual executing revision metadata is required.');
  }
  if (!/^[a-f0-9]{40}$/.test(value.commit_sha ?? '')) {
    throw new SpatialOrchestrationError('INVALID_EXECUTION_COMMIT_SHA', 'executionRevision.commit_sha must be a 40-character lowercase Git SHA.');
  }
  if (value.github_run_id !== null && value.github_run_id !== undefined &&
      (!Number.isInteger(value.github_run_id) || value.github_run_id < 0)) {
    throw new SpatialOrchestrationError('INVALID_GITHUB_RUN_ID', 'executionRevision.github_run_id must be null or a non-negative integer.');
  }
  if (!Number.isInteger(value.run_attempt) || value.run_attempt < 1) {
    throw new SpatialOrchestrationError('INVALID_RUN_ATTEMPT', 'executionRevision.run_attempt must be a positive integer.');
  }
}

function observeRuntimeExecutionRevision() {
  if (!process.env.GITHUB_SHA) {
    throw new SpatialOrchestrationError('EXECUTION_REVISION_REQUIRED', 'Trusted GITHUB_SHA runner metadata is required.');
  }
  const observed = immutableSnapshot({
    commit_sha: process.env.GITHUB_SHA,
    github_run_id: parseOptionalRuntimeInteger(process.env.GITHUB_RUN_ID, 'INVALID_GITHUB_RUN_ID'),
    run_attempt: parseRequiredRuntimeInteger(process.env.GITHUB_RUN_ATTEMPT, 'INVALID_RUN_ATTEMPT'),
  });
  assertExecutionRevision(observed);
  return observed;
}

function parseOptionalRuntimeInteger(value, code) {
  if (value === undefined || value === '') return null;
  return parseRequiredRuntimeInteger(value, code);
}

function parseRequiredRuntimeInteger(value, code) {
  if (!/^[0-9]+$/.test(value ?? '')) {
    throw new SpatialOrchestrationError(code, 'Runner/runtime revision metadata must be a non-negative integer string.');
  }
  return Number.parseInt(value, 10);
}

function buildReceipt({
  dispatch,
  compilerEvidence,
  validationReport,
  executionRevision,
  observedBlueprintDigest,
  startedAt,
  completedAt,
}) {
  const outputDigest = digestJson({
    compiler_receipt: compilerEvidence.compiler_receipt,
    validation_report: validationReport,
  });
  return {
    receipt_version: '0.1',
    receipt_id: `saf-orchestration-${dispatch.execution_id}`,
    execution_id: dispatch.execution_id,
    trace_id: dispatch.trace_id,
    span_id: dispatch.span_id,
    parent_span_id: null,
    scope_key: dispatch.scope_key,
    workflow_id: dispatch.workflow_id,
    operation_name: 'SAF process-local orchestration',
    operation_type: 'BENCHMARK',
    mode: 'SIMULATION',
    status: 'COMPLETED',
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
    source_refs: dispatch.sources.map((source) => source.logical_uri),
    authority_decisions: [
      'PROCESS_LOCAL_ONLY',
      'NO_EXTERNAL_EFFECT',
      'NO_DURABLE_STAGING',
      'ACCEPTANCE_REMAINS_PENDING',
      'COMPILER_OBSERVATIONS_BOUND',
      'DECLARATIVE_REPORT_INPUT_ONLY',
      'AUTHORIZATION_RECHECKED_BEFORE_RECEIPT',
      'EXECUTION_REVISION_SEPARATE_FROM_FIXTURE_SUBJECT',
      'EXECUTION_REVISION_INDEPENDENTLY_OBSERVED',
    ],
    provider: null,
    model: null,
    token_usage: null,
    external_effect: {
      effect_type: 'NONE',
      target_type: null,
      target_id: null,
      requested: false,
      authorized: false,
      performed: false,
      verified: true,
      authorization_ref: dispatch.authorization.authorization_ref,
      verification_ref: null,
    },
    input_digest: observedBlueprintDigest,
    output_digest: outputDigest,
    errors: [],
    supersedes_receipt_id: null,
    metadata: {
      schema_validation: 'PASS',
      canonicalization: 'AIOS_CANONICAL_JSON',
      availability_notes: [
        'Process-local orchestration only; no destination writes or provider execution.',
        'spatial_compute.commit_sha identifies executing code; environment.fixture_subject_base_sha identifies the fixture subject.',
      ],
      spatial_compute: {
        github_run_id: executionRevision.github_run_id ?? null,
        commit_sha: executionRevision.commit_sha,
        run_attempt: executionRevision.run_attempt,
        environment: {
          runtime: 'node',
          isolation: 'process-local',
          fixture_subject_repository: dispatch.repository.full_name,
          fixture_subject_base_sha: dispatch.repository.base_sha,
          fixture_subject_branch: dispatch.repository.working_branch,
        },
        emitted_local_artifacts: [],
        storage_state: 'NOT_STAGED',
      },
    },
  };
}

function vectorsClose(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((value, index) => Math.abs(value - right[index]) <= 1e-9);
}

function trustedDate(value, code) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new SpatialOrchestrationError(code, 'Trusted clock returned an invalid date.');
  }
  return date;
}

function immutableSnapshot(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

function digestJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
