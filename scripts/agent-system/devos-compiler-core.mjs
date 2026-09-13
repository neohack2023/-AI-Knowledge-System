import { access, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_DEVOS_ROOT = 'devos';
export const SCHEMA_VERSION = '1.1';

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; }
}

async function listDirectoryNames(root, relative) {
  try {
    return (await readdir(path.join(root, relative), { withFileTypes: true }))
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch { return []; }
}

function unique(values) { return [...new Set(values)].sort(); }

export async function resolveRepositoryRoot(root) {
  const requested = path.resolve(root);
  try { await access(requested); } catch {
    throw new Error(`TARGET_REPOSITORY_NOT_FOUND: ${requested}`);
  }
  const info = await stat(requested);
  if (!info.isDirectory()) throw new Error(`TARGET_REPOSITORY_NOT_DIRECTORY: ${requested}`);
  return realpath(requested);
}

export function resolveWithinRoot(root, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`DEVOS_PATH_OUTSIDE_REPOSITORY: ${relativePath || '<empty>'}`);
  }
  const normalized = path.normalize(relativePath);
  const target = path.resolve(root, normalized);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`DEVOS_PATH_OUTSIDE_REPOSITORY: ${relativePath}`);
  }
  return target;
}

async function isCoherentDevos(root, candidate) {
  const required = [
    `${candidate}/README.md`,
    `${candidate}/project.json`,
    `${candidate}/adaptation-profile.json`,
    `${candidate}/research-policy.json`,
    `${candidate}/knowledge/README.md`,
    `${candidate}/anti-patterns/README.md`,
    `${candidate}/receipts/README.md`
  ];
  return (await Promise.all(required.map((item) => exists(path.join(root, item))))).every(Boolean);
}

async function isCoherentRepoOs(root) {
  return exists(path.join(root, 'docs/agent-system/README.md'));
}

