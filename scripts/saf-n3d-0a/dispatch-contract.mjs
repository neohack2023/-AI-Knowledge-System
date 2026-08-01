import { object, exact, equal, string, oneOf, stableId, scope, pattern, digest, array, url, timestamp, uniqueEnumArray, fail } from './common.mjs';

export function validateDispatch(value) {
  object(value, '$');
  exact(value, [
    'contract_version','workflow_version','mode','execution_profile','validation_profile_id','scope_key',
    'execution_id','trace_id','span_id','parent_execution_id','workflow_id','repository',
    'candidate_package','sources','authorization',
  ], '$');
  equal(value.contract_version, 'SAF-N3D-Dispatch/0.1', '$.contract_version');
  string(value.workflow_version, '$.workflow_version');
  oneOf(value.mode, ['SIMULATION','LIVE'], '$.mode');
  oneOf(value.execution_profile, ['MOCK_FIXTURE','NEURAL_PROVIDER'], '$.execution_profile');
  if (value.execution_profile === 'MOCK_FIXTURE' && value.mode !== 'SIMULATION') {
    fail('MOCK_REQUIRES_SIMULATION', 'MOCK_FIXTURE must use SIMULATION mode.', '$.mode');
  }
  stableId(value.validation_profile_id, '$.validation_profile_id');
  scope(value.scope_key, '$.scope_key');
  stableId(value.execution_id, '$.execution_id');
  pattern(value.trace_id, /^[a-f0-9]{32}$/, '$.trace_id');
  pattern(value.span_id, /^[a-f0-9]{16}$/, '$.span_id');
  if (value.parent_execution_id !== null) stableId(value.parent_execution_id, '$.parent_execution_id');
  equal(value.workflow_id, 'spatial-asset-foundry', '$.workflow_id');

  object(value.repository, '$.repository');
  exact(value.repository, ['full_name','base_sha','working_branch'], '$.repository');
  pattern(value.repository.full_name, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, '$.repository.full_name');
  pattern(value.repository.base_sha, /^[a-f0-9]{40}$/, '$.repository.base_sha');
  pattern(value.repository.working_branch, /^agent\/saf-n3d-0a-[a-z0-9._-]+$/, '$.repository.working_branch');

  object(value.candidate_package, '$.candidate_package');
  exact(value.candidate_package, ['candidate_id','global_role','representation_family','generation_method','blueprint_digest','subtype_extensions'], '$.candidate_package');
  stableId(value.candidate_package.candidate_id, '$.candidate_package.candidate_id');
  oneOf(value.candidate_package.global_role, ['CHARACTER_BODY','COSTUME','WEAPON','ACCESSORY','PROP','ENVIRONMENT','MATERIAL_SET','RIG','OTHER'], '$.candidate_package.global_role');
  oneOf(value.candidate_package.representation_family, ['MESH_ASSET_DRAFT','GAUSSIAN_SPLAT_CAPTURE','PROCEDURAL_MESH_SOURCE','RIGGED_CHARACTER_DRAFT'], '$.candidate_package.representation_family');
  oneOf(value.candidate_package.generation_method, ['IMAGE_TO_MESH','IMAGE_TO_SPLAT','PROCEDURAL','MANUAL','HYBRID','MOCK_FIXTURE'], '$.candidate_package.generation_method');
  digest(value.candidate_package.blueprint_digest, '$.candidate_package.blueprint_digest');
  object(value.candidate_package.subtype_extensions, '$.candidate_package.subtype_extensions');

  array(value.sources, '$.sources', 1, 16);
  value.sources.forEach((sourceValue, index) => validateSource(sourceValue, `$.sources[${index}]`));
  validateAuthorization(value.authorization, value);
  return value;
}

function validateSource(value, path) {
  object(value, path);
  exact(value, ['source_type','logical_uri','temporary_fetch_url','fetch_url_expires_at','digest','provenance_envelope_id'], path);
  oneOf(value.source_type, ['REPOSITORY_FIXTURE','TRANSIENT_INPUT','GOOGLE_DRIVE'], `${path}.source_type`);
  string(value.logical_uri, `${path}.logical_uri`);
  digest(value.digest, `${path}.digest`);
  stableId(value.provenance_envelope_id, `${path}.provenance_envelope_id`);
  if (value.source_type === 'GOOGLE_DRIVE') {
    url(value.temporary_fetch_url, `${path}.temporary_fetch_url`);
    timestamp(value.fetch_url_expires_at, `${path}.fetch_url_expires_at`);
  } else if (value.temporary_fetch_url !== null || value.fetch_url_expires_at !== null) {
    fail('UNEXPECTED_FETCH_URL', 'Non-Drive sources must not carry temporary fetch URLs.', path);
  }
}

function validateAuthorization(value, dispatch) {
  const path = '$.authorization';
  object(value, path);
  exact(value, ['authorization_ref','issued_at','expires_at','issued_for_execution_id','scope_key','repository_full_name','base_sha','allowed_effects','forbidden_effects','authorization_digest'], path);
  stableId(value.authorization_ref, `${path}.authorization_ref`);
  timestamp(value.issued_at, `${path}.issued_at`);
  timestamp(value.expires_at, `${path}.expires_at`);
  if (Date.parse(value.expires_at) <= Date.parse(value.issued_at)) fail('AUTHORIZATION_EXPIRED_AT_ISSUE', 'expires_at must be later than issued_at.', `${path}.expires_at`);
  equal(value.issued_for_execution_id, dispatch.execution_id, `${path}.issued_for_execution_id`, 'AUTHORIZATION_BINDING_MISMATCH');
  equal(value.scope_key, dispatch.scope_key, `${path}.scope_key`, 'AUTHORIZATION_BINDING_MISMATCH');
  equal(value.repository_full_name, dispatch.repository.full_name, `${path}.repository_full_name`, 'AUTHORIZATION_BINDING_MISMATCH');
  equal(value.base_sha, dispatch.repository.base_sha, `${path}.base_sha`, 'AUTHORIZATION_BINDING_MISMATCH');
  uniqueEnumArray(value.allowed_effects, ['READ_SOURCE','EXECUTE_BUILD','CREATE_ACTIONS_ARTIFACT','EMIT_RECEIPT'], `${path}.allowed_effects`);
  const requiredForbidden = ['MUTATE_NOTION','WRITE_GOOGLE_DRIVE','REGISTER_ASSET','PROMOTE_CANON','MERGE_DEFAULT_BRANCH','INVOKE_NEURAL_PROVIDER','SEND_CALLBACK'];
  uniqueEnumArray(value.forbidden_effects, requiredForbidden, `${path}.forbidden_effects`);
  for (const effect of requiredForbidden) if (!value.forbidden_effects.includes(effect)) fail('MISSING_FORBIDDEN_EFFECT', `Missing ${effect}.`, `${path}.forbidden_effects`);
  digest(value.authorization_digest, `${path}.authorization_digest`);
}
