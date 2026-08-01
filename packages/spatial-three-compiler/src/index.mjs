export * from './core.mjs';
export { buildScene, projectScene } from './three-adapter.mjs';

import { compileSpatialAsset as compileInternal } from './three-adapter.mjs';

export async function compileSpatialAsset(input, options = {}) {
  const prepared = structuredClone(input);
  if (Array.isArray(prepared?.nodes)) {
    for (const node of prepared.nodes) {
      const displayName = typeof node.name === 'string' && node.name.trim() !== '' ? node.name.trim() : node.id;
      node.name = runtimeNodeName(node.id);
      node.extras = {
        ...(node.extras ?? {}),
        displayName,
      };
    }
  }
  return compileInternal(prepared, options);
}

function runtimeNodeName(componentId) {
  return `aios_${String(componentId).replace(/[^A-Za-z0-9_.-]/g, '_')}`;
}
