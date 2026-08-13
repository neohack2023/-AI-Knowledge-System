import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fixtures = JSON.parse(fs.readFileSync(new URL('../examples/saf-tripo-adapter-contract-01/fixtures.json', import.meta.url), 'utf8'));

function validate(record) {
  const forbidden = ['api_key', 'token', 'authorization_header'];
  for (const key of forbidden) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return { ok: false, reason: `FORBIDDEN_SECRET_FIELD:${key}` };
  }

  switch (record.contract) {
    case 'TripoProviderRequest/0.1':
      if (record.provider !== 'tripo') return { ok: false, reason: 'PROVIDER' };
      if (record.tls_policy !== 'VERIFY_REQUIRED') return { ok: false, reason: 'TLS_FAIL_CLOSED' };
      if (record.authorization !== 'NONE') return { ok: false, reason: 'AUTHORIZATION' };
      if (!record.operation || !record.scope_key || !record.api_route_family || !record.parameters) return { ok: false, reason: 'REQUIRED' };
      return { ok: true };

    case 'TripoTaskObservation/0.1': {
      const states = new Set(['QUEUED','RUNNING','SUCCESS','FAILED','CANCELLED','UNKNOWN','BANNED','EXPIRED']);
      if (!record.task_id || !states.has(record.status)) return { ok: false, reason: 'TASK_STATE' };
      if (!Number.isInteger(record.progress) || record.progress < 0 || record.progress > 100) return { ok: false, reason: 'PROGRESS' };
      if (record.raw_provider_body_logged !== false) return { ok: false, reason: 'RAW_BODY_LOGGING' };
      return { ok: true };
    }

    case 'TripoArtifactCandidate/0.1':
      if (!record.task_id || !record.source_url) return { ok: false, reason: 'ARTIFACT_REQUIRED' };
      if (record.authorization !== 'NONE') return { ok: false, reason: 'AUTHORIZATION' };
      if (record.digest_state === 'VERIFIED' && !/^[a-f0-9]{64}$/.test(record.sha256 ?? '')) return { ok: false, reason: 'DIGEST_REQUIRED' };
      return { ok: true };

    case 'TripoImportProposal/0.1':
      if (record.authorization !== 'NONE') return { ok: false, reason: 'AUTHORIZATION' };
      if (record.target_executor !== 'blender') return { ok: false, reason: 'EXECUTOR' };
      if (record.requested_effect !== 'IMPORT_GLB') return { ok: false, reason: 'EFFECT_NOT_ALLOWED' };
      if (record.arbitrary_code !== false) return { ok: false, reason: 'ARBITRARY_CODE_BLOCKED' };
      return { ok: true };

    default:
      return { ok: false, reason: 'UNKNOWN_CONTRACT' };
  }
}

test('positive frozen Tripo adapter fixtures pass', () => {
  for (const [name, record] of Object.entries(fixtures.positive)) {
    assert.deepEqual(validate(record), { ok: true }, name);
  }
});

test('TLS verification cannot be disabled', () => {
  assert.equal(validate(fixtures.negative.tlsDisabled).ok, false);
  assert.equal(validate(fixtures.negative.tlsDisabled).reason, 'TLS_FAIL_CLOSED');
});

test('serialized provider secrets are rejected', () => {
  assert.equal(validate(fixtures.negative.secretSerialized).ok, false);
  assert.match(validate(fixtures.negative.secretSerialized).reason, /^FORBIDDEN_SECRET_FIELD:/);
});

test('arbitrary Blender code is outside the adapter contract', () => {
  assert.equal(validate(fixtures.negative.arbitraryBlenderCode).ok, false);
  assert.equal(validate(fixtures.negative.arbitraryBlenderCode).reason, 'EFFECT_NOT_ALLOWED');
});

test('verified artifact requires sha256 evidence', () => {
  assert.equal(validate(fixtures.negative.verifiedWithoutDigest).ok, false);
  assert.equal(validate(fixtures.negative.verifiedWithoutDigest).reason, 'DIGEST_REQUIRED');
});

test('provider success and import authorization remain separate', () => {
  const success = { ...fixtures.positive.running, status: 'SUCCESS', progress: 100 };
  assert.equal(validate(success).ok, true);
  assert.equal(success.authorization, undefined);
  assert.equal(fixtures.positive.importProposal.authorization, 'NONE');
});
