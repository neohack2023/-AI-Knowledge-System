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
  assert.equal(profile.authority.research_authority_effect, 'NONE');
});

test('bootstrap apply is non-destructive and idempotent', async () => {
  const root = await tempRepo('devos-apply-');
  await writeFile(path.join(root, 'AGENTS.md'), '# Existing instructions\n');
  const profile = compileDevosProfile(await inventoryRepository(root));
  const first = await applyBootstrap(root, profile);
  const after = compileDevosProfile(await inventoryRepository(root));
  const second = await applyBootstrap(root, after);
  assert.equal(first.state, 'BOOTSTRAP_APPLIED');
  assert.equal(after.mode, 'DEVOS_PRESENT');
  assert.equal(second.state, 'NOOP_EXISTING_OPERATING_LAYER');
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
});

test('coherent existing DevOS is reused instead of duplicated', async () => {
  const root = await tempRepo('devos-present-');
  const initial = compileDevosProfile(await inventoryRepository(root));
  await applyBootstrap(root, initial);
  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'DEVOS_PRESENT');
  assert.equal(profile.target_root, 'devos');
});

test('existing repository agent OS counts as an equivalent operating layer', async () => {
  const root = await tempRepo('devos-equivalent-');
  await mkdir(path.join(root, 'docs', 'agent-system'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'agent-system', 'README.md'), '# Existing repo OS\n');
  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'EQUIVALENT_REPO_OS_PRESENT');
  assert.deepEqual(renderBootstrapFiles(profile), {});
});

test('established repository defers SQLite until measured need instead of forcing it', async () => {
  const root = await tempRepo('devos-established-');
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await mkdir(path.join(root, 'tests'));
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
  await writeFile(path.join(root, 'AGENTS.md'), '# Agent rules\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', lint: 'eslint .' } }));
  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.components.runtime_database, 'OPTIONAL_AFTER_MEASURED_NEED');
});

test('generated research policy is bounded and cannot promote itself', async () => {
  const root = await tempRepo('devos-research-');
  const profile = compileDevosProfile(await inventoryRepository(root));
  const policy = JSON.parse(renderBootstrapFiles(profile)['devos/research-policy.json']);
  assert.equal(policy.authority_effect, 'NONE');
  assert.equal(policy.promotion_state, 'CANDIDATE_ONLY');
});

test('nonexistent target repository fails closed before mutation', async () => {
  const parent = await tempRepo('devos-missing-parent-');
  const missing = path.join(parent, 'typo-repository');
  await assert.rejects(() => inventoryRepository(missing), /TARGET_REPOSITORY_NOT_FOUND/);
});

test('devos root traversal outside repository is rejected', async () => {
  const root = await tempRepo('devos-boundary-');
  const inventory = await inventoryRepository(root);
  assert.throws(() => compileDevosProfile(inventory, { devosRoot: '../shared' }), /DEVOS_PATH_OUTSIDE_REPOSITORY/);
});

test('absolute devos root outside repository is rejected', async () => {
  const root = await tempRepo('devos-absolute-');
  const inventory = await inventoryRepository(root);
  assert.throws(() => compileDevosProfile(inventory, { devosRoot: path.join(os.tmpdir(), 'shared') }), /DEVOS_PATH_OUTSIDE_REPOSITORY/);
});

test('incomplete bootstrap is repaired non-destructively', async () => {
  const root = await tempRepo('devos-repair-');
  await mkdir(path.join(root, 'devos'), { recursive: true });
  await writeFile(path.join(root, 'devos', 'README.md'), '# Partial bootstrap\n');
  const inventory = await inventoryRepository(root);
  const profile = compileDevosProfile(inventory);
  assert.equal(profile.mode, 'BOOTSTRAP_REPAIR_REQUIRED');
  const result = await applyBootstrap(root, profile);
  assert.equal(result.state, 'BOOTSTRAP_REPAIRED');
  assert.ok(result.created.includes('devos/project.json'));
  assert.ok(result.skipped.includes('devos/README.md'));
  assert.equal(await readFile(path.join(root, 'devos', 'README.md'), 'utf8'), '# Partial bootstrap\n');
  const after = compileDevosProfile(await inventoryRepository(root));
  assert.equal(after.mode, 'DEVOS_PRESENT');
});

test('empty unrelated devos directory is repaired rather than trusted as complete', async () => {
  const root = await tempRepo('devos-empty-');
  await mkdir(path.join(root, 'devos'));
  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'BOOTSTRAP_REPAIR_REQUIRED');
});
