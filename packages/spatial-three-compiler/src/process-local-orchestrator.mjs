import { createHash } from 'node:crypto';
import { validateDispatch } from '../../../scripts/saf-n3d-0a/dispatch-contract.mjs';
import { validateReceipt } from '../../../scripts/saf-n3d-0a/receipt-contract.mjs';
import {
  validateValidationProfile,
  validateValidationReport,
} from '../../../scripts/saf-n3d-0a/validation-contract.mjs';
import { compileSpatialAsset } from './index.mjs';

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
  compiler = compileSpatialAsset,
  clock = () => new Date(),
}) {
  validateDispatch(dispatch);
  validateValidationProfile(validationProfile);
  assertProcessLocalBoundary(dispatch);

  if (dispatch.validation_profile_id !== validationProfile.profile_id) {
    throw new SpatialOrchestrationError('VALIDATION_PROFILE_MISMATCH', 'Dispatch and validation profile IDs must match.');
  }
  if (typeof createValidationReport !== 'function') {
    throw new SpatialOrchestrationError('REPORT_FACTORY_REQUIRED', 'A deterministic validation-report factory is required.');
  }

  const startedAt = clock();
  const compiled = await compiler(blueprint, { generatedAt: startedAt.toISOString() });
  const validationReport = await createValidationReport({ dispatch, validationProfile, blueprint, compiled });
  validateValidationReport(validationReport);

  if (validationReport.execution_id !== dispatch.execution_id ||
      validationReport.candidate_id !== dispatch.candidate_package.candidate_id ||
      validationReport.validation_profile_id !== validationProfile.profile_id) {
    throw new SpatialOrchestrationError('REPORT_BINDING_MISMATCH', 'Validation report is not bound to the dispatch and selected profile.');
  }
  if (validationReport.acceptance.state !== 'PENDING') {
    throw new SpatialOrchestrationError('ORCHESTRATOR_CANNOT_ACCEPT', 'Process-local orchestration cannot assign candidate acceptance.');
  }

  const completedAt = clock();
  const receipt = buildReceipt({ dispatch, compiled, validationReport, startedAt, completedAt });
  validateReceipt(receipt);

  return Object.freeze({
    compiled,
    validationReport: Object.freeze(validationReport),
    receipt: Object.freeze(receipt),
    authority: Object.freeze({
      execution_scope: 'PROCESS_LOCAL',
      external_effect: 'NONE',
      storage_state: 'NOT_STAGED',
      acceptance_state: 'PENDING',
    }),
  });
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

function buildReceipt({ dispatch, compiled, validationReport, startedAt, completedAt }) {
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
    duration_ms: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    source_refs: dispatch.sources.map((source) => source.logical_uri),
    authority_decisions: [
      'PROCESS_LOCAL_ONLY',
      'NO_EXTERNAL_EFFECT',
      'NO_DURABLE_STAGING',
      'ACCEPTANCE_REMAINS_PENDING',
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
    input_digest: dispatch.candidate_package.blueprint_digest,
    output_digest: `sha256:${outputDigest}`,
    errors: [],
    supersedes_receipt_id: null,
    metadata: {
      schema_validation: 'PASS',
      canonicalization: 'AIOS_CANONICAL_JSON',
      availability_notes: ['Process-local orchestration only; no destination writes or provider execution.'],
      spatial_compute: {
        github_run_id: null,
        commit_sha: dispatch.repository.base_sha,
        run_attempt: 1,
        environment: { runtime: 'node', isolation: 'process-local' },
        emitted_local_artifacts: [],
        storage_state: 'NOT_STAGED',
      },
    },
  };
}

function digestJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
