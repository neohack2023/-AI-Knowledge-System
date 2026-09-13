import path from 'node:path';
import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export * from './devos-compiler-core.mjs';
import {
  DEFAULT_DEVOS_ROOT,
  inventoryRepository,
  compileDevosProfile,
  applyBootstrap
} from './devos-compiler-core.mjs';

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
  return 'Usage: node scripts/agent-system/devos-compiler.mjs [--root PATH] [--devos-root PATH] [--apply] [--report FILE]\n\nPlan-only is the default. The target repository must already exist. --apply is non-destructive and repository-bound.\n';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  const inventory = await inventoryRepository(args.root);
  const profile = compileDevosProfile(inventory, { devosRoot: args.devosRoot });
  const application = args.apply ? await applyBootstrap(args.root, profile) : { state: 'PLAN_ONLY' };
  const result = { inventory, profile, application };
  if (args.report) {
    const target = path.resolve(args.report);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
