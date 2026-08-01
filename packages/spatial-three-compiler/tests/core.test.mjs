import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  compareSceneProjections,
  digestJson,
  normalizeBlueprint,
  SpatialCompilerError,
} from '../src/core.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(directory, '../fixtures');

async function loadFixture(name) {
  return JSON.parse(await readFile(path.join(fixtureDirectory, name), 'utf8'));
}

test('frozen fixture manifest matches the exact fixture bytes', async () => {
  const manifest = JSON.parse(await readFile(path.join(fixtureDirectory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.contract, 'FrozenFixtureManifest/0.1');
  assert.equal(manifest.fixtures.length, 4);
  for (const fixture of manifest.fixtures) {
    const bytes = await readFile(path.join(fixtureDirectory, fixture.file));
    assert.equal(bytes.byteLength, fixture.byteLength);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), fixture.sha256);
  }
});

test('all four fixtures normalize deterministically with stable semantic IDs', async () => {
  const manifest = JSON.parse(await readFile(path.join(fixtureDirectory, 'manifest.json'), 'utf8'));
  for (const fixture of manifest.fixtures) {
    const blueprint = await loadFixture(fixture.file);
    const first = normalizeBlueprint(blueprint);
    const second = normalizeBlueprint(structuredClone(blueprint));
    assert.equal(first.digest, second.digest);
    assert.equal(first.digest, digestJson(first.blueprint));
    assert.equal(new Set(first.blueprint.nodes.map((node) => node.id)).size, first.blueprint.nodes.length);
    assert.equal(first.blueprint.coordinateSystem.units, 'm');
    assert.equal(first.blueprint.coordinateSystem.upAxis, 'Y');
  }
});

test('millimeter fixture normalizes positions and primitive dimensions to meters', async () => {
  const normalized = normalizeBlueprint(await loadFixture('04-millimeter-normalization.json'));
  const node = normalized.blueprint.nodes[0];
  assert.deepEqual(node.transform.position, [0.125, 0.5, -0.25]);
  assert.equal(node.geometry.radius, 0.125);
  assert.equal(node.geometry.length, 0.75);
  assert.equal(normalized.blueprint.coordinateSystem.unitScale, 0.001);
});

test('hierarchy normalization emits parents before children and lexical siblings', async () => {
  const normalized = normalizeBlueprint(await loadFixture('02-hierarchical-assembly.json'));
  assert.deepEqual(
    normalized.blueprint.nodes.map((node) => node.id),
    ['assembly.root', 'assembly.base', 'assembly.cap', 'assembly.ring'],
  );
});

test('duplicate semantic IDs fail closed', async () => {
  const blueprint = await loadFixture('01-primitive-box.json');
  blueprint.nodes.push(structuredClone(blueprint.nodes[0]));
  assert.throws(
    () => normalizeBlueprint(blueprint),
    (error) => error instanceof SpatialCompilerError && error.code === 'DUPLICATE_NODE_ID',
  );
});

test('hierarchy cycles fail closed', async () => {
  const blueprint = await loadFixture('02-hierarchical-assembly.json');
  blueprint.nodes.find((node) => node.id === 'assembly.root').parentId = 'assembly.ring';
  assert.throws(
    () => normalizeBlueprint(blueprint),
    (error) => error instanceof SpatialCompilerError && error.code === 'HIERARCHY_CYCLE',
  );
});

test('unsupported material fields fail closed instead of silently approximating', async () => {
  const blueprint = await loadFixture('03-bounded-pbr-materials.json');
  blueprint.materials[0].shaderCode = 'void main() {}';
  assert.throws(
    () => normalizeBlueprint(blueprint),
    (error) => error instanceof SpatialCompilerError && error.code === 'UNSUPPORTED_FIELD',
  );
});

test('normalized scene comparison is order-independent but value-sensitive', () => {
  const expected = {
    assetId: 'fixture.compare',
    nodes: [{ id: 'b', value: 2 }, { id: 'a', value: 1 }],
    materials: [{ id: 'm', roughness: 0.5 }],
  };
  const reordered = {
    assetId: 'fixture.compare',
    nodes: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
    materials: [{ roughness: 0.5, id: 'm' }],
  };
  assert.equal(compareSceneProjections(expected, reordered).equal, true);
  reordered.nodes[1].value = 3;
  const changed = compareSceneProjections(expected, reordered);
  assert.equal(changed.equal, false);
  assert.ok(changed.differences.some((difference) => difference.path.endsWith('.value')));
});
