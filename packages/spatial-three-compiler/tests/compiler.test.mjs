import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { compileSpatialAsset } from '../src/index.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(directory, '../fixtures');
const fixedTime = '2026-08-01T21:30:00.000Z';

async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(fixtureDirectory, name), 'utf8'));
}

test('four frozen fixtures compile to Khronos-valid canonical glTF and GLB', async (context) => {
  const manifest = JSON.parse(await readFile(path.join(fixtureDirectory, 'manifest.json'), 'utf8'));
  for (const fixture of manifest.fixtures) {
    await context.test(fixture.file, async () => {
      const result = await compileSpatialAsset(await loadFixture(fixture.file), { generatedAt: fixedTime });
      assert.equal(result.receipt.status, 'PASS');
      assert.equal(result.receipt.authority.executionAuthorized, false);
      assert.equal(result.receipt.authority.destinationWriteAuthorized, false);
      assert.equal(result.receipt.authority.activePromotionGranted, false);
      assert.ok(result.outputs.gltf.byteLength > 0);
      assert.ok(result.outputs.glb.byteLength > 20);
      assert.deepEqual(result.validation.map((entry) => entry.errorCount), [0, 0]);
      assert.deepEqual(result.roundTrip.map((entry) => entry.equal), [true, true]);
      assert.equal(result.identityMap.length, result.normalizedBlueprint.blueprint.nodes.length);
    });
  }
});

test('repeated compilation produces the same normalized and output digests', async () => {
  const blueprint = await loadFixture('02-hierarchical-assembly.json');
  const first = await compileSpatialAsset(blueprint, { generatedAt: fixedTime });
  const second = await compileSpatialAsset(structuredClone(blueprint), { generatedAt: fixedTime });
  assert.equal(first.normalizedBlueprint.digest, second.normalizedBlueprint.digest);
  assert.deepEqual(first.receipt.outputs, second.receipt.outputs);
  assert.deepEqual(first.receipt.roundTrip, second.receipt.roundTrip);
  assert.equal(first.receipt.receiptDigest, second.receipt.receiptDigest);
});

test('semantic component IDs and metadata survive glTFLoader round trips', async () => {
  const result = await compileSpatialAsset(await loadFixture('03-bounded-pbr-materials.json'), { generatedAt: fixedTime });
  const expectedIds = result.normalizedBlueprint.blueprint.nodes.map((node) => node.id).sort();
  const actualIds = result.identityMap.map((entry) => entry.componentId).sort();
  assert.deepEqual(actualIds, expectedIds);
  assert.ok(result.roundTrip.every((entry) => entry.differences.length === 0));
});
