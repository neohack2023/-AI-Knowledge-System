import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  assertDerivedValidation, evaluateSpatialValidation, readJson, SchemaValidationError,
  validateSchemaDocument, validateValidationReport,
} from '../scripts/saf-n3d-0a/contracts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const examples = path.join(root, 'examples/saf-n3d-0a/positive');
const schemas = path.join(root, 'schemas/saf-n3d-0a');

test('published JSON Schemas execute against every positive fixture', async () => {
  const pairs = [
    ['dispatch.mock.json', 'dispatch.schema.json'],
    ['receipt.mock.json', 'execution-receipt-spatial.schema.json'],
    ['validation-profile.character.json', 'validation-profile.schema.json'],
    ['validation-report.mock.json', 'validation-report.schema.json'],
  ];
  for (const [fixture, schema] of pairs) {
    validateSchemaDocument(await readJson(path.join(schemas, schema)), await readJson(path.join(examples, fixture)));
  }
});

test('schema gate catches structure accepted by the handwritten semantic validator', async () => {
  const report = structuredClone(await readJson(path.join(examples, 'validation-report.mock.json')));
  report.components[0].undeclared_field = true;
  validateValidationReport(report);
  assert.throws(
    () => validateSchemaDocument(awaitableSchema, report),
    (error) => error instanceof SchemaValidationError && error.keyword === 'additionalProperties',
  );
});

const awaitableSchema = await readJson(path.join(schemas, 'validation-report.schema.json'));

test('technical outcome is derived from profile observations', async () => {
  const profile = await readJson(path.join(examples, 'validation-profile.character.json'));
  const report = await readJson(path.join(examples, 'validation-report.mock.json'));
  const derived = assertDerivedValidation(profile, report);
  assert.equal(derived.technical_outcome, 'CONDITIONAL_PASS');
  assert.equal(derived.acceptance_eligible, false);
  assert.ok(derived.warnings.includes('HUMAN_REVIEW_PENDING'));

  const invalid = structuredClone(report);
  invalid.components[0].vertex_count = profile.geometry_rules.max_vertices + 1;
  invalid.technical_outcome = 'PASS';
  const failed = evaluateSpatialValidation(profile, invalid);
  assert.equal(failed.technical_outcome, 'FAIL');
  assert.ok(failed.blockers.some((code) => code.startsWith('MAX_VERTICES_EXCEEDED')));
  assert.throws(() => assertDerivedValidation(profile, invalid), /TECHNICAL_OUTCOME_MISMATCH/);
});

test('dispatch evidence verifier checks source bytes and authorization time', async () => {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/saf-n3d-0a/verify-dispatch-evidence.mjs'),
    path.join(examples, 'dispatch.mock.json'),
  ], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SAF_TRUSTED_NOW: '2026-08-02T00:00:00Z' },
  });
  assert.equal(result.status, 0, result.stderr);

  const temp = await mkdtemp(path.join(os.tmpdir(), 'saf-dispatch-'));
  try {
    const dispatch = await readJson(path.join(examples, 'dispatch.mock.json'));
    dispatch.sources[0].digest = `sha256:${'0'.repeat(64)}`;
    const file = path.join(temp, 'dispatch.json');
    await writeFile(file, `${JSON.stringify(dispatch, null, 2)}\n`);
    const mismatch = spawnSync(process.execPath, [
      path.join(root, 'scripts/saf-n3d-0a/verify-dispatch-evidence.mjs'), file,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SAF_TRUSTED_NOW: '2026-08-02T00:00:00Z' },
    });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /SOURCE_DIGEST_MISMATCH/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('generated package verifier rejects self-declared outcome drift', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'saf-package-'));
  try {
    const build = spawnSync(process.execPath, [
      path.join(root, 'scripts/saf-n3d-0a/build-mock-run.mjs'),
      path.join(examples, 'dispatch.mock.json'),
      temp,
    ], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, SAF_FIXED_TIME: '2026-08-01T20:00:00Z' },
    });
    assert.equal(build.status, 0, build.stderr);
    const reportPath = path.join(temp, 'validation-report.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.technical_outcome = 'PASS';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    const verify = spawnSync(process.execPath, [
      path.join(root, 'scripts/saf-n3d-0a/verify-generated-package.mjs'), temp,
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(verify.status, 0);
    assert.match(verify.stderr, /TECHNICAL_OUTCOME_MISMATCH/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
