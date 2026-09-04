import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA40 = /\b[0-9a-f]{40}\b/i;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function issue(code, file, message) {
  return { code, file, message };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(root) {
  if (!(await exists(root))) return [];
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'outputs', 'dist', '.next'].includes(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await walkFiles(full));
    else out.push(full);
  }
  return out;
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontmatter(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return null;
  const fields = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) fields[match[1]] = stripQuotes(match[2]);
  }
  return fields;
}

export function validateSkillFrontmatter(text, expectedName, file = 'SKILL.md') {
  const problems = [];
  const fm = parseFrontmatter(text);
  if (!fm) return [issue('SKILL_FRONTMATTER_INVALID', file, 'SKILL.md must begin with closed YAML frontmatter.')];
  if (!fm.name || !SKILL_NAME.test(fm.name)) problems.push(issue('SKILL_FRONTMATTER_INVALID', file, 'Skill name must be lowercase kebab-case.'));
  if (fm.name !== expectedName) problems.push(issue('SKILL_NAME_MISMATCH', file, `Frontmatter name ${fm.name || '<missing>'} does not match directory ${expectedName}.`));
  if (!fm.description || fm.description.trim().length < 12) problems.push(issue('SKILL_FRONTMATTER_INVALID', file, 'Skill description is missing or too weak for discovery.'));
  return problems;
}

function parseYamlScalar(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? stripQuotes(match[1]) : null;
}

function parseYamlList(text, key) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start === -1) return [];
  const values = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^\s{2}-\s+(.+)$/);
    if (match) values.push(stripQuotes(match[1]));
    else if (line.trim() && !/^\s/.test(line)) break;
  }
  return values;
}

export function isGovernanceExpired(validThrough, now = new Date()) {
  if (!validThrough || !/^\d{4}-\d{2}-\d{2}$/.test(validThrough)) return true;
  const end = new Date(`${validThrough}T23:59:59.999Z`);
  return Number.isNaN(end.getTime()) || now.getTime() > end.getTime();
}

function extractMarkdownTargets(text) {
  const targets = [];
  const regex = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of text.matchAll(regex)) targets.push(match[1].trim());
  return targets;
}

