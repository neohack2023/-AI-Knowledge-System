import assert from 'node:assert/strict';
import test from 'node:test';

import {
  preflightSpatialInput,
  runtimeNodeName,
} from '../src/index.mjs';

function baseInput() {
  return {
    contract: 'SpatialAssetBlueprint/0.1',
    asset: { id: 'fixture', name: 'Fixture', revision: '1' },
    coordinateSystem: { units: 'm', upAxis: 'Y', forwardAxis: '-Z', handedness: 'right' },
    materials: [],
    nodes: [],
    extras: {},
  };
}

test('aggregate geometry exhaustion fails before Three.js allocation', () => {
  const input = baseInput();
  input.nodes.push({
    id: 'oversized-box',
    name: 'Oversized Box',
    type: 'box',
    parentId: null,
    transform: {},
    geometry: {
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 4096,
      heightSegments: 4096,
      depthSegments: 4096,
    },
    materialId: 'material',
    extras: {},
  });

  assert.throws(
    () => preflightSpatialInput(input),
    (error) => error?.code === 'GEOMETRY_COMPLEXITY_LIMIT' && error?.details?.componentId === 'oversized-box',
  );
});

test('MASK with zero cutoff fails closed', () => {
  const input = baseInput();
  input.materials.push({ id: 'mask', alphaMode: 'MASK', alphaCutoff: 0 });
  assert.throws(
    () => preflightSpatialInput(input),
    (error) => error?.code === 'MASK_ZERO_ALPHA_CUTOFF',
  );
});

test('runtime names remain distinct when readable forms collide', () => {
  const names = [
    runtimeNodeName('part-a', 'Part'),
    runtimeNodeName('part:a', 'Part'),
    runtimeNodeName('part_a', 'Part'),
  ];
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every((name) => /^aios_Part_[0-9a-f]{12}$/.test(name)));
});

test('preflight does not coerce caller-owned extras', () => {
  const values = [
    ['array', [1, 'two', false]],
    ['string', 'caller-owned'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
    ['object', { displayName: 'do-not-overwrite', nested: { value: 1 } }],
  ];

  for (const [id, extras] of values) {
    const input = baseInput();
    input.nodes.push({ id, name: id, type: 'group', parentId: null, transform: {}, geometry: null, materialId: null, extras });
    const before = structuredClone(input.nodes[0].extras);
    preflightSpatialInput(input);
    assert.deepEqual(input.nodes[0].extras, before);
  }
});
