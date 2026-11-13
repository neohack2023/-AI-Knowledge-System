import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveValidThrough,
  receiptDigest,
  validateGovernanceSyncReceipt
} from '../scripts/agent-system/governance-sync.mjs';

const source = {
  source_id: 'AIOS_GITHUB_GOVERNED_EXECUTION_CONTRACT_v0.1',
  page_id: '3aa43bd4-ae4a-8125-a453-d4ecd5fad910',
  observed_last_edited_at: '2026-07-27T04:20:37.420Z'
};

function baseReceipt(deltaState = 'NO_MATERIAL_DELTA') {
  return {
    schema_name: 'GovernanceSyncReceipt',
    schema_version: '1.0',
    sync_id: 'GSYNC-20260904-001',
    performed_on: '2026-09-04',
    repository_base_sha: '0123456789abcdef0123456789abcdef01234567',
    sync_role: 'KNOWLEDGE_STEWARD',
    trigger: 'owner_requests_upstream_sync',
    upstream_snapshot_identity_kind: 'NOTION_PAGE_ID_PLUS_LAST_EDITED_AT',
    upstream_sources: [source],
    comparison: {
      delta_state: deltaState,
      material_deltas: deltaState === 'NO_MATERIAL_DELTA' ? [] : [{ delta_id: 'D1', reconciliation: 'bounded' }]
    },
    refresh: {
      prior_valid_through: '2026-10-04',
      freshness_policy_days: 30,
      refreshed_on: '2026-09-04',
      valid_through_after: '2026-10-04',
      applied: deltaState !== 'MATERIAL_DELTA_PENDING'
    },
    authority_boundary: {
      normal_repo_work_external_fetch_required: false,
      global_authority_cutover: false,
      merge_release_deploy_authority_granted: false,
      private_workspace_urls_in_repository: false
    }
  };
}

test('freshness date is mechanically derived', () => {
  assert.equal(deriveValidThrough('2026-09-04', 30), '2026-10-04');
});

test('receipt digest is stable SHA-256 evidence', () => {
  assert.match(receiptDigest('{"ok":true}\n'), /^sha256:[0-9a-f]{64}$/);
});

test('no-delta receipt passes bounded validation', () => {
  const problems = validateGovernanceSyncReceipt(baseReceipt(), {
    requiredSources: [source.source_id],
    expectedSyncId: 'GSYNC-20260904-001',
    expectedPerformedOn: '2026-09-04',
    expectedValidThrough: '2026-10-04',
    expectedFreshnessDays: 30
  });
  assert.equal(problems.length, 0);
});

test('pending material delta fails closed', () => {
  const problems = validateGovernanceSyncReceipt(baseReceipt('MATERIAL_DELTA_PENDING'), {
    requiredSources: [source.source_id],
    expectedSyncId: 'GSYNC-20260904-001',
    expectedPerformedOn: '2026-09-04',
    expectedValidThrough: '2026-10-04',
    expectedFreshnessDays: 30
  });
  assert.ok(problems.some((problem) => problem.code === 'GOVERNANCE_SYNC_DELTA_PENDING'));
});

test('missing upstream snapshot fails validation', () => {
  const receipt = baseReceipt();
  receipt.upstream_sources = [];
  const problems = validateGovernanceSyncReceipt(receipt, { requiredSources: [source.source_id] });
  assert.ok(problems.some((problem) => problem.code === 'GOVERNANCE_SYNC_SOURCE_SET_MISMATCH'));
});

test('checkout newline styles produce the same canonical receipt digest', () => {
  const lf = '{\n  "schema_name": "GovernanceSyncReceipt"\n}\n';
  assert.equal(receiptDigest(lf), receiptDigest(lf.replace(/\n/g, '\r\n')));
});

const multiSource = () => {
  const receipt = baseReceipt('NO_MATERIAL_DELTA');
  receipt.upstream_snapshot_identity_kind = 'GOVERNED_MULTI_SOURCE_V1';
  receipt.upstream_sources = [{
    source_id: source.source_id,
    source_kind: 'DRIVE',
    object_id: '1VzlBRsQMaDOrQhsWbbwkXO8mLuBB0RaWpK5YyAqKQe4',
    observed_modified_at: '2026-08-30T17:16:43.868Z',
    content_digest: 'sha256:' + 'a'.repeat(64),
    authority_state: 'drive_verified_mirror',
    verification_state: 'VERIFIED',
  }];
  return receipt;
};

test('governed multi-source schema admits a verified Drive snapshot, retaining legacy support', () => {
  assert.deepEqual(validateGovernanceSyncReceipt(multiSource(), { requiredSources: [source.source_id] }), []);
  assert.deepEqual(validateGovernanceSyncReceipt(baseReceipt(), { requiredSources: [source.source_id] }), []);
});

test('governed multi-source schema rejects a Drive shadow passed off as verified authority', () => {
  const receipt = multiSource();
  receipt.upstream_sources[0].authority_state = 'drive_shadow';
  assert.ok(validateGovernanceSyncReceipt(receipt, { requiredSources: [source.source_id] })
    .some(x => x.code === 'GOVERNANCE_SYNC_SOURCE_UNVERIFIED'));
});

test('governed multi-source schema fails on missing digest, partial sources and duplicate identities', () => {
  const receipt = multiSource();
  receipt.upstream_sources[0].content_digest = null;
  const missing = validateGovernanceSyncReceipt(receipt, { requiredSources: [source.source_id, 'CODING-HARNESS-01'] });
  assert.ok(missing.some(x => x.code === 'GOVERNANCE_SYNC_SOURCE_UNVERIFIED'));
  assert.ok(missing.some(x => x.code === 'GOVERNANCE_SYNC_SOURCE_SET_MISMATCH'));
  const duplicate = multiSource();
  duplicate.upstream_sources.push({...duplicate.upstream_sources[0]});
  assert.ok(validateGovernanceSyncReceipt(duplicate, { requiredSources: [source.source_id] })
    .some(x => x.code === 'GOVERNANCE_SYNC_SOURCE_DUPLICATE'));
});

test('governed multi-source schema can bind a live GitHub implementation identity but cannot substitute an arbitrary repository', () => {
  const receipt = multiSource();
  receipt.upstream_sources[0] = {
    source_id: source.source_id,
    source_kind: 'GITHUB',
    repository: 'neohack2023/-AI-Knowledge-System',
    path: 'server/coding-harness/index.ts',
    commit_sha: '4a47885dfa00f7f9a9554bf3e6a3ef6500b781e4',
    observed_modified_at: '2026-11-13T00:00:00Z',
    content_digest: 'sha256:' + 'b'.repeat(64),
    authority_state: 'github_authoritative',
    verification_state: 'VERIFIED',
  };
  assert.deepEqual(validateGovernanceSyncReceipt(receipt, { requiredSources: [source.source_id] }), []);
  receipt.upstream_sources[0].path = '../private-secret';
  assert.ok(validateGovernanceSyncReceipt(receipt, { requiredSources: [source.source_id] })
    .some(x => x.code === 'GOVERNANCE_SYNC_SOURCE_UNVERIFIED'));
});
