import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  buildGlb, parseGlb, readJson, SafContractError, sha256, validateDispatch, validateReceipt,
  validateValidationProfile, validateValidationReport,
} from '../scripts/saf-n3d-0a/contracts.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const exampleRoot = path.join(repoRoot, 'examples/saf-n3d-0a');

test('positive SAF-N3D-0A fixtures satisfy bounded contracts', async () => {
  const dispatch = await readJson(path.join(exampleRoot, 'positive/dispatch.mock.json'));
  const receipt = await readJson(path.join(exampleRoot, 'positive/receipt.mock.json'));
  const profile = await readJson(path.join(exampleRoot, 'positive/validation-profile.character.json'));
  const report = await readJson(path.join(exampleRoot, 'positive/validation-report.mock.json'));
  validateDispatch(dispatch);
  validateReceipt(receipt);
  validateValidationProfile(profile);
  validateValidationReport(report);
});

test('negative fixtures fail with their declared reason codes', async () => {
  const manifest = await readJson(path.join(exampleRoot, 'negative/manifest.json'));
  const validators = {
    'dispatch.mock.json': validateDispatch,
    'receipt.mock.json': validateReceipt,
    'validation-report.mock.json': validateValidationReport,
  };
  for (const fixture of manifest.fixtures) {
    const value = await readJson(path.join(exampleRoot, 'negative', fixture.file));
    assert.throws(
      () => validators[fixture.validator_fixture](value),
      (error) => error instanceof SafContractError && error.code === fixture.expected_error_code,
      fixture.file,
    );
  }
});

test('minimal triangle fixture builds a deterministic valid GLB and re-imports structurally', async () => {
  const gltf = await readJson(path.join(exampleRoot, 'gltf/minimal-triangle.gltf.json'));
  const binary = Buffer.from(
    (await readFile(path.join(exampleRoot, 'gltf/minimal-triangle.bin.base64'), 'utf8')).trim(),
    'base64',
  );
  const first = buildGlb(gltf, binary);
  const second = buildGlb(structuredClone(gltf), Buffer.from(binary));
  assert.deepEqual(first, second);
  const parsed = parseGlb(first);
  assert.deepEqual(parsed.bounds, { min: [0,0,0], max: [1,1,0] });
  assert.deepEqual(parsed.indices, [0,1,2]);
  assert.equal(parsed.vertexCount, 3);
  assert.equal(parsed.faceCount, 1);
});

test('frozen fixture manifest matches exact text fixture bytes', async () => {
  const manifest = await readJson(path.join(exampleRoot, 'manifest.json'));
  for (const fixture of manifest.files) {
    const bytes = await readFile(path.join(exampleRoot, fixture.path));
    assert.equal(bytes.byteLength, fixture.byte_length, fixture.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256, fixture.path);
  }
});

test('mock runner emits process-local artifacts, receipt, and validation without external effects', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'saf-n3d-0a-'));
  try {
    const result = spawnSync(process.execPath, [
      path.join(repoRoot, 'scripts/saf-n3d-0a/build-mock-run.mjs'),
      path.join(exampleRoot, 'positive/dispatch.mock.json'),
      temp,
    ], {
      encoding: 'utf8',
      env: { ...process.env, SAF_FIXED_TIME: '2026-08-01T20:00:00Z' },
    });
    assert.equal(result.status, 0, result.stderr);
    const receiptValue = await readJson(path.join(temp, 'execution-receipt.json'));
    const reportValue = await readJson(path.join(temp, 'validation-report.json'));
    const receipt = validateReceipt(receiptValue);
    const report = validateValidationReport(reportValue);
    const glb = await readFile(path.join(temp, 'minimal-triangle.glb'));
    parseGlb(glb);
    assert.equal(receipt.external_effect.effect_type, 'NONE');
    assert.equal(receipt.external_effect.performed, false);
    assert.equal(receipt.metadata.spatial_compute.storage_state, 'NOT_STAGED');
    assert.equal(report.acceptance.state, 'PENDING');
    assert.equal(report.human_review.state, 'PENDING');
    assert.equal(receipt.metadata.spatial_compute.emitted_local_artifacts[0].sha256_digest, sha256(glb));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
