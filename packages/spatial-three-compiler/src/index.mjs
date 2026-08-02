import { createHash } from 'node:crypto';

export * from './core.mjs';
export { buildScene, projectScene } from './three-adapter.mjs';

import { SpatialCompilerError } from './core.mjs';
import { compileSpatialAsset as compileInternal } from './three-adapter.mjs';

const MAX_ESTIMATED_VERTICES = 1_000_000;
const MAX_ESTIMATED_INDICES = 6_000_000;

export async function compileSpatialAsset(input, options = {}) {
  return compileInternal(prepareSpatialInput(input), options);
}

export function prepareSpatialInput(input) {
  const prepared = structuredClone(input);
  preflightSpatialInput(prepared);

  if (Array.isArray(prepared?.nodes)) {
    for (const node of prepared.nodes) {
      const displayName = typeof node.name === 'string' && node.name.trim() !== '' ? node.name.trim() : node.id;
      node.name = runtimeNodeName(node.id, displayName);
      // Caller-owned extras remain byte-for-byte equivalent after canonicalization.
      // Compiler metadata must never overwrite or coerce them.
    }
  }

  return prepared;
}

export function preflightSpatialInput(input) {
  let estimatedVertices = 0;
  let estimatedIndices = 0;

  for (const [index, material] of (input?.materials ?? []).entries()) {
    if (material?.alphaMode === 'MASK' && material?.alphaCutoff === 0) {
      throw new SpatialCompilerError(
        'MASK_ZERO_ALPHA_CUTOFF',
        `materials[${index}] uses MASK with alphaCutoff 0, which cannot be exported faithfully by this compiler.`,
      );
    }
  }

  for (const [index, node] of (input?.nodes ?? []).entries()) {
    if (!node || node.type === 'group') continue;
    const estimate = estimateGeometry(node.type, node.geometry ?? {});
    estimatedVertices += estimate.vertices;
    estimatedIndices += estimate.indices;
    if (estimatedVertices > MAX_ESTIMATED_VERTICES || estimatedIndices > MAX_ESTIMATED_INDICES) {
      throw new SpatialCompilerError(
        'GEOMETRY_COMPLEXITY_LIMIT',
        `nodes[${index}] (${String(node.id)}) exceeds aggregate pre-allocation limits.`,
        {
          componentId: node.id,
          estimatedVertices,
          estimatedIndices,
          maxEstimatedVertices: MAX_ESTIMATED_VERTICES,
          maxEstimatedIndices: MAX_ESTIMATED_INDICES,
        },
      );
    }
  }

  return Object.freeze({ estimatedVertices, estimatedIndices });
}

export function runtimeNodeName(componentId, displayName = componentId) {
  const readable = String(displayName)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'component';
  const suffix = createHash('sha256').update(String(componentId)).digest('hex').slice(0, 12);
  return `aios_${readable}_${suffix}`;
}

function estimateGeometry(type, value) {
  const n = (key, fallback) => Number.isInteger(value[key]) ? value[key] : fallback;
  switch (type) {
    case 'box': {
      const w = n('widthSegments', 1);
      const h = n('heightSegments', 1);
      const d = n('depthSegments', 1);
      const quads = 2 * (w * h + w * d + h * d);
      return { vertices: 4 * quads, indices: 6 * quads };
    }
    case 'sphere': {
      const w = n('widthSegments', 32);
      const h = n('heightSegments', 16);
      return { vertices: (w + 1) * (h + 1), indices: 6 * w * Math.max(1, h - 1) };
    }
    case 'cylinder':
    case 'cone': {
      const r = n('radialSegments', 32);
      const h = n('heightSegments', 1);
      const caps = value.openEnded ? 0 : 2;
      return { vertices: (r + 1) * (h + 1) + caps * (2 * r + 1), indices: 6 * r * h + caps * 3 * r };
    }
    case 'capsule': {
      const c = n('capSegments', 8);
      const r = n('radialSegments', 16);
      return { vertices: (r + 1) * (2 * c + 2), indices: 6 * r * (2 * c + 1) };
    }
    case 'plane': {
      const w = n('widthSegments', 1);
      const h = n('heightSegments', 1);
      return { vertices: (w + 1) * (h + 1), indices: 6 * w * h };
    }
    case 'torus': {
      const r = n('radialSegments', 16);
      const t = n('tubularSegments', 48);
      return { vertices: (r + 1) * (t + 1), indices: 6 * r * t };
    }
    default:
      return { vertices: 0, indices: 0 };
  }
}
