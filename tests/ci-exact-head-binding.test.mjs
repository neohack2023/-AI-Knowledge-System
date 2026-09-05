import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);
const CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

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

function extractStep(job, stepName) {
  const marker = `      - name: ${stepName}\n`;
  const start = job.indexOf(marker);
  assert.notEqual(start, -1, `missing step ${stepName}`);

  const tail = job.slice(start + marker.length);
  const nextStep = tail.search(/\n      - name: /);
  return nextStep === -1 ? tail : tail.slice(0, nextStep);
}

function checkoutBinding(job) {
  const step = extractStep(job, 'Checkout exact PR head');
  const lines = step.split('\n');
  const usesLine = lines.find((line) => line.trim().startsWith('uses: '));
  const usesMatch = usesLine?.trim().match(/^uses:\s+actions\/checkout@([0-9a-f]{40})(?:\s+#.*)?$/u);
  assert.ok(usesMatch, 'checkout step must use actions/checkout pinned to an immutable commit');
  assert.equal(
    usesMatch[1],
    CHECKOUT_SHA,
    'checkout step must use the reviewed immutable checkout commit',
  );

  const withIndex = lines.findIndex((line) => line.trim() === 'with:');
  assert.notEqual(withIndex, -1, 'checkout step must have a with mapping');
  const withIndent = lines[withIndex].match(/^\s*/u)[0].length;
  const directChildIndent = withIndent + 2;

  for (let index = withIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const indent = line.match(/^\s*/u)[0].length;
    if (indent <= withIndent) break;
    if (indent !== directChildIndent) continue;

    const refMatch = line.match(/^\s*ref:\s*(.+?)\s*$/u);
    if (refMatch) return refMatch[1];
  }

  assert.fail('checkout step with mapping must contain a direct-child ref');
}

test('all acceptance-relevant CI jobs checkout the exact immutable PR head', async () => {
  const workflow = await read('.github/workflows/ci.yml');

  for (const jobName of ['build-and-test', 'public-release-boundary']) {
    const job = extractJob(workflow, jobName);
    assert.equal(
      checkoutBinding(job),
      '${{ github.event.pull_request.head.sha }}',
      `${jobName} must bind checkout with.ref to github.event.pull_request.head.sha`,
    );
  }
});

test('all GitHub Actions used by CI are pinned to immutable commit SHAs', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  const references = [...workflow.matchAll(/^\s+uses:\s+([^@\s]+)@([^\s#]+)/gmu)];
  assert.ok(references.length > 0, 'CI must contain action references');

  for (const [, action, ref] of references) {
    assert.match(ref, /^[0-9a-f]{40}$/u, `${action} must be pinned to a 40-character commit SHA`);
  }
});

test('agent guidance invalidates head-bound evidence after any candidate-head change', async () => {
  const rootInstructions = await read('AGENTS.md');
  const harnessInstructions = await read('server/coding-harness/AGENTS.md');

  assert.doesNotMatch(rootInstructions, /code-changing head/i);
  assert.doesNotMatch(harnessInstructions, /code-changing head/i);
  assert.ok(
    rootInstructions.includes(
      'After any candidate-head change, assume prior head-bound gate, review, classification, and authorization evidence is stale unless the contract mechanically proves transferability.',
    ),
    'root instructions must require mechanical proof before evidence transfer',
  );
  assert.ok(
    harnessInstructions.includes(
      'If the candidate head changes, prior head-bound evidence is stale unless the contract mechanically proves transferability.',
    ),
    'coding-harness instructions must require mechanical proof before evidence transfer',
  );
});
