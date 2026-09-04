import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repoRoot), 'utf8');
}

function extractJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing CI job ${jobName}`);

  const tail = workflow.slice(start + marker.length);
  const nextJob = tail.search(/\n  [A-Za-z0-9_-]+:\n/);
  return nextJob === -1 ? tail : tail.slice(0, nextJob);
}

const exactHeadRef = /uses:\s+actions\/checkout@v4[\s\S]{0,220}ref:\s+\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/;

test('all acceptance-relevant CI jobs checkout the exact immutable PR head', async () => {
  const workflow = await read('.github/workflows/ci.yml');

  for (const jobName of ['build-and-test', 'public-release-boundary']) {
    const job = extractJob(workflow, jobName);
    assert.match(job, exactHeadRef, `${jobName} must checkout github.event.pull_request.head.sha`);
  }
});

test('agent guidance invalidates head-bound evidence after any candidate-head change', async () => {
  const rootInstructions = await read('AGENTS.md');
  const harnessInstructions = await read('server/coding-harness/AGENTS.md');

  assert.doesNotMatch(rootInstructions, /code-changing head/i);
  assert.doesNotMatch(harnessInstructions, /code-changing head/i);
  assert.match(rootInstructions, /After any candidate-head change, assume prior head-bound/);
  assert.match(harnessInstructions, /If the candidate head changes, prior head-bound evidence is stale/);
});
