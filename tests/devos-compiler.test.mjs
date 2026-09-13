import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
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

test('bootstrap apply is non-destructive and becomes a coherent DevOS after re-inventory', async () => {
  const root = await tempRepo('devos-apply-');
  await writeFile(path.join(root, 'AGENTS.md'), '# Existing instructions\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { test: 'node --test', build: 'node build.mjs' } }));

  const profile = compileDevosProfile(await inventoryRepository(root));
  const first = await applyBootstrap(root, profile);
  const secondProfile = compileDevosProfile(await inventoryRepository(root));
  const second = await applyBootstrap(root, secondProfile);

  assert.equal(first.state, 'BOOTSTRAP_APPLIED');
  assert.ok(first.created.includes('devos/project.json'));
  assert.ok(!first.created.includes('AGENTS.md'));
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), '# Existing instructions\n');
  assert.equal(secondProfile.mode, 'DEVOS_PRESENT');
  assert.equal(second.state, 'NOOP_EXISTING_OPERATING_LAYER');
});

test('coherent existing DevOS is reused instead of duplicated', async () => {
  const root = await tempRepo('devos-present-');
  await mkdir(path.join(root, 'devos', 'knowledge'), { recursive: true });
  await mkdir(path.join(root, 'devos', 'contracts'), { recursive: true });
  await writeFile(path.join(root, 'devos', 'README.md'), '# Existing DevOS\n');
  await writeFile(path.join(root, 'devos', 'project.json'), JSON.stringify({ devos_profile: 'CUSTOM' }));

  const profile = compileDevosProfile(await inventoryRepository(root));
  const result = await applyBootstrap(root, profile);

  assert.equal(profile.mode, 'DEVOS_PRESENT');
  assert.equal(profile.target_root, 'devos');
  assert.equal(result.state, 'NOOP_EXISTING_OPERATING_LAYER');
});

test('coherent repository agent OS counts as an equivalent operating layer', async () => {
  const root = await tempRepo('devos-equivalent-');
  await mkdir(path.join(root, 'docs', 'agent-system', 'context'), { recursive: true });
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

test('nonexistent repository root fails closed before mutation', async () => {
  const parent = await tempRepo('devos-missing-parent-');
  const missing = path.join(parent, 'typo-repository');

  await assert.rejects(() => inventoryRepository(missing), /Repository root does not exist/);
  assert.equal(await pathExists(missing), false);
});

test('absolute and parent-traversing DevOS roots are rejected', async () => {
  const root = await tempRepo('devos-boundary-');
  const inventory = await inventoryRepository(root);

  assert.throws(() => compileDevosProfile(inventory, { devosRoot: '../shared' }), /DevOS root escapes/);
  assert.throws(() => compileDevosProfile(inventory, { devosRoot: path.join(root, 'outside') }), /repository-relative/);
  assert.equal(await pathExists(path.join(path.dirname(root), 'shared')), false);
});

test('interrupted known minimal bootstrap resumes missing files non-destructively', async () => {
  const root = await tempRepo('devos-repair-');
  await mkdir(path.join(root, 'devos'), { recursive: true });
  await writeFile(path.join(root, 'devos', 'project.json'), JSON.stringify({ devos_profile: 'MINIMAL_BOOTSTRAP' }));
  await writeFile(path.join(root, 'devos', 'README.md'), '# Partial bootstrap\n');

  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'BOOTSTRAP_REPAIR');
  assert.ok(profile.repair_missing_files.includes('research-policy.json'));

  const result = await applyBootstrap(root, profile);
  assert.equal(result.state, 'BOOTSTRAP_REPAIRED');
  assert.equal(await readFile(path.join(root, 'devos', 'README.md'), 'utf8'), '# Partial bootstrap\n');
  assert.equal(await pathExists(path.join(root, 'devos', 'research-policy.json')), true);

  const finalProfile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(finalProfile.mode, 'DEVOS_PRESENT');
});

test('unrecognized DevOS path conflicts and refuses mutation', async () => {
  const root = await tempRepo('devos-conflict-');
  await mkdir(path.join(root, 'devos'));
  await writeFile(path.join(root, 'devos', 'unrelated.txt'), 'not a devos');

  const profile = compileDevosProfile(await inventoryRepository(root));
  assert.equal(profile.mode, 'DEVOS_PATH_CONFLICT');
  await assert.rejects(() => applyBootstrap(root, profile), /not a coherent DevOS/);
  assert.equal(await pathExists(path.join(root, 'devos', 'project.json')), false);
});
