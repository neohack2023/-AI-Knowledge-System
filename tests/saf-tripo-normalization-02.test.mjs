import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeStatus, normalizeTask, durableArtifactIdentity, projectReceipt } from '../scripts/saf-tripo-normalization-02/normalize.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('../examples/saf-tripo-normalization-02/fixtures.json', import.meta.url), 'utf8'));
const observedAt = '2026-08-13T01:30:00.000Z';

test('v2 and v3 provider drift normalize to the same stable task and artifact identities', () => {
  const v2 = normalizeTask(fixtures.v2Success, { transport: 'v2', observedAt });
  const v3 = normalizeTask(fixtures.v3Equivalent, { transport: 'v3', observedAt });

  assert.equal(v2.observation.task_id, v3.observation.task_id);
  assert.equal(v2.observation.task_type, v3.observation.task_type);
  assert.equal(v2.observation.status, 'SUCCESS');
  assert.equal(v3.observation.status, 'SUCCESS');
  assert.equal(v2.observation.progress, 100);
  assert.equal(v3.observation.progress, 100);
  assert.deepEqual(v2.observation.output_refs, v3.observation.output_refs);
  assert.deepEqual(v2.artifacts, v3.artifacts);
  assert.equal(v2.terminal, true);
  assert.equal(v3.terminal, true);
});

test('signed URLs are reduced to durable HTTPS identities without query or fragment', () => {
  assert.equal(
    durableArtifactIdentity('https://cdn.example.invalid/model.glb?token=secret#fragment'),
    'https://cdn.example.invalid/model.glb'
  );
});

test('non-HTTPS artifact transport fails closed', () => {
  assert.throws(
    () => normalizeTask(fixtures.invalidHttpArtifact, { observedAt }),
    /ARTIFACT_URL_HTTPS_REQUIRED/
  );
});

test('unknown provider state remains UNKNOWN and is never terminal success', () => {
  const normalized = normalizeTask(fixtures.unknownState, { observedAt });
  assert.equal(normalized.observation.status, 'UNKNOWN');
  assert.equal(normalized.terminal, false);
  assert.equal(normalizeStatus('new-provider-state'), 'UNKNOWN');
});

test('provider errors are bounded, single-line, redacted observations rather than raw bodies', () => {
  const normalized = normalizeTask(fixtures.providerFailure, { observedAt });
  assert.equal(normalized.observation.status, 'FAILED');
  assert.equal(normalized.terminal, true);
  assert.equal(normalized.observation.raw_provider_body_logged, false);
  assert.match(normalized.observation.error.message, /\[REDACTED\]/);
  assert.doesNotMatch(normalized.observation.error.message, /should-not-persist/);
  assert.doesNotMatch(normalized.observation.error.message, /[\r\n\t]/);
});

test('receipt projection contains stable evidence only and grants no authority', () => {
  const normalized = normalizeTask(fixtures.v2Success, { transport: 'v2', observedAt });
  const receipt = projectReceipt({ request: fixtures.request, normalized });
  const serialized = JSON.stringify(receipt);

  assert.equal(receipt.contract, 'TripoExecutionReceiptProjection/0.2');
  assert.equal(receipt.authorization, 'NONE');
  assert.deepEqual(receipt.external_effects, []);
  assert.equal(receipt.local_validation_state, 'PENDING');
  assert.deepEqual(receipt.artifact_identities, [
    'https://cdn.example.invalid/model.glb',
    'https://cdn.example.invalid/model-pbr.glb'
  ]);
  assert.doesNotMatch(serialized, /secret:\/\//);
  assert.doesNotMatch(serialized, /api_key|authorization_header|Bearer/i);
});
