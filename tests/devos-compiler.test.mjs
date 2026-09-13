import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyBootstrap,
  compileDevosProfile,
  inventoryRepository,
  renderBootstrapFiles
} from '../scripts/agent-system/devos-compiler.mjs';

async function tempRepo(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('greenfield Python repository compiles a minimal local-first DevOS bootstrap', async () => {
  const root = await tempRepo('devos-python-');
  await writeFile(path.join(root, 'pyproject.toml'), '[project]\nname = "demo"\n');

  const inventory = await inventoryRepository(root);
  const profile = compileDevosProfile(inventory);

  assert.equal(profile.mode, 'BOOTSTRAP_REQUIRED');
  assert.deepEqual(inventory.languages, ['python']);
  assert.equal(profile.components.research_preflight, 'REQUIRED');
  assert.equal(profile.components.runtime_database, 'DEFER');
  assert.equal(profile.bootstrap_policy.normal_repo_work_external_fetch_required, false);
  assert.equal(profile.authority.research_authority_effect, 'NONE');
});

test('bootstrap apply is non-destructive and idempotent', async () => {
  const root = await tempRepo('devos-apply-');
  await writeFile(path.join(root, 'AGENTS.md'), '# Existing instructions\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', build: 'node build.mjs' } }));

  const profile = compileDevosProfile(await inventoryRepository(root));
  const first = await applyBootstrap(root, profile);
  const second = await applyBootstrap(root, profile);

  assert.equal(first.state, 'BOOTSTRAP_APPLIED');
  assert.ok(first.created.includes('devos/project.json'));
  assert.ok(!first.created.includes('AGENTS.md'));
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
  assert.equal(second.state, 'BOOTSTRAP_ALREADY_PRESENT');
  assert.ok(second.skipped.includes('devos/project.json'));
});

test('existing DevOS is reused instead of duplicated', async () => {
  const root = await tempRepo('devos-present-');
  await mkdir(path.join(root, 'devos'));
  await writeFile(path.join(root, 'devos', 'README.md'), '# Existing DevOS\n');

  const profile = compileDevosProfile(await inventoryRepository(root));
  const result = await applyBootstrap(root, profile);

  assert.equal(profile.mode, 'DEVOS_PRESENT');
  assert.equal(profile.target_root, 'devos');
  assert.equal(result.state, 'NOOP_EXISTING_OPERATING_LAYER');
});

test('existing repository agent OS counts as an equivalent operating layer', async () => {
  const root = await tempRepo('devos-equivalent-');
  await mkdir(path.join(root, 'docs', 'agent-system'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'agent-system', 'README.md'), '# Existing repo OS\n');

  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'EQUIVALENT_REPO_OS_PRESENT');
  assert.equal(profile.target_root, 'docs/agent-system');
  assert.deepEqual(renderBootstrapFiles(profile), {});
});

test('established repository defers SQLite until measured need instead of forcing it', async () => {
  const root = await tempRepo('devos-established-');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
  await writeFile(path.join(root, 'AGENTS.md'), '# Agent rules\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'eslint .' } }));

  const inventory = await inventoryRepository(root);
  const profile = compileDevosProfile(inventory);
  assert.equal(inventory.maturity, 'ESTABLISHED');
  assert.equal(profile.components.runtime_database, 'OPTIONAL_AFTER_MEASURED_NEED');
  assert.equal(profile.mode, 'BOOTSTRAP_REQUIRED');
});

test('generated research policy is bounded and cannot promote itself', async () => {
  const root = await tempRepo('devos-research-');
  const profile = compileDevosProfile(await inventoryRepository(root));
  const files = renderBootstrapFiles(profile);
  const policy = JSON.parse(files['devos/research-policy.json']);

  assert.equal(policy.autonomous_preflight, true);
  assert.equal(policy.authority_effect, 'NONE');
  assert.equal(policy.promotion_state, 'CANDIDATE_ONLY');
  assert.ok(policy.trigger_policy.includes('CAPABILITY_GAP'));
  assert.ok(policy.source_policy.primary_source_required_for.includes('SECURITY_RELEVANT_BEHAVIOR'));
});
