import { object, exact, equal, stableId, pattern, string, oneOf, timestamp, integer, array, digest, boolean, required, fail } from './common.mjs';

export function validateReceipt(value) {
  object(value, '$');
  exact(value, [
    'receipt_version','receipt_id','execution_id','trace_id','span_id','parent_span_id','scope_key','workflow_id',
    'operation_name','operation_type','mode','status','started_at','completed_at','duration_ms','source_refs',
    'authority_decisions','provider','model','token_usage','external_effect','input_digest','output_digest','errors',
    'supersedes_receipt_id','metadata',
  ], '$');
  equal(value.receipt_version, '0.1', '$.receipt_version');
  stableId(value.receipt_id, '$.receipt_id');
  stableId(value.execution_id, '$.execution_id');
  pattern(value.trace_id, /^[a-f0-9]{32}$/, '$.trace_id');
  pattern(value.span_id, /^[a-f0-9]{16}$/, '$.span_id');
  if (value.parent_span_id !== null) pattern(value.parent_span_id, /^[a-f0-9]{16}$/, '$.parent_span_id');
  string(value.scope_key, '$.scope_key');
  if (value.workflow_id !== null) stableId(value.workflow_id, '$.workflow_id');
  string(value.operation_name, '$.operation_name');
  oneOf(value.operation_type, ['SCOPE_RESOLUTION','RETRIEVAL','PACKET_ASSEMBLY','TOOL_CALL','WORKFLOW_TRANSITION','STONE_INTAKE','MASON_VALIDATION','AUTHORIZATION_CHECK','DESTINATION_WRITE','VERIFICATION','BENCHMARK','OTHER'], '$.operation_type');
  oneOf(value.mode, ['IDLE','SIMULATION','LIVE','REPLAY','BLOCKED','FAILED'], '$.mode');
  oneOf(value.status, ['QUEUED','RUNNING','WAITING','APPROVAL_REQUIRED','PAUSED','COMPLETED','BLOCKED','FAILED','CANCELLED'], '$.status');
  if (value.started_at !== null) timestamp(value.started_at, '$.started_at');
  if (value.completed_at !== null) timestamp(value.completed_at, '$.completed_at');
  if (value.duration_ms !== null) integer(value.duration_ms, '$.duration_ms', 0);
  array(value.source_refs, '$.source_refs', 0, 100);
  array(value.authority_decisions, '$.authority_decisions', 0, 100);
  if (value.input_digest !== null) digest(value.input_digest, '$.input_digest');
  if (value.output_digest !== null) digest(value.output_digest, '$.output_digest');
  array(value.errors, '$.errors', 0, 100);
  if (value.status === 'FAILED' && value.errors.length === 0) fail('FAILED_RECEIPT_REQUIRES_ERROR', 'FAILED receipts require an error.', '$.errors');
  object(value.external_effect, '$.external_effect');
  exact(value.external_effect, ['effect_type','target_type','target_id','requested','authorized','performed','verified','authorization_ref','verification_ref'], '$.external_effect');
  oneOf(value.external_effect.effect_type, ['NONE','READ','CREATE','UPDATE','DELETE','MOVE','SEND','EXECUTE'], '$.external_effect.effect_type');
  for (const key of ['requested','authorized','performed','verified']) boolean(value.external_effect[key], `$.external_effect.${key}`);
  if (value.external_effect.performed && !value.external_effect.authorized) fail('UNAUTHORIZED_EFFECT_CLAIM', 'Performed effects must be authorized.', '$.external_effect');
  if (value.status === 'BLOCKED' && value.external_effect.performed) fail('BLOCKED_EFFECT_PERFORMED', 'Blocked receipt cannot claim a performed effect.', '$.external_effect');
  object(value.metadata, '$.metadata');
  for (const key of ['schema_validation','canonicalization','availability_notes','spatial_compute']) required(value.metadata, key, '$.metadata');
  oneOf(value.metadata.schema_validation, ['PASS','FAIL','NOT_RUN'], '$.metadata.schema_validation');
  oneOf(value.metadata.canonicalization, ['RFC8785','AIOS_CANONICAL_JSON','NOT_APPLICABLE'], '$.metadata.canonicalization');
  array(value.metadata.availability_notes, '$.metadata.availability_notes', 0, 100);
  validateSpatialCompute(value.metadata.spatial_compute);
  return value;
}

function validateSpatialCompute(value) {
  const path = '$.metadata.spatial_compute';
  object(value, path);
  exact(value, ['github_run_id','commit_sha','run_attempt','environment','emitted_local_artifacts','storage_state'], path);
  if (value.github_run_id !== null) integer(value.github_run_id, `${path}.github_run_id`, 0);
  pattern(value.commit_sha, /^[a-f0-9]{40}$/, `${path}.commit_sha`);
  integer(value.run_attempt, `${path}.run_attempt`, 1);
  object(value.environment, `${path}.environment`);
  array(value.emitted_local_artifacts, `${path}.emitted_local_artifacts`, 0, 100);
  for (const [index, artifact] of value.emitted_local_artifacts.entries()) {
    const p = `${path}.emitted_local_artifacts[${index}]`;
    object(artifact, p);
    exact(artifact, ['logical_name','relative_path','media_type','byte_length','sha256_digest','location_type'], p);
    pattern(artifact.logical_name, /^[A-Z0-9_]+$/, `${p}.logical_name`);
    if (artifact.relative_path.startsWith('/') || artifact.relative_path.split('/').includes('..')) fail('UNSAFE_ARTIFACT_PATH', 'Artifact paths must be relative and traversal-free.', `${p}.relative_path`);
    integer(artifact.byte_length, `${p}.byte_length`, 0);
    digest(artifact.sha256_digest, `${p}.sha256_digest`);
    equal(artifact.location_type, 'PROCESS_LOCAL', `${p}.location_type`);
  }
  equal(value.storage_state, 'NOT_STAGED', `${path}.storage_state`);
}
