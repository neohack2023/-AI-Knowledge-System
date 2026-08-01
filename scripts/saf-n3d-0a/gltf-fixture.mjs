import { object, equal, integer, fail } from './common.mjs';

export function buildGlb(gltf, binaryBytes) {
  object(gltf, 'gltf');
  const jsonBytes = Buffer.from(JSON.stringify(gltf));
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const binPadding = (4 - (binaryBytes.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
  const binChunk = Buffer.concat([Buffer.from(binaryBytes), Buffer.alloc(binPadding, 0)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const output = Buffer.alloc(total);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(total, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binChunk.length, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(output, binHeader + 8);
  return output;
}

export function parseGlb(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length < 20) fail('GLB_TOO_SHORT', 'GLB is shorter than the minimum header.');
  if (buffer.readUInt32LE(0) !== 0x46546c67) fail('GLB_MAGIC', 'Invalid GLB magic.');
  if (buffer.readUInt32LE(4) !== 2) fail('GLB_VERSION', 'Expected GLB version 2.');
  if (buffer.readUInt32LE(8) !== buffer.length) fail('GLB_LENGTH', 'Header length does not match bytes.');
  let offset = 12;
  const chunks = [];
  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) fail('GLB_TRUNCATED_CHUNK', 'Truncated chunk header.');
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + length > buffer.length) fail('GLB_TRUNCATED_CHUNK', 'Chunk exceeds file length.');
    chunks.push({ type, bytes: buffer.subarray(offset, offset + length) });
    offset += length;
  }
  if (chunks.length !== 2 || chunks[0].type !== 0x4e4f534a || chunks[1].type !== 0x004e4942) fail('GLB_CHUNK_LAYOUT', 'Expected JSON then BIN chunks.');
  const gltf = JSON.parse(chunks[0].bytes.toString('utf8').trimEnd());
  return { gltf, binary: chunks[1].bytes, ...validateMinimalGltf(gltf, chunks[1].bytes) };
}

export function validateMinimalGltf(gltf, binary) {
  equal(gltf.asset?.version, '2.0', 'gltf.asset.version', 'GLTF_VERSION');
  if (!Array.isArray(gltf.meshes) || gltf.meshes.length !== 1) fail('GLTF_MESH_COUNT', 'Fixture must contain one mesh.');
  if (!Array.isArray(gltf.accessors) || gltf.accessors.length !== 2) fail('GLTF_ACCESSORS', 'Fixture must contain two accessors.');
  if (!Array.isArray(gltf.bufferViews) || gltf.bufferViews.length !== 2) fail('GLTF_BUFFER_VIEWS', 'Fixture must contain two buffer views.');
  const declared = gltf.buffers?.[0]?.byteLength;
  integer(declared, 'gltf.buffers[0].byteLength', 1);
  if (binary.length < declared || binary.length - declared > 3) fail('GLTF_BUFFER_LENGTH', 'BIN chunk does not match declared buffer length.');
  for (const [index, view] of gltf.bufferViews.entries()) {
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    if (start < 0 || end > declared) fail('GLTF_BUFFER_VIEW_RANGE', 'bufferView exceeds declared buffer.', `gltf.bufferViews[${index}]`);
  }
  const positionView = gltf.bufferViews[gltf.accessors[0].bufferView];
  const indexView = gltf.bufferViews[gltf.accessors[1].bufferView];
  const positions = [];
  for (let i = 0; i < 9; i += 1) positions.push(binary.readFloatLE((positionView.byteOffset ?? 0) + i * 4));
  const indices = [];
  for (let i = 0; i < 3; i += 1) indices.push(binary.readUInt16LE((indexView.byteOffset ?? 0) + i * 2));
  if (JSON.stringify(positions) !== JSON.stringify([0,0,0,1,0,0,0,1,0])) fail('GLTF_POSITION_REIMPORT', 'Unexpected re-imported positions.');
  if (JSON.stringify(indices) !== JSON.stringify([0,1,2])) fail('GLTF_INDEX_REIMPORT', 'Unexpected re-imported indices.');
  return { positions, indices, vertexCount: 3, faceCount: 1, bounds: { min: [0,0,0], max: [1,1,0] }, dimensions: [1,1,0] };
}
