import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SHA40 = /^[0-9a-f]{40}$/i;
const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_DELTA_STATES = new Set(['NO_MATERIAL_DELTA', 'MATERIAL_DELTA_RECONCILED', 'MATERIAL_DELTA_PENDING']);

function issue(code, file, message) {
  return { code, file, message };
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
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

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export function deriveValidThrough(performedOn, freshnessDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(performedOn) || !Number.isInteger(freshnessDays) || freshnessDays < 1) return null;
  const date = new Date(`${performedOn}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + freshnessDays);
  return date.toISOString().slice(0, 10);
}

export function receiptDigest(text) {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function validateGovernanceSyncReceipt(receipt, {
  requiredSources = [],
  expectedSyncId = null,
  expectedPerformedOn = null,
  expectedValidThrough = null,
  expectedFreshnessDays = null,
  file = 'governance-sync-receipt.json'
} = {}) {
  const problems = [];
  if (!receipt || receipt.schema_name !== 'GovernanceSyncReceipt' || receipt.schema_version !== '1.0') {
    problems.push(issue('GOVERNANCE_SYNC_RECEIPT_INVALID', file, 'Receipt schema must be GovernanceSyncReceipt v1.0.'));
    return problems;
  }
  if (!/^GSYNC-\d{8}-\d{3}$/.test(receipt.sync_id || '')) problems.push(issue('GOVERNANCE_SYNC_RECEIPT_INVALID', file, 'sync_id must use GSYNC-YYYYMMDD-NNN.'));
  if (expectedSyncId && receipt.sync_id !== expectedSyncId) problems.push(issue('GOVERNANCE_SYNC_ID_MISMATCH', file, `Receipt sync_id ${receipt.sync_id || '<missing>'} does not match lock ${expectedSyncId}.`));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.performed_on || '')) problems.push(issue('GOVERNANCE_SYNC_RECEIPT_INVALID', file, 'performed_on must be YYYY-MM-DD.'));
  if (expectedPerformedOn && receipt.performed_on !== expectedPerformedOn) problems.push(issue('GOVERNANCE_SYNC_DATE_MISMATCH', file, 'Receipt performed_on does not match last_upstream_sync.'));
  if (!SHA40.test(receipt.repository_base_sha || '')) problems.push(issue('GOVERNANCE_SYNC_RECEIPT_INVALID', file, 'repository_base_sha must be an exact 40-character commit SHA.'));
  if (receipt.sync_role !== 'KNOWLEDGE_STEWARD') problems.push(issue('GOVERNANCE_SYNC_ROLE_INVALID', file, 'sync_role must be KNOWLEDGE_STEWARD.'));
  if (receipt.upstream_snapshot_identity_kind !== 'NOTION_PAGE_ID_PLUS_LAST_EDITED_AT') problems.push(issue('GOVERNANCE_SYNC_SNAPSHOT_INVALID', file, 'Unsupported upstream snapshot identity kind.'));

  const actualSources = Array.isArray(receipt.upstream_sources) ? receipt.upstream_sources : [];
  const actualIds = actualSources.map((source) => source.source_id).sort();
  const requiredIds = [...requiredSources].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(requiredIds)) problems.push(issue('GOVERNANCE_SYNC_SOURCE_SET_MISMATCH', file, `Receipt sources ${actualIds.join(', ')} do not match lock sources ${requiredIds.join(', ')}.`));
  for (const source of actualSources) {
    if (!source.source_id || !PAGE_ID.test(source.page_id || '') || Number.isNaN(Date.parse(source.observed_last_edited_at || ''))) {
      problems.push(issue('GOVERNANCE_SYNC_SNAPSHOT_INVALID', file, `Source ${source.source_id || '<missing>'} lacks a valid opaque page ID or observed last-edited timestamp.`));
    }
  }

  const deltaState = receipt.comparison?.delta_state;
  if (!ALLOWED_DELTA_STATES.has(deltaState)) problems.push(issue('GOVERNANCE_SYNC_DELTA_INVALID', file, `Invalid delta state ${deltaState || '<missing>'}.`));
  if (deltaState === 'MATERIAL_DELTA_PENDING') problems.push(issue('GOVERNANCE_SYNC_DELTA_PENDING', file, 'Material upstream governance drift remains unreconciled; freshness cannot be renewed.'));
  if (deltaState !== 'NO_MATERIAL_DELTA' && !Array.isArray(receipt.comparison?.material_deltas)) problems.push(issue('GOVERNANCE_SYNC_DELTA_INVALID', file, 'Material delta states require material_deltas evidence.'));

  const refresh = receipt.refresh || {};
  if (refresh.applied !== true && deltaState !== 'MATERIAL_DELTA_PENDING') problems.push(issue('GOVERNANCE_SYNC_REFRESH_INVALID', file, 'Reconciled/no-delta synchronization must apply a bounded freshness refresh.'));
  if (deltaState === 'MATERIAL_DELTA_PENDING' && refresh.applied === true) problems.push(issue('GOVERNANCE_SYNC_REFRESH_INVALID', file, 'Pending material delta cannot apply a freshness refresh.'));
  if (refresh.refreshed_on !== receipt.performed_on) problems.push(issue('GOVERNANCE_SYNC_REFRESH_INVALID', file, 'refreshed_on must equal performed_on.'));
  if (!Number.isInteger(refresh.freshness_policy_days) || refresh.freshness_policy_days < 1) problems.push(issue('GOVERNANCE_SYNC_REFRESH_INVALID', file, 'freshness_policy_days must be a positive integer.'));
  if (expectedFreshnessDays !== null && refresh.freshness_policy_days !== expectedFreshnessDays) problems.push(issue('GOVERNANCE_SYNC_FRESHNESS_POLICY_MISMATCH', file, 'Receipt freshness policy does not match governance lock.'));
  const derived = deriveValidThrough(receipt.performed_on, refresh.freshness_policy_days);
  if (!derived || refresh.valid_through_after !== derived) problems.push(issue('GOVERNANCE_SYNC_REFRESH_INVALID', file, `valid_through_after must equal performed_on + freshness policy (${derived || '<invalid>'}).`));
  if (expectedValidThrough && refresh.valid_through_after !== expectedValidThrough) problems.push(issue('GOVERNANCE_SYNC_VALID_THROUGH_MISMATCH', file, 'Receipt valid_through_after does not match governance lock.'));

  const boundary = receipt.authority_boundary || {};
  if (boundary.normal_repo_work_external_fetch_required !== false || boundary.global_authority_cutover !== false || boundary.merge_release_deploy_authority_granted !== false || boundary.private_workspace_urls_in_repository !== false) {
    problems.push(issue('GOVERNANCE_SYNC_AUTHORITY_WIDENING', file, 'Sync receipt authority boundary must preserve local-first work and grant no cutover/terminal authority/private-link admission.'));
  }
  return problems;
}

export async function validateGovernanceSyncState(root = process.cwd()) {
  const problems = [];
  const lockPath = path.join(root, 'docs/agent-system/context/governance-lock.yaml');
  const lock = await readFile(lockPath, 'utf8');
  if (parseYamlScalar(lock, 'upstream_sync_state') !== 'ACTIVE') problems.push(issue('GOVERNANCE_SYNC_NOT_ACTIVE', 'docs/agent-system/context/governance-lock.yaml', 'upstream_sync_state must be ACTIVE.'));

  const receiptRel = parseYamlScalar(lock, 'last_sync_receipt');
  const expectedDigest = parseYamlScalar(lock, 'last_sync_receipt_sha256');
  const syncId = parseYamlScalar(lock, 'last_sync_id');
  const lastSync = parseYamlScalar(lock, 'last_upstream_sync');
  const validThrough = parseYamlScalar(lock, 'valid_through');
  const freshnessDays = Number(parseYamlScalar(lock, 'sync_freshness_days'));
  const requiredSources = parseYamlList(lock, 'upstream_sources');

  if (!receiptRel) return [issue('GOVERNANCE_SYNC_RECEIPT_MISSING', 'docs/agent-system/context/governance-lock.yaml', 'last_sync_receipt is missing.')];
  const receiptPath = path.join(root, receiptRel);
  if (!(await exists(receiptPath))) return [issue('GOVERNANCE_SYNC_RECEIPT_MISSING', receiptRel, 'Governance sync receipt file does not exist.')];
  const receiptText = await readFile(receiptPath, 'utf8');
  const actualDigest = receiptDigest(receiptText);
  if (actualDigest !== expectedDigest) problems.push(issue('GOVERNANCE_SYNC_RECEIPT_DIGEST_MISMATCH', receiptRel, `Receipt digest ${actualDigest} does not match lock ${expectedDigest || '<missing>'}.`));

  if (/https?:\/\/(?:www\.)?(?:notion\.so|app\.notion\.com|drive\.google\.com|docs\.google\.com)\//i.test(receiptText)) {
    problems.push(issue('GOVERNANCE_SYNC_PRIVATE_URL', receiptRel, 'Public sync receipt contains a private workspace URL.'));
  }

  let receipt;
  try { receipt = JSON.parse(receiptText); }
  catch { return [...problems, issue('GOVERNANCE_SYNC_RECEIPT_INVALID', receiptRel, 'Sync receipt is not valid JSON.')]; }
  problems.push(...validateGovernanceSyncReceipt(receipt, {
    requiredSources,
    expectedSyncId: syncId,
    expectedPerformedOn: lastSync,
    expectedValidThrough: validThrough,
    expectedFreshnessDays: freshnessDays,
    file: receiptRel
  }));
  return problems;
}

async function main() {
  const reportIndex = process.argv.indexOf('--report');
  const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
  const problems = await validateGovernanceSyncState(process.cwd());
  const report = {
    schema_name: 'GovernanceSyncValidationReport',
    schema_version: '1.0',
    generated_at: new Date().toISOString(),
    state: problems.length ? 'FAIL' : 'PASS',
    issue_counts: problems.reduce((out, item) => ({ ...out, [item.code]: (out[item.code] || 0) + 1 }), {}),
    issues: problems.sort((a, b) => `${a.code}:${a.file}`.localeCompare(`${b.code}:${b.file}`))
  };
  if (reportPath) {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (report.state === 'PASS') console.log('Governance sync validation PASS');
  else {
    console.error(`Governance sync validation FAIL (${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})`);
    for (const item of report.issues) console.error(`${item.code} ${item.file}: ${item.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
