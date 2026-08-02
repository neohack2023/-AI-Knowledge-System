import { createHash } from 'node:crypto';

export const BLUEPRINT_CONTRACT = 'SpatialAssetBlueprint/0.1';
export const RECEIPT_CONTRACT = 'ThreeCompilerReceipt/0.1';
export const COMPILER_NAME = 'AIOS Three.js Spatial Compiler';
export const COMPILER_VERSION = '0.1.0';
export const THREE_VERSION = '0.185.1';
export const GLTF_VALIDATOR_VERSION = '2.0.0-dev.3.10';

const UNIT_SCALE = Object.freeze({ m: 1, cm: 0.01, mm: 0.001 });
const NODE_TYPES = new Set(['group', 'box', 'sphere', 'cylinder', 'cone', 'capsule', 'plane', 'torus']);
const ALPHA_MODES = new Set(['OPAQUE', 'MASK', 'BLEND']);
const SEMANTIC_ID = /^[a-z0-9](?:[a-z0-9._:-]*[a-z0-9])?$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const NUMBER_PRECISION = 1e12;

export class SpatialCompilerError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'SpatialCompilerError';
    this.code = code;
    this.details = details;
  }
}

export function sha256(value) {
  const bytes = typeof value === 'string' ? value : Buffer.from(value);
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new SpatialCompilerError('NON_FINITE_NUMBER', 'Blueprint values must be finite numbers.');
    const rounded = Math.round(value * NUMBER_PRECISION) / NUMBER_PRECISION;
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (FORBIDDEN_KEYS.has(key)) throw new SpatialCompilerError('FORBIDDEN_OBJECT_KEY', `Forbidden object key: ${key}`);
      const child = value[key];
      if (child !== undefined) result[key] = canonicalize(child);
    }
    return result;
  }
  throw new SpatialCompilerError('NON_JSON_VALUE', `Unsupported JSON value type: ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function digestJson(value) {
  return sha256(canonicalJson(value));
}

export function normalizeBlueprint(input) {
  if (!isPlainObject(input)) throw new SpatialCompilerError('INVALID_BLUEPRINT', 'Blueprint must be a JSON object.');
  assertExactKeys(input, ['contract', 'asset', 'coordinateSystem', 'materials', 'nodes', 'extras'], 'blueprint');
  if (input.contract !== BLUEPRINT_CONTRACT) {
    throw new SpatialCompilerError('UNSUPPORTED_BLUEPRINT_CONTRACT', `Expected ${BLUEPRINT_CONTRACT}.`);
  }

  const asset = normalizeAsset(input.asset);
  const coordinateSystem = normalizeCoordinateSystem(input.coordinateSystem);
  const unitScale = UNIT_SCALE[coordinateSystem.units];
  const materials = normalizeMaterials(input.materials ?? []);
  const materialIds = new Set(materials.map((material) => material.id));
  const nodes = normalizeNodes(input.nodes, materialIds, unitScale);
  const extras = input.extras === undefined ? {} : canonicalize(input.extras);

  const normalized = canonicalize({
    contract: BLUEPRINT_CONTRACT,
    asset,
    coordinateSystem: {
      sourceUnits: coordinateSystem.units,
      units: 'm',
      upAxis: 'Y',
      forwardAxis: '-Z',
      handedness: 'right',
      unitScale,
    },
    materials,
    nodes,
    extras,
  });

  return Object.freeze({
    blueprint: deepFreeze(normalized),
    digest: digestJson(normalized),
  });
}

function normalizeAsset(value) {
  if (!isPlainObject(value)) throw new SpatialCompilerError('INVALID_ASSET', 'asset must be an object.');
  assertExactKeys(value, ['id', 'name', 'revision'], 'asset');
  const id = semanticId(value.id, 'asset.id');
  const name = nonEmptyString(value.name, 'asset.name');
  const revision = nonEmptyString(value.revision, 'asset.revision');
  return { id, name, revision };
}

function normalizeCoordinateSystem(value) {
  if (!isPlainObject(value)) throw new SpatialCompilerError('INVALID_COORDINATE_SYSTEM', 'coordinateSystem must be an object.');
  assertExactKeys(value, ['units', 'upAxis', 'forwardAxis', 'handedness'], 'coordinateSystem');
  const units = value.units;
  if (!(units in UNIT_SCALE)) throw new SpatialCompilerError('UNSUPPORTED_UNITS', `Unsupported units: ${String(units)}`);
  if (value.upAxis !== 'Y' || value.forwardAxis !== '-Z' || value.handedness !== 'right') {
    throw new SpatialCompilerError(
      'UNSUPPORTED_COORDINATE_SYSTEM',
      'Slice 0B accepts right-handed, Y-up, -Z-forward blueprints and normalizes units to meters.',
    );
  }
  return { units, upAxis: 'Y', forwardAxis: '-Z', handedness: 'right' };
}

function normalizeMaterials(value) {
  if (!Array.isArray(value)) throw new SpatialCompilerError('INVALID_MATERIALS', 'materials must be an array.');
  const ids = new Set();
  const materials = value.map((entry, index) => {
    if (!isPlainObject(entry)) throw new SpatialCompilerError('INVALID_MATERIAL', `materials[${index}] must be an object.`);
    assertExactKeys(
      entry,
      ['id', 'name', 'baseColor', 'metalness', 'roughness', 'emissive', 'opacity', 'alphaMode', 'alphaCutoff', 'doubleSided', 'extras'],
      `materials[${index}]`,
    );
    const id = semanticId(entry.id, `materials[${index}].id`);
    if (ids.has(id)) throw new SpatialCompilerError('DUPLICATE_MATERIAL_ID', `Duplicate material id: ${id}`);
    ids.add(id);
    const alphaMode = entry.alphaMode ?? 'OPAQUE';
    if (!ALPHA_MODES.has(alphaMode)) throw new SpatialCompilerError('INVALID_ALPHA_MODE', `Unsupported alphaMode: ${alphaMode}`);
    const material = {
      id,
      name: nonEmptyString(entry.name ?? id, `materials[${index}].name`),
      baseColor: color(entry.baseColor ?? '#ffffff', `materials[${index}].baseColor`),
      metalness: boundedNumber(entry.metalness ?? 0, 0, 1, `materials[${index}].metalness`),
      roughness: boundedNumber(entry.roughness ?? 1, 0, 1, `materials[${index}].roughness`),
      emissive: color(entry.emissive ?? '#000000', `materials[${index}].emissive`),
      opacity: boundedNumber(entry.opacity ?? 1, 0, 1, `materials[${index}].opacity`),
      alphaMode,
      alphaCutoff: boundedNumber(entry.alphaCutoff ?? 0.5, 0, 1, `materials[${index}].alphaCutoff`),
      doubleSided: boolean(entry.doubleSided ?? false, `materials[${index}].doubleSided`),
      extras: canonicalize(entry.extras ?? {}),
    };
    return canonicalize(material);
  });
  return materials.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeNodes(value, materialIds, unitScale) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new SpatialCompilerError('INVALID_NODES', 'nodes must be a non-empty array.');
  }
  const ids = new Set();
  const byId = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (!isPlainObject(entry)) throw new SpatialCompilerError('INVALID_NODE', `nodes[${index}] must be an object.`);
    assertExactKeys(entry, ['id', 'name', 'type', 'parentId', 'transform', 'geometry', 'materialId', 'extras'], `nodes[${index}]`);
    const id = semanticId(entry.id, `nodes[${index}].id`);
    if (ids.has(id)) throw new SpatialCompilerError('DUPLICATE_NODE_ID', `Duplicate node id: ${id}`);
    ids.add(id);
    if (!NODE_TYPES.has(entry.type)) throw new SpatialCompilerError('UNSUPPORTED_NODE_TYPE', `Unsupported node type: ${String(entry.type)}`);
    const parentId = entry.parentId === null || entry.parentId === undefined ? null : semanticId(entry.parentId, `nodes[${index}].parentId`);
    const materialId = entry.materialId === null || entry.materialId === undefined ? null : semanticId(entry.materialId, `nodes[${index}].materialId`);
    if (materialId && !materialIds.has(materialId)) {
      throw new SpatialCompilerError('UNKNOWN_MATERIAL_ID', `Node ${id} references unknown material ${materialId}.`);
    }
    if (entry.type === 'group' && entry.geometry !== null && entry.geometry !== undefined) {
      throw new SpatialCompilerError('GROUP_WITH_GEOMETRY', `Group node ${id} cannot define geometry.`);
    }
    if (entry.type !== 'group' && !isPlainObject(entry.geometry)) {
      throw new SpatialCompilerError('MISSING_GEOMETRY', `Mesh node ${id} requires geometry parameters.`);
    }
    if (entry.type !== 'group' && !materialId) {
      throw new SpatialCompilerError('MISSING_MATERIAL_ID', `Mesh node ${id} requires materialId.`);
    }
    const node = canonicalize({
      id,
      name: nonEmptyString(entry.name ?? id, `nodes[${index}].name`),
      type: entry.type,
      parentId,
      transform: normalizeTransform(entry.transform ?? {}, unitScale, `nodes[${index}].transform`),
      geometry: entry.type === 'group' ? null : normalizeGeometry(entry.type, entry.geometry, unitScale, `nodes[${index}].geometry`),
      materialId,
      extras: canonicalize(entry.extras ?? {}),
    });
    byId.set(id, node);
  }

  for (const node of byId.values()) {
    if (node.parentId === node.id) throw new SpatialCompilerError('SELF_PARENT', `Node ${node.id} cannot parent itself.`);
    if (node.parentId && !byId.has(node.parentId)) {
      throw new SpatialCompilerError('UNKNOWN_PARENT_ID', `Node ${node.id} references unknown parent ${node.parentId}.`);
    }
  }

  return topologicalSort(byId);
}

function normalizeTransform(value, unitScale, path) {
  if (!isPlainObject(value)) throw new SpatialCompilerError('INVALID_TRANSFORM', `${path} must be an object.`);
  assertExactKeys(value, ['position', 'rotation', 'scale'], path);
  return {
    position: vector3(value.position ?? [0, 0, 0], `${path}.position`).map((number) => number * unitScale),
    rotation: vector3(value.rotation ?? [0, 0, 0], `${path}.rotation`),
    scale: positiveVector3(value.scale ?? [1, 1, 1], `${path}.scale`),
  };
}

function normalizeGeometry(type, value, unitScale, path) {
  const scale = (number, field) => positiveNumber(number, `${path}.${field}`) * unitScale;
  const segments = (number, field, minimum = 3) => integer(number, minimum, 4096, `${path}.${field}`);
  switch (type) {
    case 'box':
      assertExactKeys(value, ['width', 'height', 'depth', 'widthSegments', 'heightSegments', 'depthSegments'], path);
      return {
        width: scale(value.width, 'width'),
        height: scale(value.height, 'height'),
        depth: scale(value.depth, 'depth'),
        widthSegments: segments(value.widthSegments ?? 1, 'widthSegments', 1),
        heightSegments: segments(value.heightSegments ?? 1, 'heightSegments', 1),
        depthSegments: segments(value.depthSegments ?? 1, 'depthSegments', 1),
      };
    case 'sphere':
      assertExactKeys(value, ['radius', 'widthSegments', 'heightSegments'], path);
      return {
        radius: scale(value.radius, 'radius'),
        widthSegments: segments(value.widthSegments ?? 32, 'widthSegments'),
        heightSegments: segments(value.heightSegments ?? 16, 'heightSegments', 2),
      };
    case 'cylinder':
    case 'cone':
      assertExactKeys(value, type === 'cone' ? ['radius', 'height', 'radialSegments', 'heightSegments', 'openEnded'] : ['radiusTop', 'radiusBottom', 'height', 'radialSegments', 'heightSegments', 'openEnded'], path);
      return type === 'cone'
        ? {
            radius: scale(value.radius, 'radius'),
            height: scale(value.height, 'height'),
            radialSegments: segments(value.radialSegments ?? 32, 'radialSegments'),
            heightSegments: segments(value.heightSegments ?? 1, 'heightSegments', 1),
            openEnded: boolean(value.openEnded ?? false, `${path}.openEnded`),
          }
        : {
            radiusTop: scale(value.radiusTop, 'radiusTop'),
            radiusBottom: scale(value.radiusBottom, 'radiusBottom'),
            height: scale(value.height, 'height'),
            radialSegments: segments(value.radialSegments ?? 32, 'radialSegments'),
            heightSegments: segments(value.heightSegments ?? 1, 'heightSegments', 1),
            openEnded: boolean(value.openEnded ?? false, `${path}.openEnded`),
          };
    case 'capsule':
      assertExactKeys(value, ['radius', 'length', 'capSegments', 'radialSegments'], path);
      return {
        radius: scale(value.radius, 'radius'),
        length: scale(value.length, 'length'),
        capSegments: segments(value.capSegments ?? 8, 'capSegments', 1),
        radialSegments: segments(value.radialSegments ?? 16, 'radialSegments'),
      };
    case 'plane':
      assertExactKeys(value, ['width', 'height', 'widthSegments', 'heightSegments'], path);
      return {
        width: scale(value.width, 'width'),
        height: scale(value.height, 'height'),
        widthSegments: segments(value.widthSegments ?? 1, 'widthSegments', 1),
        heightSegments: segments(value.heightSegments ?? 1, 'heightSegments', 1),
      };
    case 'torus':
      assertExactKeys(value, ['radius', 'tube', 'radialSegments', 'tubularSegments', 'arc'], path);
      return {
        radius: scale(value.radius, 'radius'),
        tube: scale(value.tube, 'tube'),
        radialSegments: segments(value.radialSegments ?? 16, 'radialSegments', 3),
        tubularSegments: segments(value.tubularSegments ?? 48, 'tubularSegments', 3),
        arc: boundedNumber(value.arc ?? Math.PI * 2, Number.EPSILON, Math.PI * 2, `${path}.arc`),
      };
    default:
      throw new SpatialCompilerError('UNSUPPORTED_NODE_TYPE', `Unsupported node type: ${type}`);
  }
}

function topologicalSort(byId) {
  const children = new Map([...byId.keys()].map((id) => [id, []]));
  const indegree = new Map([...byId.keys()].map((id) => [id, 0]));
  for (const node of byId.values()) {
    if (node.parentId) {
      children.get(node.parentId).push(node.id);
      indegree.set(node.id, 1);
    }
  }
  for (const list of children.values()) list.sort();
  const ready = [...byId.keys()].filter((id) => indegree.get(id) === 0).sort();
  const result = [];
  while (ready.length > 0) {
    const id = ready.shift();
    result.push(byId.get(id));
    for (const childId of children.get(id)) {
      indegree.set(childId, indegree.get(childId) - 1);
      if (indegree.get(childId) === 0) {
        ready.push(childId);
        ready.sort();
      }
    }
  }
  if (result.length !== byId.size) {
    const cycleIds = [...byId.keys()].filter((id) => indegree.get(id) > 0).sort();
    throw new SpatialCompilerError('HIERARCHY_CYCLE', `Hierarchy cycle detected among: ${cycleIds.join(', ')}.`);
  }
  return result;
}

export function normalizeSceneProjection(sceneLike) {
  if (!isPlainObject(sceneLike) || !Array.isArray(sceneLike.nodes) || !Array.isArray(sceneLike.materials)) {
    throw new SpatialCompilerError('INVALID_SCENE_PROJECTION', 'Scene projection must contain nodes and materials arrays.');
  }
  const normalized = canonicalize({
    assetId: sceneLike.assetId,
    nodes: [...sceneLike.nodes].sort(byId),
    materials: [...sceneLike.materials].sort(byId),
  });
  return Object.freeze({ projection: deepFreeze(normalized), digest: digestJson(normalized) });
}

export function compareSceneProjections(expected, actual) {
  const left = normalizeSceneProjection(expected);
  const right = normalizeSceneProjection(actual);
  const differences = [];
  diffValues(left.projection, right.projection, '$', differences);
  return Object.freeze({
    equal: differences.length === 0,
    expectedDigest: left.digest,
    actualDigest: right.digest,
    differences,
  });
}

export function buildCompilerReceipt({
  normalizedBlueprint,
  identityMap,
  outputs,
  validation,
  roundTrip,
  warnings = [],
  generatedAt = new Date().toISOString(),
}) {
  const outputRecords = Object.entries(outputs)
    .map(([format, bytes]) => ({ format, byteLength: bytes.byteLength, sha256: sha256(bytes) }))
    .sort((a, b) => a.format.localeCompare(b.format));
  const status = validation.every((item) => item.errorCount === 0) && roundTrip.every((item) => item.equal) ? 'PASS' : 'FAIL';
  const body = canonicalize({
    contract: RECEIPT_CONTRACT,
    receiptId: `three-compiler:${normalizedBlueprint.blueprint.asset.id}:${normalizedBlueprint.digest.slice(0, 16)}`,
    compiler: {
      name: COMPILER_NAME,
      version: COMPILER_VERSION,
      threeVersion: THREE_VERSION,
      gltfValidatorVersion: GLTF_VALIDATOR_VERSION,
    },
    blueprint: {
      assetId: normalizedBlueprint.blueprint.asset.id,
      revision: normalizedBlueprint.blueprint.asset.revision,
      digest: normalizedBlueprint.digest,
      contract: normalizedBlueprint.blueprint.contract,
    },
    identityMap: [...identityMap].sort((a, b) => a.componentId.localeCompare(b.componentId)),
    outputs: outputRecords,
    validation,
    roundTrip,
    warnings: [...warnings].sort(),
    authority: {
      executionAuthorized: false,
      destinationWriteAuthorized: false,
      activePromotionGranted: false,
      canonMutationAuthorized: false,
    },
    status,
    generatedAt,
  });
  return deepFreeze({ ...body, receiptDigest: digestJson(body) });
}

function diffValues(left, right, path, differences) {
  if (Object.is(left, right)) return;
  if (typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) <= 1e-9) return;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) differences.push({ path, expected: left.length, actual: right.length, reason: 'ARRAY_LENGTH' });
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i += 1) diffValues(left[i], right[i], `${path}[${i}]`, differences);
    return;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      if (!(key in left)) differences.push({ path: `${path}.${key}`, expected: undefined, actual: right[key], reason: 'UNEXPECTED_KEY' });
      else if (!(key in right)) differences.push({ path: `${path}.${key}`, expected: left[key], actual: undefined, reason: 'MISSING_KEY' });
      else diffValues(left[key], right[key], `${path}.${key}`, differences);
    }
    return;
  }
  differences.push({ path, expected: left, actual: right, reason: 'VALUE_MISMATCH' });
}

function assertExactKeys(value, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new SpatialCompilerError('UNSUPPORTED_FIELD', `Unsupported field ${path}.${key}.`);
  }
}

function semanticId(value, path) {
  const id = nonEmptyString(value, path);
  if (!SEMANTIC_ID.test(id)) throw new SpatialCompilerError('INVALID_SEMANTIC_ID', `${path} must match ${SEMANTIC_ID}.`);
  return id;
}

function nonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim() === '') throw new SpatialCompilerError('INVALID_STRING', `${path} must be a non-empty string.`);
  return value.trim();
}

function boolean(value, path) {
  if (typeof value !== 'boolean') throw new SpatialCompilerError('INVALID_BOOLEAN', `${path} must be boolean.`);
  return value;
}

function boundedNumber(value, min, max, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new SpatialCompilerError('NUMBER_OUT_OF_RANGE', `${path} must be between ${min} and ${max}.`);
  }
  return canonicalize(value);
}

function positiveNumber(value, path) {
  return boundedNumber(value, Number.EPSILON, Number.MAX_SAFE_INTEGER, path);
}

function integer(value, min, max, path) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new SpatialCompilerError('INVALID_INTEGER', `${path} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function vector3(value, path) {
  if (!Array.isArray(value) || value.length !== 3) throw new SpatialCompilerError('INVALID_VECTOR3', `${path} must contain exactly 3 numbers.`);
  return value.map((entry, index) => boundedNumber(entry, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, `${path}[${index}]`));
}

function positiveVector3(value, path) {
  if (!Array.isArray(value) || value.length !== 3) throw new SpatialCompilerError('INVALID_VECTOR3', `${path} must contain exactly 3 numbers.`);
  return value.map((entry, index) => positiveNumber(entry, `${path}[${index}]`));
}

function color(value, path) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new SpatialCompilerError('INVALID_COLOR', `${path} must be a six-digit hexadecimal color.`);
  }
  return value.toLowerCase();
}

function byId(a, b) {
  return String(a.id).localeCompare(String(b.id));
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
