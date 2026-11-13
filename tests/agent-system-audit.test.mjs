import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGovernanceExpired,
  classifyCiAuditScope,
  auditRepository,
  parseFrontmatter,
  validateAntiPatternBlock,
  validateSkillFrontmatter
} from '../scripts/agent-system/audit.mjs';

test('skill frontmatter requires name and useful description', () => {
  const missingDescription = '---\nname: plan-feature\n---\n# Plan Feature\n';
  assert.equal(parseFrontmatter(missingDescription).name, 'plan-feature');
  assert.ok(validateSkillFrontmatter(missingDescription, 'plan-feature').some((problem) => problem.code === 'SKILL_FRONTMATTER_INVALID'));
});

test('skill frontmatter name must match its directory', () => {
  const text = '---\nname: wrong-skill\ndescription: A sufficiently detailed discovery description.\n---\n';
  assert.ok(validateSkillFrontmatter(text, 'plan-feature').some((problem) => problem.code === 'SKILL_NAME_MISMATCH'));
});

test('governance freshness fails after valid-through date', () => {
  assert.equal(isGovernanceExpired('2026-10-04', new Date('2026-10-04T12:00:00Z')), false);
  assert.equal(isGovernanceExpired('2026-10-04', new Date('2026-10-05T00:00:00Z')), true);
  assert.equal(isGovernanceExpired(null, new Date('2026-09-04T00:00:00Z')), true);
});

test('confirmed anti-pattern requires immutable source evidence', () => {
  const broken = '## `AP-X-001` — Broken\n- **Source evidence:** PR #1 only.\n- **Evidence state:** `CONFIRMED`.\n- **Promotion state:** `NONE`.\n';
  assert.ok(validateAntiPatternBlock(broken).problems.some((problem) => problem.code === 'ANTI_PATTERN_PROVENANCE_MISSING'));

  const valid = '## `AP-X-002` — Bound\n- **Source evidence:** head `0123456789abcdef0123456789abcdef01234567`; review `R1`; thread `T1`.\n- **Evidence state:** `VALIDATED_LOCAL`.\n- **Promotion state:** `NONE`.\n';
  assert.equal(validateAntiPatternBlock(valid).problems.length, 0);
});

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const ctx = (changedPaths, overrides = {}) => ({
  eventName: 'pull_request',
  baseSha: base,
  headSha: head,
  checkedOutHead: head,
  changedPaths,
  ...overrides,
});

test('scoped CI: ordinary feature work reports stale snapshot separately', () => {
  assert.equal(classifyCiAuditScope(ctx(['app/page.tsx', 'tests/evaluate.test.mjs', 'package.json'])), 'STRUCTURAL_WITH_STALE_WARNING');
});

test('scoped CI: governance edits always use strict freshness', () => {
  for (const file of [
    'docs/agent-system/context/governance-lock.yaml',
    '.github/workflows/agent-system-audit.yml',
    '.github/workflows/ci.yml',
    'scripts/agent-system/audit.mjs',
    'config/agent-system-audit.json',
    'server/coding-harness/index.ts',
    '.github/skills/sync-governance/SKILL.md',
  ]) {
    assert.equal(classifyCiAuditScope(ctx([file])), 'STRICT', file);
  }
});

test('scoped CI: unknown or tampered identity fails closed', () => {
  assert.equal(classifyCiAuditScope(ctx(['app/page.tsx'], { eventName: 'push' })), 'STRICT');
  assert.equal(classifyCiAuditScope(ctx(['app/page.tsx'], { headSha: 'bad' })), 'STRICT');
  assert.equal(classifyCiAuditScope(ctx(['app/page.tsx'], { checkedOutHead: base })), 'STRICT');
  assert.equal(classifyCiAuditScope(ctx([])), 'STRICT');
  assert.equal(classifyCiAuditScope(ctx(['../governance-lock.yaml'])), 'STRICT');
});

test('strict audit still blocks expired lock; narrowly scoped audit emits an explicit warning', async () => {
  const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:\/)/, '$1');
  const now = new Date('2026-11-12T12:00:00.000Z');
  const strict = await auditRepository(root, { now });
  assert.equal(strict.state, 'FAIL');
  assert.ok(strict.issues.some(item => item.code === 'GOVERNANCE_LOCK_STALE'));
  const scoped = await auditRepository(root, { now, staleSnapshotWarning: true });
  assert.equal(scoped.state, 'PASS_WITH_WARNINGS');
  assert.equal(scoped.audit_mode, 'STRUCTURAL_WITH_STALE_WARNING');
  assert.equal(scoped.checks.governance_lock_freshness, false);
  assert.ok(scoped.warnings.some(item => item.code === 'GOVERNANCE_LOCK_STALE'));
  assert.deepEqual(scoped.issues, []);
});

test('skill frontmatter accepts CRLF on Windows without weakening name validation', () => {
  const lf = '---\nname: verify-head\ndescription: Valid executable verifier skill.\n---\n';
  assert.equal(parseFrontmatter(lf.replace(/\n/g, '\r\n')).name, 'verify-head');
  assert.deepEqual(validateSkillFrontmatter(lf.replace(/\n/g, '\r\n'), 'verify-head'), []);
  assert.ok(validateSkillFrontmatter(lf.replace(/\n/g, '\r\n'), 'other-skill').some(i => i.code === 'SKILL_NAME_MISMATCH'));
});

test('governance freshness cannot abort functional tests before spatial and release checks', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.ok(pkg.scripts.test.includes('npm run test:spatial-compiler'));
  assert.ok(pkg.scripts.test.includes('npm run check:public-release'));
  assert.ok(!pkg.scripts.test.includes('npm run check:agent-system:ci'));
  assert.match(ci, /name: Audit governance scope independently\s+if: always\(\)\s+run: npm run check:agent-system:ci/);
  assert.ok(ci.indexOf('name: Build and test') < ci.indexOf('name: Audit governance scope independently'));
});