export async function inventoryRepository(root = process.cwd()) {
  const resolvedRoot = await resolveRepositoryRoot(root);
  const top = await readdir(resolvedRoot, { withFileTypes: true });
  const names = new Set(top.map((entry) => entry.name));
  const topFiles = top.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const packageJson = names.has('package.json') ? await readJson(path.join(resolvedRoot, 'package.json')) : null;
  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};

  const languages = [];
  if (names.has('tsconfig.json')) languages.push('typescript');
  if (names.has('package.json')) languages.push('javascript');
  if (['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'].some((x) => names.has(x))) languages.push('python');
  if (names.has('Cargo.toml')) languages.push('rust');
  if (names.has('go.mod')) languages.push('go');
  if (topFiles.some((x) => x.endsWith('.sln') || x.endsWith('.csproj'))) languages.push('csharp');
  if (['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some((x) => names.has(x))) languages.push('jvm');
  if (['CMakeLists.txt', 'meson.build'].some((x) => names.has(x))) languages.push('cpp');

  const instructionSurfaces = [];
  for (const candidate of ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursor/rules']) {
    if (await exists(path.join(resolvedRoot, candidate))) instructionSurfaces.push(candidate);
  }

  const devosCandidates = [];
  for (const candidate of ['devos', '.devos']) {
    if (await exists(path.join(resolvedRoot, candidate))) {
      devosCandidates.push({ path: candidate, coherent: await isCoherentDevos(resolvedRoot, candidate) });
    }
  }

  const repoOsCoherent = await isCoherentRepoOs(resolvedRoot);
  const workflows = await listDirectoryNames(resolvedRoot, '.github/workflows');
  const testSurfaces = [];
  for (const candidate of ['tests', 'test', '__tests__', 'spec']) {
    if (await exists(path.join(resolvedRoot, candidate))) testSurfaces.push(candidate);
  }

  const packageWorkspaces = Array.isArray(packageJson?.workspaces)
    ? packageJson.workspaces
    : Array.isArray(packageJson?.workspaces?.packages)
      ? packageJson.workspaces.packages
      : [];
  const monorepoMarkers = [packageWorkspaces.length > 0, names.has('pnpm-workspace.yaml'), names.has('lerna.json'), names.has('nx.json'), names.has('turbo.json')];

  const verification = {};
  for (const key of ['test', 'lint', 'build', 'typecheck', 'check']) {
    if (typeof scripts[key] === 'string') verification[key] = scripts[key];
  }

  const maturitySignals = [workflows.length > 0, testSurfaces.length > 0, instructionSurfaces.length > 0, names.has('CONTRIBUTING.md'), names.has('SECURITY.md')].filter(Boolean).length;

  return {
    schema_name: 'DevOSRepositoryInventory',
    schema_version: SCHEMA_VERSION,
    root: resolvedRoot,
    top_level_entries: [...names].sort(),
    languages: unique(languages),
    package_manager: names.has('pnpm-lock.yaml') ? 'pnpm' : names.has('yarn.lock') ? 'yarn' : names.has('package-lock.json') ? 'npm' : null,
    architecture: monorepoMarkers.some(Boolean) ? 'MONOREPO' : 'SINGLE_ROOT',
    maturity: maturitySignals >= 3 ? 'ESTABLISHED' : maturitySignals >= 1 ? 'EMERGING' : 'GREENFIELD',
    instruction_surfaces: unique(instructionSurfaces),
    devos_candidates: devosCandidates,
    devos_roots: devosCandidates.filter((item) => item.coherent).map((item) => item.path),
    incomplete_devos_roots: devosCandidates.filter((item) => !item.coherent).map((item) => item.path),
    repository_os_surface: repoOsCoherent ? 'docs/agent-system' : null,
    workflow_files: workflows,
    test_surfaces: testSurfaces,
    verification_commands: verification
  };
}

export function compileDevosProfile(inventory, { devosRoot = DEFAULT_DEVOS_ROOT } = {}) {
  resolveWithinRoot(inventory.root, devosRoot);
  const existingDevos = inventory.devos_roots?.[0] || null;
  const incompleteDevos = !existingDevos ? inventory.incomplete_devos_roots?.[0] || null : null;
  const equivalentRepoOs = !existingDevos && !incompleteDevos && inventory.repository_os_surface ? inventory.repository_os_surface : null;
  const mode = existingDevos ? 'DEVOS_PRESENT' : incompleteDevos ? 'BOOTSTRAP_REPAIR_REQUIRED' : equivalentRepoOs ? 'EQUIVALENT_REPO_OS_PRESENT' : 'BOOTSTRAP_REQUIRED';
  const targetRoot = existingDevos || incompleteDevos || equivalentRepoOs || devosRoot;
  resolveWithinRoot(inventory.root, targetRoot);

  return {
    schema_name: 'DevOSAdaptationProfile',
    schema_version: SCHEMA_VERSION,
    mode,
    target_root: targetRoot,
    repository_shape: { architecture: inventory.architecture, maturity: inventory.maturity, languages: inventory.languages, instruction_surfaces: inventory.instruction_surfaces, verification_commands: inventory.verification_commands },
    authority: { live_repository_execution: 'GIT_REPOSITORY', devos_role: 'REPOSITORY_LOCAL_COGNITION_AND_ROUTING_PROJECTION', external_memory_role: 'UPSTREAM_DURABLE_MEMORY_OR_GOVERNANCE_WHEN_DECLARED', research_authority_effect: 'NONE' },
    retrieval_order: ['LIVE_REPOSITORY_STATE','REPOSITORY_DEVOS_OR_EQUIVALENT_LOCAL_CONTEXT','BOUNDED_UPSTREAM_MEMORY_WHEN_TRIGGERED','LIVE_PUBLIC_RESEARCH_WHEN_LOCAL_AND_UPSTREAM_KNOWLEDGE_ARE_INSUFFICIENT_OR_STALE'],
    components: {
      local_context_bundle: ['BOOTSTRAP_REQUIRED','BOOTSTRAP_REPAIR_REQUIRED'].includes(mode) ? 'INSTALL_OR_REPAIR_MINIMAL' : 'REUSE',
      agent_router: inventory.instruction_surfaces.includes('AGENTS.md') ? 'REUSE' : ['BOOTSTRAP_REQUIRED','BOOTSTRAP_REPAIR_REQUIRED'].includes(mode) ? 'INSTALL_MINIMAL' : 'ADAPT_IF_NEEDED',
      research_preflight: 'REQUIRED', negative_knowledge: 'REQUIRED', applied_learning: 'SCAFFOLD_GOVERNED',
      runtime_database: inventory.maturity === 'ESTABLISHED' ? 'OPTIONAL_AFTER_MEASURED_NEED' : 'DEFER',
      repository_native_skills: 'INSTALL_ONLY_WHEN_REPEATABLE_AND_TESTABLE', upstream_sync: 'TRIGGERED_NOT_BOOTSTRAP'
    },
    research_triggers: ['EXTERNAL_UNCERTAINTY','BLOCKER','CAPABILITY_GAP','STALE_EVIDENCE','WEAK_COMPARISON','DESIGN_DEAD_END','FEATURE_INCUBATION','OPPORTUNITY_WINDOW'],
    learning_states: ['OBSERVED','RESEARCH_SUPPORTED','LOCALLY_VALIDATED','REPEATED','REUSABLE_CANDIDATE','DEPRECATED'],
    bootstrap_policy: { overwrite_existing_files: false, repair_incomplete_scaffold: true, require_existing_repository_root: true, enforce_repository_path_boundary: true, copy_external_memory_corpus: false, research_auto_promotes: false, negative_knowledge_auto_promotes: false, normal_repo_work_external_fetch_required: false }
  };
}

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function renderDevosReadme(profile) { return `# Development OS\n\nRepository-local cognition and routing for normal development.\n\n- Normal repository work is local-first.\n- Research is candidate-only and authority-neutral.\n- Bootstrap never overwrites existing files.\n- Generated paths must stay inside the resolved repository root.\n- Incomplete bootstrap state is repaired non-destructively.\n- Runtime databases and specialist machinery require measured need.\n\nMode: \`${profile.mode}\`\n`; }
function renderAgentRouter(profile) { return `# Repository Agent Instructions\n\n1. Read \`${profile.target_root}/README.md\` and \`${profile.target_root}/project.json\`.\n2. Treat repository code, tests, CI, and accepted docs as execution truth.\n3. Use external memory only under declared triggers.\n4. Keep research candidate-only until repository evaluation validates it.\n5. Preserve useful failures in \`${profile.target_root}/anti-patterns/\`.\n`; }
function renderKnowledgeReadme() { return '# DevOS Knowledge\n\nMaturity: OBSERVED → RESEARCH_SUPPORTED → LOCALLY_VALIDATED → REPEATED → REUSABLE_CANDIDATE. Use DEPRECATED when superseded.\n\nRepresentations: EPISODIC, SEMANTIC, PROCEDURAL, NEGATIVE.\n'; }
function renderAntiPatternsReadme() { return '# DevOS Anti-Patterns\n\nCapture problem, why it looked reasonable, failure mode, detection signals, preferred pattern, evidence, regressions, scope, and promotion state. Failure records do not self-promote.\n'; }
function renderReceiptsReadme() { return '# DevOS Receipts\n\nKeep bootstrap, research, evaluation, and promotion receipts with exact repository/artifact identity when available. Do not store secrets, hidden reasoning, or raw private external-memory content.\n'; }
function researchPolicy(profile) { return { schema_version: 1, role: 'RESEARCH_SCOUT', autonomous_preflight: true, authority_effect: 'NONE', promotion_state: 'CANDIDATE_ONLY', trigger_policy: profile.research_triggers, source_policy: { evidence_preference: ['STANDARD_OR_SPECIFICATION','PRIMARY_DOCUMENTATION','SOURCE_REPOSITORY','RELEASE_NOTES','RESEARCH_PAPER','MAINTAINER_ENGINEERING_NOTE','REPRODUCIBLE_BENCHMARK'], inspiration_allowed: ['POSTMORTEM','CONFERENCE_TALK','DESIGN_ANALYSIS','OPEN_SOURCE_IMPLEMENTATION','COMMUNITY_DISCUSSION','DEVELOPER_ANECDOTE'], primary_source_required_for: ['CURRENT_API_BEHAVIOR','PLATFORM_OR_TOOL_VERSION_CAPABILITY','LICENSE_OR_POLICY','SECURITY_RELEVANT_BEHAVIOR'] }, lanes: ['CURRENT_STATE','IMPLEMENTATIONS','FAILURE_MODES','ADJACENT_DESIGN','OPPORTUNITY'], stop_conditions: ['DECISIVE_PRIMARY_EVIDENCE_FOUND','ADDITIONAL_SOURCES_ARE_DERIVATIVE_DUPLICATES','PROJECT_FIT_FAILED','QUESTION_ANSWERED_WITH_SUFFICIENT_CONFIDENCE','CONTINUED_RESEARCH_UNLIKELY_TO_CHANGE_DISPOSITION'] }; }

export function renderBootstrapFiles(profile, { includeAgentRouter = true } = {}) {
  if (!['BOOTSTRAP_REQUIRED','BOOTSTRAP_REPAIR_REQUIRED'].includes(profile.mode)) return {};
  const root = profile.target_root;
  const files = {
    [`${root}/README.md`]: renderDevosReadme(profile),
    [`${root}/project.json`]: json({ schema_version: 1, devos_profile: 'MINIMAL_BOOTSTRAP', normal_repo_work_external_fetch_required: false, authority: profile.authority, retrieval_order: profile.retrieval_order, components: profile.components, learning_states: profile.learning_states }),
    [`${root}/adaptation-profile.json`]: json(profile),
    [`${root}/research-policy.json`]: json(researchPolicy(profile)),
    [`${root}/knowledge/README.md`]: renderKnowledgeReadme(),
    [`${root}/anti-patterns/README.md`]: renderAntiPatternsReadme(),
    [`${root}/receipts/README.md`]: renderReceiptsReadme()
  };
  if (includeAgentRouter && !profile.repository_shape.instruction_surfaces.includes('AGENTS.md')) files['AGENTS.md'] = renderAgentRouter(profile);
  return files;
}

export async function applyBootstrap(root, profile) {
  const resolvedRoot = await resolveRepositoryRoot(root);
  if (!['BOOTSTRAP_REQUIRED','BOOTSTRAP_REPAIR_REQUIRED'].includes(profile.mode)) {
    return { state: 'NOOP_EXISTING_OPERATING_LAYER', created: [], skipped: [], target_root: profile.target_root };
  }
  const files = renderBootstrapFiles(profile);
  const created = [];
  const skipped = [];
  for (const [relative, content] of Object.entries(files)) {
    const target = resolveWithinRoot(resolvedRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    try { await writeFile(target, content, { encoding: 'utf8', flag: 'wx' }); created.push(relative); }
    catch (error) { if (error?.code === 'EEXIST') skipped.push(relative); else throw error; }
  }
  return { state: profile.mode === 'BOOTSTRAP_REPAIR_REQUIRED' ? 'BOOTSTRAP_REPAIRED' : created.length ? 'BOOTSTRAP_APPLIED' : 'BOOTSTRAP_ALREADY_PRESENT', target_root: profile.target_root, created: created.sort(), skipped: skipped.sort() };
}