function normalizeMarkdownTarget(raw) {
  let target = raw.trim();
  if (target.startsWith('<') && target.includes('>')) target = target.slice(1, target.indexOf('>'));
  else target = target.split(/\s+["']/)[0];
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(target) || target.startsWith('#')) return null;
  target = target.split('#')[0].split('?')[0];
  if (!target) return null;
  try { target = decodeURIComponent(target); } catch {}
  return target;
}

async function validateMarkdownLinks(root, file) {
  const text = await readFile(file, 'utf8');
  const problems = [];
  for (const raw of extractMarkdownTargets(text)) {
    const target = normalizeMarkdownTarget(raw);
    if (!target) continue;
    const resolved = target.startsWith('/')
      ? path.join(root, target.slice(1))
      : path.resolve(path.dirname(file), target);
    if (!(await exists(resolved))) {
      problems.push(issue('DOC_LINK_BROKEN', path.relative(root, file), `Local Markdown target does not exist: ${raw}`));
    }
  }
  return problems;
}

export function validateAntiPatternBlock(block, file = 'anti-pattern.md') {
  const problems = [];
  const id = block.match(/`(AP-[^`]+)`/)?.[1] || '<unknown>';
  const evidenceState = block.match(/\*\*Evidence state:\*\*\s*`([^`]+)`/i)?.[1];
  const promotionLine = block.match(/\*\*Promotion state:\*\*\s*(.+)/i)?.[1] || '';
  const sourceLine = block.match(/\*\*Source evidence:\*\*\s*(.+)/i)?.[1] || '';
  if (['CONFIRMED', 'VALIDATED_LOCAL'].includes(evidenceState)) {
    if (!SHA40.test(sourceLine)) problems.push(issue('ANTI_PATTERN_PROVENANCE_MISSING', file, `${id} is ${evidenceState} without an immutable 40-character head/artifact identity in Source evidence.`));
    if (!/(review|thread|comment|CI run|process disposition|regression|commit|artifact)/i.test(sourceLine)) {
      problems.push(issue('ANTI_PATTERN_PROVENANCE_MISSING', file, `${id} lacks a specific review/run/process evidence edge.`));
    }
  }
  return { problems, promotionLine, id };
}

async function validateAntiPatterns(root) {
  const dir = path.join(root, 'docs/agent-system/anti-patterns/candidates');
  const ruleDir = path.join(root, 'docs/agent-system/pr-rules');
  const problems = [];
  const ruleCorpus = (await walkFiles(ruleDir)).filter((file) => file.endsWith('.md'));
  const ruleText = (await Promise.all(ruleCorpus.map((file) => readFile(file, 'utf8')))).join('\n');
  for (const file of (await walkFiles(dir)).filter((f) => f.endsWith('.md'))) {
    const text = await readFile(file, 'utf8');
    const starts = [...text.matchAll(/^##\s+`AP-[^`]+`.*$/gm)].map((match) => match.index);
    for (let i = 0; i < starts.length; i += 1) {
      const block = text.slice(starts[i], starts[i + 1] ?? text.length);
      const result = validateAntiPatternBlock(block, path.relative(root, file));
      problems.push(...result.problems);
      if (/PROMOTED_(?:AREA|COMMON)/.test(result.promotionLine)) {
        const target = result.promotionLine.match(/`?(PR-[A-Z]+-\d+)`?/)?.[1];
        if (!target || !ruleText.includes(target)) problems.push(issue('PROMOTED_RULE_TARGET_MISSING', path.relative(root, file), `${result.id} claims promotion but its target rule is absent.`));
      }
    }
  }
  return problems;
}

async function validateIndexedRecords(root, handoff, knowledge) {
  const problems = [];
  const featureRoot = path.join(root, 'docs/agent-system/features');
  const featureIndex = `${await readFile(path.join(featureRoot, 'README.md'), 'utf8')}\n${handoff}\n${knowledge}`;
  for (const file of await walkFiles(featureRoot)) {
    if (!file.endsWith('.md') || /(?:README|FEATURE_DOSSIER_TEMPLATE)\.md$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const featureId = text.match(/^feature_id:\s*(\S+)/m)?.[1];
    if (!featureId) problems.push(issue('FEATURE_DOSSIER_INVALID', path.relative(root, file), 'Feature dossier is missing feature_id.'));
    const rel = path.relative(root, file).replaceAll('\\', '/');
    if (!featureIndex.includes(featureId || '__missing__') && !featureIndex.includes(rel) && !featureIndex.includes(path.basename(file))) {
      problems.push(issue('FEATURE_DOSSIER_ORPHANED', rel, 'Feature dossier is not discoverable from the feature index, handoff, or knowledge index.'));
    }
  }

  const decisionRoot = path.join(root, 'docs/agent-system/decisions');
  const decisionIndex = `${await readFile(path.join(decisionRoot, 'README.md'), 'utf8')}\n${handoff}\n${knowledge}`;
  for (const file of await walkFiles(decisionRoot)) {
    if (!file.endsWith('.md') || /(?:README|ADR_TEMPLATE)\.md$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const id = text.match(/^#\s+(ADR-\d+)/m)?.[1];
    const state = text.match(/^State:\s*`([^`]+)`/m)?.[1];
    if (!id || !state || !text.includes('## Authority boundary') || !text.includes('## Repository evidence')) {
      problems.push(issue('ADR_INVALID', path.relative(root, file), 'ADR is missing required identity/state/authority/evidence structure.'));
    }
    if (id && !['SUPERSEDED', 'DEPRECATED'].includes(state) && !decisionIndex.includes(id) && !decisionIndex.includes(path.basename(file))) {
      problems.push(issue('ADR_ORPHANED', path.relative(root, file), `${id} is active but not discoverable from the decision index/handoff/knowledge index.`));
    }
  }

  const planRoot = path.join(root, 'docs/agent-system/exec-plans');
  const planIndex = `${await readFile(path.join(planRoot, 'README.md'), 'utf8')}\n${handoff}\n${knowledge}`;
  for (const file of await walkFiles(planRoot)) {
    if (!file.endsWith('.md') || /(?:README|EXEC_PLAN_TEMPLATE)\.md$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    const state = text.match(/^State:\s*`([^`]+)`/m)?.[1];
    if (!state || !text.includes('## Repository baseline') || !text.includes('## Verification') || !text.includes('## Completion / handoff')) {
      problems.push(issue('EXEC_PLAN_INVALID', path.relative(root, file), 'Execution plan is missing required state/baseline/verification/handoff structure.'));
    }
    if (state && ['DRAFT', 'ACTIVE', 'BLOCKED'].includes(state) && !planIndex.includes(path.basename(file))) {
      problems.push(issue('ACTIVE_PLAN_NOT_IN_HANDOFF', path.relative(root, file), 'Active execution plan is not discoverable from the plan index, handoff, or knowledge index.'));
    }
  }
  return problems;
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function currentHead() {
  if (process.env.AIOS_AUDIT_HEAD_SHA) return process.env.AIOS_AUDIT_HEAD_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; }
}

export async function auditRepository(root = process.cwd(), { now = new Date() } = {}) {
  const problems = [];
  const configPath = path.join(root, 'config/agent-system-audit.json');
  const config = await loadJson(configPath);

  const skillRoot = path.join(root, '.github/skills');
  const actualSkills = (await readdir(skillRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const expectedSkills = config.required_skills.map((item) => item.name).sort();
  if (JSON.stringify(actualSkills) !== JSON.stringify(expectedSkills)) problems.push(issue('SKILL_REGISTRY_DRIFT', '.github/skills', `Installed skill directories ${actualSkills.join(', ')} do not match registry ${expectedSkills.join(', ')}.`));

  for (const binding of config.required_skills) {
    const skillFile = path.join(skillRoot, binding.name, 'SKILL.md');
    if (!(await exists(skillFile))) {
      problems.push(issue('SKILL_FILE_MISSING', path.relative(root, skillFile), 'Registered skill has no SKILL.md.'));
      continue;
    }
    problems.push(...validateSkillFrontmatter(await readFile(skillFile, 'utf8'), binding.name, path.relative(root, skillFile)));
    const agentFile = path.join(root, binding.agent);
    if (!(await exists(agentFile))) problems.push(issue('SKILL_BINDING_MISSING', binding.agent, `${binding.role} agent profile is missing.`));
    else {
      const agentText = await readFile(agentFile, 'utf8');
      const expectedRef = `.github/skills/${binding.name}/SKILL.md`;
      if (!agentText.includes(expectedRef)) problems.push(issue('SKILL_BINDING_MISSING', binding.agent, `${binding.role} does not reference ${expectedRef}.`));
    }
  }

  const markdownFiles = new Set();
  for (const rel of config.audit_markdown_roots) for (const file of await walkFiles(path.join(root, rel))) if (file.endsWith('.md')) markdownFiles.add(file);
  for (const rel of config.audit_markdown_files) if (await exists(path.join(root, rel))) markdownFiles.add(path.join(root, rel));
  for (const file of markdownFiles) problems.push(...await validateMarkdownLinks(root, file));

  const lockPath = path.join(root, config.governance_lock);
  const lock = await readFile(lockPath, 'utf8');
  const phase = Number(parseYamlScalar(lock, 'repository_autonomy_phase'));
  const validThrough = parseYamlScalar(lock, config.governance_valid_through_key);
  if (!Number.isInteger(phase) || phase < config.minimum_repository_autonomy_phase) problems.push(issue('GOVERNANCE_LOCK_PHASE_INVALID', config.governance_lock, `repository_autonomy_phase must be >= ${config.minimum_repository_autonomy_phase}.`));
  if (parseYamlScalar(lock, 'organization_audit_state') !== 'ACTIVE') problems.push(issue('GOVERNANCE_AUDIT_NOT_ACTIVE', config.governance_lock, 'organization_audit_state must be ACTIVE.'));
  if (isGovernanceExpired(validThrough, now)) problems.push(issue('GOVERNANCE_LOCK_STALE', config.governance_lock, `Governance lock expired or lacks valid ${config.governance_valid_through_key}: ${validThrough || '<missing>'}.`));
  const lockSkills = parseYamlList(lock, 'installed_skills').sort();
  if (JSON.stringify(lockSkills) !== JSON.stringify(expectedSkills)) problems.push(issue('GOVERNANCE_SKILL_DRIFT', config.governance_lock, 'installed_skills does not match the audited skill registry.'));

  const handoff = await readFile(path.join(root, config.handoff), 'utf8');
  const knowledge = await readFile(path.join(root, config.knowledge_index), 'utf8');
  const handoffPhase = Number(handoff.match(/REPO_AUTONOMY_PHASE_(\d+)/)?.[1]);
  if (handoffPhase !== phase) problems.push(issue('HANDOFF_PHASE_MISMATCH', config.handoff, `Handoff phase ${handoffPhase || '<missing>'} does not match governance phase ${phase}.`));
  const nextActions = handoff.split('## Next repository actions')[1]?.split(/^## /m)[0] || '';
  for (const match of nextActions.matchAll(/Phase\s+(\d+):/g)) {
    if (Number(match[1]) <= phase) problems.push(issue('HANDOFF_PHASE_STALE', config.handoff, `Next actions still advertise Phase ${match[1]} while current phase is ${phase}.`));
  }

  problems.push(...await validateAntiPatterns(root));
  problems.push(...await validateIndexedRecords(root, handoff, knowledge));

  const counts = {};
  for (const problem of problems) counts[problem.code] = (counts[problem.code] || 0) + 1;
  return {
    schema_name: 'AgentSystemAuditReport',
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    audited_head_sha: currentHead(),
    state: problems.length ? 'FAIL' : 'PASS',
    checks: {
      skill_frontmatter_and_registry: true,
      role_to_skill_bindings: true,
      repository_relative_markdown_links: true,
      governance_lock_freshness: true,
      anti_pattern_provenance: true,
      feature_decision_plan_indexing: true,
      handoff_phase_drift: true
    },
    issue_counts: counts,
    issues: problems.sort((a, b) => `${a.code}:${a.file}`.localeCompare(`${b.code}:${b.file}`))
  };
}

async function main() {
  const reportIndex = process.argv.indexOf('--report');
  const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
  const now = process.env.AIOS_AUDIT_NOW ? new Date(process.env.AIOS_AUDIT_NOW) : new Date();
  const report = await auditRepository(process.cwd(), { now });
  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (report.state === 'PASS') console.log('Agent-system audit PASS');
  else {
    console.error(`Agent-system audit FAIL (${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})`);
    for (const item of report.issues) console.error(`${item.code} ${item.file}: ${item.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
