import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGovernanceExpired,
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
