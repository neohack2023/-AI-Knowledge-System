import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildGlb, canonicalJson, parseGlb, readJson, sha256, validateDispatch, validateReceipt, validateValidationReport,
} from './contracts.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const dispatchPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'examples/saf-n3d-0a/positive/dispatch.mock.json');
const outputDir = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(repoRoot, 'outputs/saf-n3d-0a');

const dispatch = validateDispatch(await readJson(dispatchPath));
if (dispatch.mode !== 'SIMULATION' || dispatch.execution_profile !== 'MOCK_FIXTURE') {
  throw new Error('This bounded runner accepts only SIMULATION / MOCK_FIXTURE.');
}

const gltf = await readJson(path.join(repoRoot, 'examples/saf-n3d-0a/gltf/minimal-triangle.gltf.json'));
const binary = Buffer.from(
  (await readFile(path.join(repoRoot, 'examples/saf-n3d-0a/gltf/minimal-triangle.bin.base64'), 'utf8')).trim(),
  'base64',
);
const glb = buildGlb(gltf, binary);
const projection = parseGlb(glb);

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'minimal-triangle.glb'), glb);

const now = process.env.SAF_FIXED_TIME ?? new Date().toISOString();
const runId = process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null;
const runAttempt = process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : 1;
const commitSha = (process.env.GITHUB_SHA ?? dispatch.repository.base_sha).toLowerCase();
const glbDigest = sha256(glb);
const inputDigest = sha256(Buffer.from(canonicalJson(dispatch)));

const validationReport = {
  contract: 'SpatialValidationReport/0.1',
  scope_key: dispatch.scope_key,
  execution_id: dispatch.execution_id,
  candidate_id: dispatch.candidate_package.candidate_id,
  representation_family: dispatch.candidate_package.representation_family,
  validation_profile_id: dispatch.validation_profile_id,
  components: [{
    component_id: 'fixture.triangle',
    role: dispatch.candidate_package.global_role,
    topology_family: 'POLYGONAL_MESH',
    units: 'm',
    coordinate_system: 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD',
    bounds: projection.bounds,
    dimensions: projection.dimensions,
    vertex_count: projection.vertexCount,
    face_count: projection.faceCount,
    connected_components: 1,
    degenerate_faces: 0,
    zero_area_faces: 0,
    non_manifold_edges: 3,
    flipped_normals: 0,
    self_intersections: 0,
    watertight_requirement: 'COMPONENT_SPECIFIC',
    watertight_observed: false,
    watertight_result: 'REVIEW_REQUIRED',
  }],
  export_reimport: {
    export_result: 'PASS',
    reimport_result: 'PASS',
    format: 'GLB',
    validator: 'SAF structural GLB parser/0.1',
    structural_digest_match: true,
  },
  materials: {
    uv_present: false,
    uv_overlap_result: 'NOT_APPLICABLE',
    channels_present: [],
    translation_loss: [],
  },
  rig: {
    state: 'NOT_RUN',
    bone_count: null,
    hierarchy_valid: null,
    weights_normalized: null,
    socket_checks: [],
    deformation_tests: [],
  },
  rights: {
    state: 'SYNTHETIC_FIXTURE',
    distribution: 'TEST_ONLY',
  },
  technical_outcome: 'CONDITIONAL_PASS',
  human_review: {
    requirement: 'REQUIRED',
    state: 'PENDING',
    reason_codes: ['IDENTITY_CRITICAL_PROFILE', 'OPEN_TRIANGLE_FIXTURE'],
    evidence_refs: [],
  },
  acceptance: {
    state: 'PENDING',
    assigned_destination: 'CANDIDATE_ASSET_PACKAGE',
  },
};
validateValidationReport(validationReport);
const reportBytes = Buffer.from(`${JSON.stringify(validationReport, null, 2)}\n`);
await writeFile(path.join(outputDir, 'validation-report.json'), reportBytes);

const outputDigest = sha256(Buffer.from(canonicalJson({
  glb: glbDigest,
  validation_report: sha256(reportBytes),
})));

const receipt = {
  receipt_version: '0.1',
  receipt_id: `rcpt-saf-n3d-0a-${dispatch.execution_id}`,
  execution_id: dispatch.execution_id,
  trace_id: dispatch.trace_id,
  span_id: dispatch.span_id,
  parent_span_id: null,
  scope_key: dispatch.scope_key,
  workflow_id: dispatch.workflow_id,
  operation_name: 'saf_n3d_0a_mock_fixture_build',
  operation_type: 'TOOL_CALL',
  mode: 'SIMULATION',
  status: 'COMPLETED',
  started_at: now,
  completed_at: now,
  duration_ms: 0,
  source_refs: dispatch.sources.map((source) => ({
    source_type: source.source_type === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'GITHUB',
    source_id: source.provenance_envelope_id,
    source_uri: source.logical_uri,
    authority_role: 'EVIDENCE',
    content_digest: source.digest,
  })),
  authority_decisions: [{
    decision_id: 'decision-saf-n3d-0a-non-authoritative',
    claim_key: 'durable_write_authority',
    candidate_source_ids: [],
    selected_source_id: null,
    decision: 'REJECTED',
    reason_code: 'SLICE_FORBIDS_DURABLE_WRITES',
    policy_ref: dispatch.authorization.authorization_ref,
  }],
  provider: null,
  model: null,
  token_usage: {
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    availability: 'UNAVAILABLE',
  },
  external_effect: {
    effect_type: 'NONE',
    target_type: null,
    target_id: null,
    requested: false,
    authorized: false,
    performed: false,
    verified: false,
    authorization_ref: dispatch.authorization.authorization_ref,
    verification_ref: null,
  },
  input_digest: inputDigest,
  output_digest: outputDigest,
  errors: [],
  supersedes_receipt_id: null,
  metadata: {
    schema_validation: 'PASS',
    canonicalization: 'AIOS_CANONICAL_JSON',
    availability_notes: [
      'No provider, token, network, Drive, callback, Notion, registry, or durable-write operation was available in this slice.',
    ],
    spatial_compute: {
      github_run_id: runId,
      commit_sha: commitSha,
      run_attempt: runAttempt,
      environment: {
        runner_os: process.platform,
        node_version: process.version,
        tool_versions: { 'saf-contracts': '0.1' },
      },
      emitted_local_artifacts: [
        {
          logical_name: 'MOCK_GLTF_BINARY',
          relative_path: 'minimal-triangle.glb',
          media_type: 'model/gltf-binary',
          byte_length: glb.byteLength,
          sha256_digest: glbDigest,
          location_type: 'PROCESS_LOCAL',
        },
        {
          logical_name: 'VALIDATION_REPORT',
          relative_path: 'validation-report.json',
          media_type: 'application/json',
          byte_length: reportBytes.byteLength,
          sha256_digest: sha256(reportBytes),
          location_type: 'PROCESS_LOCAL',
        },
      ],
      storage_state: 'NOT_STAGED',
    },
  },
};
validateReceipt(receipt);
await writeFile(path.join(outputDir, 'execution-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);

console.log(JSON.stringify({
  outputDir,
  glbDigest,
  validationReport: validationReport.technical_outcome,
  receiptStatus: receipt.status,
}));
