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
  createValidationReport,
  executionRevision,
  compiler = compileSpatialAsset,
  clock = () => new Date(),
}) {
  validateDispatch(dispatch);
  validateValidationProfile(validationProfile);
  assertExecutionRevision(executionRevision);
  assertProcessLocalBoundary(dispatch);

  const startedAt = trustedDate(clock(), 'INVALID_TRUSTED_CLOCK');
  assertCurrentAuthorization(dispatch.authorization, startedAt);

  if (dispatch.validation_profile_id !== validationProfile.profile_id) {
    throw new SpatialOrchestrationError('VALIDATION_PROFILE_MISMATCH', 'Dispatch and validation profile IDs must match.');
  }
  if (typeof createValidationReport !== 'function') {
    throw new SpatialOrchestrationError('REPORT_FACTORY_REQUIRED', 'A deterministic validation-report factory is required.');
  }

  const preparedBlueprint = prepareSpatialInput(blueprint);
  const normalizedInput = normalizeBlueprint(preparedBlueprint);
  const observedBlueprintDigest = `sha256:${normalizedInput.digest}`;
  if (observedBlueprintDigest !== dispatch.candidate_package.blueprint_digest) {
    throw new SpatialOrchestrationError(
      'BLUEPRINT_DIGEST_MISMATCH',
      `Dispatch declares ${dispatch.candidate_package.blueprint_digest}, observed ${observedBlueprintDigest}.`,
    );
  }

  const compiled = await compiler(blueprint, { generatedAt: startedAt.toISOString() });
  if (compiled?.normalizedBlueprint?.digest !== normalizedInput.digest) {
    throw new SpatialOrchestrationError(
      'COMPILER_BLUEPRINT_DIGEST_MISMATCH',
      'Compiler normalized blueprint digest does not match the independently prepared input digest.',
    );
  }

  const validationReport = await createValidationReport({
    dispatch,
    validationProfile,
    blueprint,
    compiled,
  });
  validateValidationReport(validationReport);
  assertReportBinding(dispatch, validationProfile, validationReport);
  assertCompilerObservations(compiled, normalizedInput, validationReport);

  if (validationReport.acceptance.state !== 'PENDING') {
    throw new SpatialOrchestrationError('ORCHESTRATOR_CANNOT_ACCEPT', 'Process-local orchestration cannot assign candidate acceptance.');
  }

  let derivedValidation;
  try {
    derivedValidation = assertDerivedValidation(validationProfile, validationReport);
  } catch (error) {
    throw new SpatialOrchestrationError('DERIVED_VALIDATION_MISMATCH', error instanceof Error ? error.message : String(error));
  }

  const completedAt = trustedDate(clock(), 'INVALID_COMPLETION_CLOCK');
  if (completedAt.getTime() < startedAt.getTime()) {
    throw new SpatialOrchestrationError('CLOCK_MOVED_BACKWARDS', 'Completion time cannot precede start time.');
  }

  const receipt = buildReceipt({
    dispatch,
    compiled,
    validationReport,
    executionRevision,
    observedBlueprintDigest,
    startedAt,
    completedAt,
  });
  validateReceipt(receipt);

  return Object.freeze({
    compiled,
    validationReport: Object.freeze(validationReport),
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

function assertCompilerObservations(compiled, normalizedInput, validationReport) {
  if (!compiled?.scene) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Compiler result must include its process-local scene for independent observation.');
  }

  const projection = projectScene(compiled.scene, normalizedInput.blueprint.asset.id);
  const observedComponents = projection.nodes.filter((node) => node.geometry !== null);
  const reportedComponents = new Map(validationReport.components.map((component) => [component.component_id, component]));

  if (reportedComponents.size !== validationReport.components.length ||
      observedComponents.length !== validationReport.components.length) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATION_MISMATCH', 'Reported component set does not match compiler-observed mesh components.');
  }

  for (const observed of observedComponents) {
    const reported = reportedComponents.get(observed.id);
    if (!reported) {
      throw new SpatialOrchestrationError('COMPILER_OBSERVATION_MISMATCH', `Missing report component for compiler-observed ${observed.id}.`);
    }

    const observedFaces = observed.geometry.indexCount > 0
      ? observed.geometry.indexCount / 3
      : observed.geometry.positionCount / 3;
    const observedDimensions = observed.geometry.bounds.max.map(
      (maximum, index) => maximum - observed.geometry.bounds.min[index],
    );

    if (!Number.isInteger(observedFaces) ||
        reported.vertex_count !== observed.geometry.positionCount ||
        reported.face_count !== observedFaces ||
        !vectorsClose(reported.dimensions, observedDimensions)) {
      throw new SpatialOrchestrationError(
        'COMPILER_OBSERVATION_MISMATCH',
        `Geometry observations for ${observed.id} do not match the compiler scene projection.`,
      );
    }
  }

  if (!Array.isArray(compiled.validation) || !Array.isArray(compiled.roundTrip)) {
    throw new SpatialOrchestrationError('COMPILER_OBSERVATIONS_REQUIRED', 'Compiler result must include validation and round-trip evidence.');
  }

  const observedExport = compiled.validation.every((entry) => entry.errorCount === 0) ? 'PASS' : 'FAIL';
  const observedReimport = compiled.roundTrip.every((entry) => entry.equal === true) ? 'PASS' : 'FAIL';
  const observedStructuralMatch = compiled.roundTrip.every((entry) => entry.equal === true);

  if (validationReport.export_reimport.export_result !== observedExport ||
      validationReport.export_reimport.reimport_result !== observedReimport ||
      (validationReport.export_reimport.structural_digest_match !== undefined &&
        validationReport.export_reimport.structural_digest_match !== observedStructuralMatch)) {
    throw new SpatialOrchestrationError(
      'COMPILER_OBSERVATION_MISMATCH',
      'Reported export/reimport evidence does not match compiler validation and round-trip observations.',
    );
  }
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

function buildReceipt({
  dispatch,
  compiled,
  validationReport,
  executionRevision,
  observedBlueprintDigest,
  startedAt,
  completedAt,
}) {
  const outputDigest = digestJson({
    compiler_receipt: compiled.receipt,
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
      'EXECUTION_REVISION_SEPARATE_FROM_FIXTURE_SUBJECT',
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

function digestJson(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}
