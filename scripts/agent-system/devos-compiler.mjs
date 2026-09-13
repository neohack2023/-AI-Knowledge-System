import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_DEVOS_ROOT = 'devos';
const SCHEMA_VERSION = '1.0';

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function listTopLevel(root) {
  try {
    return await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function listDirectoryNames(root, relative) {
  try {
    return (await readdir(path.join(root, relative), { withFileTypes: true }))
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values)].sort();
}

export async function inventoryRepository(root = process.cwd()) {
  const resolvedRoot = path.resolve(root);
  const top = await listTopLevel(resolvedRoot);
  const names = new Set(top.map((entry) => entry.name));
  const topFiles = top.filter((entry) => entry.isFile()).map((entry) => entry.name);

  const packageJson = names.has('package.json') ? await readJson(path.join(resolvedRoot, 'package.json')) : null;
  const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {};

  const languages = [];
  if (names.has('tsconfig.json')) languages.push('typescript');
  if (names.has('package.json')) languages.push('javascript');
  if (['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'].some((item) => names.has(item))) languages.push('python');
  if (names.has('Cargo.toml')) languages.push('rust');
  if (names.has('go.mod')) languages.push('go');
  if (topFiles.some((item) => item.endsWith('.sln') || item.endsWith('.csproj'))) languages.push('csharp');
  if (['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some((item) => names.has(item))) languages.push('jvm');
  if (['CMakeLists.txt', 'meson.build'].some((item) => names.has(item))) languages.push('cpp');

  const instructionSurfaces = [];
  for (const candidate of ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursor/rules']) {
    if (await exists(path.join(resolvedRoot, candidate))) instructionSurfaces.push(candidate);
  }

  const devosRoots = [];
  for (const candidate of ['devos', '.devos']) if (await exists(path.join(resolvedRoot, candidate))) devosRoots.push(candidate);
  const hasRepoOs = await exists(path.join(resolvedRoot, 'docs/agent-system'));

  const workflows = await listDirectoryNames(resolvedRoot, '.github/workflows');
  const testSurfaces = [];
  for (const candidate of ['tests', 'test', '__tests__', 'spec']) if (await exists(path.join(resolvedRoot, candidate))) testSurfaces.push(candidate);

  const packageWorkspaces = Array.isArray(packageJson?.workspaces)
    ? packageJson.workspaces
    : Array.isArray(packageJson?.workspaces?.packages)
      ? packageJson.workspaces.packages
      : [];
  const monorepoMarkers = [
    packageWorkspaces.length > 0,
    names.has('pnpm-workspace.yaml'),
    names.has('lerna.json'),
    names.has('nx.json'),
    names.has('turbo.json')
  ];

  const verification = {};
  for (const key of ['test', 'lint', 'build', 'typecheck', 'check']) if (typeof scripts[key] === 'string') verification[key] = scripts[key];

  const maturitySignals = [
    workflows.length > 0,
    testSurfaces.length > 0,
    instructionSurfaces.length > 0,
    names.has('CONTRIBUTING.md'),
    names.has('SECURITY.md')
  ].filter(Boolean).length;

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
    devos_roots: devosRoots,
    repository_os_surface: hasRepoOs ? 'docs/agent-system' : null,
    workflow_files: workflows,
    test_surfaces: testSurfaces,
    verification_commands: verification
  };
}

export function compileDevosProfile(inventory, { devosRoot = DEFAULT_DEVOS_ROOT } = {}) {
  const existingDevos = inventory.devos_roots?.[0] || null;
  const equivalentRepoOs = !existingDevos && inventory.repository_os_surface ? inventory.repository_os_surface : null;
  const mode = existingDevos ? 'DEVOS_PRESENT' : equivalentRepoOs ? 'EQUIVALENT_REPO_OS_PRESENT' : 'BOOTSTRAP_REQUIRED';
  const targetRoot = existingDevos || equivalentRepoOs || devosRoot;

  const runtimeDbDisposition = inventory.maturity === 'ESTABLISHED' ? 'OPTIONAL_AFTER_MEASURED_NEED' : 'DEFER';

  return {
    schema_name: 'DevOSAdaptationProfile',
    schema_version: SCHEMA_VERSION,
    mode,
    target_root: targetRoot,
    repository_shape: {
      architecture: inventory.architecture,
      maturity: inventory.maturity,
      languages: inventory.languages,
      instruction_surfaces: inventory.instruction_surfaces,
      verification_commands: inventory.verification_commands
    },
    authority: {
      live_repository_execution: 'GIT_REPOSITORY',
      devos_role: 'REPOSITORY_LOCAL_COGNITION_AND_ROUTING_PROJECTION',
      external_memory_role: 'UPSTREAM_DURABLE_MEMORY_OR_GOVERNANCE_WHEN_DECLARED',
      research_authority_effect: 'NONE'
    },
    retrieval_order: [
      'LIVE_REPOSITORY_STATE',
      'REPOSITORY_DEVOS_OR_EQUIVALENT_LOCAL_CONTEXT',
      'BOUNDED_UPSTREAM_MEMORY_WHEN_TRIGGERED',
      'LIVE_PUBLIC_RESEARCH_WHEN_LOCAL_AND_UPSTREAM_KNOWLEDGE_ARE_INSUFFICIENT_OR_STALE'
    ],
    components: {
      local_context_bundle: mode === 'BOOTSTRAP_REQUIRED' ? 'INSTALL_MINIMAL' : 'REUSE',
      agent_router: inventory.instruction_surfaces.includes('AGENTS.md') ? 'REUSE' : mode === 'BOOTSTRAP_REQUIRED' ? 'INSTALL_MINIMAL' : 'ADAPT_IF_NEEDED',
      research_preflight: 'REQUIRED',
      negative_knowledge: 'REQUIRED',
      applied_learning: 'SCAFFOLD_GOVERNED',
      runtime_database: runtimeDbDisposition,
      repository_native_skills: 'INSTALL_ONLY_WHEN_REPEATABLE_AND_TESTABLE',
      upstream_sync: 'TRIGGERED_NOT_BOOTSTRAP'
    },
    research_triggers: [
      'EXTERNAL_UNCERTAINTY',
      'BLOCKER',
      'CAPABILITY_GAP',
      'STALE_EVIDENCE',
      'WEAK_COMPARISON',
      'DESIGN_DEAD_END',
      'FEATURE_INCUBATION',
      'OPPORTUNITY_WINDOW'
    ],
    learning_states: [
      'OBSERVED',
      'RESEARCH_SUPPORTED',
      'LOCALLY_VALIDATED',
      'REPEATED',
      'REUSABLE_CANDIDATE',
      'DEPRECATED'
    ],
    bootstrap_policy: {
      overwrite_existing_files: false,
      copy_external_memory_corpus: false,
      research_auto_promotes: false,
      negative_knowledge_auto_promotes: false,
      normal_repo_work_external_fetch_required: false
    }
  };
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderAgentRouter(profile) {
  return `# Repository Agent Instructions\n\nThis repository uses a minimal DevOS scaffold for repository-first development.\n\n## Start here\n\n1. Read \`${profile.target_root}/README.md\`.\n2. Read \`${profile.target_root}/project.json\` for machine-readable routing and authority boundaries.\n3. Use repository code, tests, CI, and accepted repository documentation as live execution truth.\n4. Consult external memory only when a declared upstream trigger fires.\n5. When knowledge is missing or stale and materially affects the task, run bounded live research under \`${profile.target_root}/research-policy.json\`.\n6. Keep research candidate-only until repository evaluation validates it.\n7. Preserve useful failures in \`${profile.target_root}/anti-patterns/\` rather than turning one incident into global law.\n\n## Authority\n\nDevOS is a repository-local cognition, routing, evidence, and learning surface. It is not a new authority source. Research, repetition, database persistence, and model confidence never promote themselves.\n`;
}

function renderDevosReadme(profile) {
  return `# Development OS\n\nThis directory is the repository-local cognition and routing layer for normal development. It is deliberately small at bootstrap and grows only from validated work.\n\n## Runtime order\n\n\`\`\`text\nrequest\n  ↓\nlive repository + tests + local DevOS\n  ↓\nknowledge sufficient?\n  ├─ yes → implement / evaluate\n  └─ no\n      ↓\n  bounded upstream memory when a declared trigger applies\n      ↓ still insufficient/stale\n  bounded live public research\n      ↓\n  candidate solution\n      ↓\n  repository evaluation / regression / held-out check when warranted\n      ↓\n  success → local semantic/procedural knowledge\n  failure → negative knowledge / anti-pattern\n      ↓\n  broader promotion only through the repository's governed path\n\`\`\`\n\n## Bootstrap laws\n\n- Normal repository work is local-first.\n- Do not fetch external memory merely to reconstruct ordinary repository context.\n- Live research is need-triggered, bounded, source-aware, and authority-neutral.\n- A research result is not a rule.\n- A repeated failure is not automatically global policy.\n- Prefer executable proof: tests, fixtures, validators, reproducible commands, exact source identities.\n- Preserve fact, inference, inspiration, success, and failure as different record classes.\n- Add runtime databases, specialist agents, and reusable skills only after the repository demonstrates a need.\n\n## Current bootstrap profile\n\nMode: \`${profile.mode}\`  \nRepository maturity: \`${profile.repository_shape.maturity}\`  \nArchitecture: \`${profile.repository_shape.architecture}\`  \nLanguages: ${profile.repository_shape.languages.length ? profile.repository_shape.languages.map((item) => `\`${item}\``).join(', ') : 'not yet detected'}\n\nSee \`adaptation-profile.json\`, \`research-policy.json\`, \`knowledge/README.md\`, and \`anti-patterns/README.md\`.\n`;
}

function renderKnowledgeReadme() {
  return `# DevOS Knowledge\n\nStore compact repository-native lessons here only after they are useful to future work. Raw research belongs in research receipts or repository research surfaces; raw execution logs belong in execution evidence.\n\n## Maturity states\n\n- **OBSERVED** — something happened; mechanism not yet established.\n- **RESEARCH_SUPPORTED** — external evidence supports a candidate explanation or approach.\n- **LOCALLY_VALIDATED** — repository tests/fixtures/evaluation proved usefulness here.\n- **REPEATED** — supported across independent repository episodes.\n- **REUSABLE_CANDIDATE** — potentially transferable outside this repository; broader promotion still requires governance.\n- **DEPRECATED** — previously useful, now superseded or invalid.\n\n## Representations\n\n- **EPISODIC** — what happened in one execution.\n- **SEMANTIC** — supported lesson about the repository/domain.\n- **PROCEDURAL** — executable/retrievable workflow with preconditions and known failures.\n- **NEGATIVE** — known failure mode, rejected strategy, or misleading pattern.\n\nPrefer a small number of evidence-bound lessons over an always-loaded encyclopedia.\n`;
}

function renderAntiPatternsReadme() {
  return `# DevOS Anti-Patterns\n\nPreserve confirmed or strongly evidenced failure mechanisms here so future agents can recognize bad paths before repeating them.\n\nA useful record should capture:\n\n\`\`\`yaml\npattern_id:\nstatus: OBSERVED | RESEARCH_SUPPORTED | LOCALLY_VALIDATED | REPEATED | REUSABLE_CANDIDATE | DEPRECATED\nproblem:\nwhy_it_looked_reasonable:\nfailure_mode:\ndetection_signals: []\ndo_not: []\npreferred_pattern:\nevidence_refs: []\nregression_refs: []\nscope:\npromotion_state: NONE | LOCAL_RULE | BROADER_CANDIDATE\n\`\`\`\n\n## Promotion law\n\nA failure record does not become an always-loaded rule merely because it exists or repeats. Prefer repository-local detail. Promote only compact, stable rules that demonstrably prevent recurrence without overfitting one incident.\n`;
}

function renderReceiptsReadme() {
  return `# DevOS Receipts\n\nKeep immutable or append-oriented receipts for bootstrap, research, evaluation, and governed promotion when the repository workflow requires them.\n\nReceipts should identify the triggering task/issue, exact repository or artifact identity when available, evidence/source refs, disposition, and authority effect. Do not store secrets, hidden reasoning, or raw private external-memory content.\n`;
}

function researchPolicy(profile) {
  return {
    schema_version: 1,
    role: 'RESEARCH_SCOUT',
    autonomous_preflight: true,
    authority_effect: 'NONE',
    promotion_state: 'CANDIDATE_ONLY',
    trigger_policy: profile.research_triggers,
    source_policy: {
      evidence_preference: [
        'STANDARD_OR_SPECIFICATION',
        'PRIMARY_DOCUMENTATION',
        'SOURCE_REPOSITORY',
        'RELEASE_NOTES',
        'RESEARCH_PAPER',
        'MAINTAINER_ENGINEERING_NOTE',
        'REPRODUCIBLE_BENCHMARK'
      ],
      inspiration_allowed: [
        'POSTMORTEM',
        'CONFERENCE_TALK',
        'DESIGN_ANALYSIS',
        'OPEN_SOURCE_IMPLEMENTATION',
        'COMMUNITY_DISCUSSION',
        'DEVELOPER_ANECDOTE'
      ],
      primary_source_required_for: [
        'CURRENT_API_BEHAVIOR',
        'PLATFORM_OR_TOOL_VERSION_CAPABILITY',
        'LICENSE_OR_POLICY',
        'SECURITY_RELEVANT_BEHAVIOR'
      ]
    },
    lanes: ['CURRENT_STATE', 'IMPLEMENTATIONS', 'FAILURE_MODES', 'ADJACENT_DESIGN', 'OPPORTUNITY'],
    stop_conditions: [
      'DECISIVE_PRIMARY_EVIDENCE_FOUND',
      'ADDITIONAL_SOURCES_ARE_DERIVATIVE_DUPLICATES',
      'PROJECT_FIT_FAILED',
      'QUESTION_ANSWERED_WITH_SUFFICIENT_CONFIDENCE',
      'CONTINUED_RESEARCH_UNLIKELY_TO_CHANGE_DISPOSITION'
    ]
  };
}

export function renderBootstrapFiles(profile, { includeAgentRouter = true } = {}) {
  if (profile.mode !== 'BOOTSTRAP_REQUIRED') return {};
  const root = profile.target_root;
  const project = {
    schema_version: 1,
    devos_profile: 'MINIMAL_BOOTSTRAP',
    normal_repo_work_external_fetch_required: false,
    authority: profile.authority,
    retrieval_order: profile.retrieval_order,
    components: profile.components,
    learning_states: profile.learning_states
  };
  const files = {
    [`${root}/README.md`]: renderDevosReadme(profile),
    [`${root}/project.json`]: json(project),
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
  const resolvedRoot = path.resolve(root);
  if (profile.mode !== 'BOOTSTRAP_REQUIRED') {
    return { state: 'NOOP_EXISTING_OPERATING_LAYER', created: [], skipped: [], target_root: profile.target_root };
  }
  const files = renderBootstrapFiles(profile);
  const created = [];
  const skipped = [];
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(resolvedRoot, relative);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      await writeFile(target, content, { encoding: 'utf8', flag: 'wx' });
      created.push(relative);
    } catch (error) {
      if (error?.code === 'EEXIST') skipped.push(relative);
      else throw error;
    }
  }
  return {
    state: created.length ? 'BOOTSTRAP_APPLIED' : 'BOOTSTRAP_ALREADY_PRESENT',
    target_root: profile.target_root,
    created: created.sort(),
    skipped: skipped.sort()
  };
}

function parseArgs(argv) {
  const args = { root: process.cwd(), apply: false, report: null, devosRoot: DEFAULT_DEVOS_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') args.root = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--report') args.report = argv[++i];
    else if (arg === '--devos-root') args.devosRoot = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage: node scripts/agent-system/devos-compiler.mjs [--root PATH] [--devos-root PATH] [--apply] [--report FILE]\n\nPlan-only is the default. --apply creates missing scaffold files and never overwrites existing files.\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const inventory = await inventoryRepository(args.root);
  const profile = compileDevosProfile(inventory, { devosRoot: args.devosRoot });
  const application = args.apply ? await applyBootstrap(args.root, profile) : { state: 'PLAN_ONLY' };
  const result = { inventory, profile, application };
  if (args.report) {
    const target = path.resolve(args.report);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, json(result));
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
