import {
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import validator from 'gltf-validator';

const { validateBytes, version: validatorVersion } = validator;
import {
  buildCompilerReceipt,
  canonicalJson,
  canonicalize,
  compareSceneProjections,
  GLTF_VALIDATOR_VERSION,
  normalizeBlueprint,
  normalizeSceneProjection,
  sha256,
  SpatialCompilerError,
} from './core.mjs';

installNodePolyfills();

export async function compileSpatialAsset(input, options = {}) {
  const normalizedBlueprint = normalizeBlueprint(input);
  const { scene, identityMap } = buildScene(normalizedBlueprint);
  const originalProjection = projectScene(scene, normalizedBlueprint.blueprint.asset.id);

  const outputs = await exportCanonicalOutputs(scene);
  const validation = await validateOutputs(outputs);
  const roundTrip = await validateRoundTrips(outputs, originalProjection, normalizedBlueprint.blueprint.asset.id);
  const receipt = buildCompilerReceipt({
    normalizedBlueprint,
    identityMap,
    outputs,
    validation,
    roundTrip,
    warnings: [],
    generatedAt: options.generatedAt,
  });

  if (receipt.status !== 'PASS') {
    throw new SpatialCompilerError('COMPILER_VALIDATION_FAILED', 'Compiled output failed validation or round-trip comparison.', receipt);
  }

  return Object.freeze({
    normalizedBlueprint,
    scene,
    outputs: Object.freeze(outputs),
    identityMap: Object.freeze(identityMap),
    validation: Object.freeze(validation),
    roundTrip: Object.freeze(roundTrip),
    receipt,
  });
}

export function buildScene(normalizedBlueprint) {
  const blueprint = normalizedBlueprint.blueprint;
  const scene = new Scene();
  scene.name = blueprint.asset.name;
  scene.uuid = deterministicUuid(`scene:${normalizedBlueprint.digest}`);
  scene.userData = {
    aios: {
      assetId: blueprint.asset.id,
      blueprintDigest: normalizedBlueprint.digest,
      blueprintRevision: blueprint.asset.revision,
      contract: blueprint.contract,
      coordinateSystem: blueprint.coordinateSystem,
      custom: blueprint.extras,
    },
  };

  const materials = new Map();
  for (const definition of blueprint.materials) {
    const material = buildMaterial(definition, normalizedBlueprint.digest);
    materials.set(definition.id, material);
  }

  const objects = new Map();
  const identityMap = [];
  for (const definition of blueprint.nodes) {
    const object = definition.type === 'group'
      ? new Group()
      : new Mesh(buildGeometry(definition), materials.get(definition.materialId));
    object.name = definition.name;
    object.uuid = deterministicUuid(`node:${normalizedBlueprint.digest}:${definition.id}`);
    object.position.fromArray(definition.transform.position);
    object.rotation.set(...definition.transform.rotation, 'XYZ');
    object.scale.fromArray(definition.transform.scale);
    object.userData = {
      aios: {
        assetId: blueprint.asset.id,
        componentId: definition.id,
        componentType: definition.type,
        blueprintDigest: normalizedBlueprint.digest,
        blueprintRevision: blueprint.asset.revision,
        custom: definition.extras,
      },
    };
    objects.set(definition.id, object);
    identityMap.push({
      componentId: definition.id,
      objectUuid: object.uuid,
      objectName: object.name,
      parentComponentId: definition.parentId,
    });
  }

  for (const definition of blueprint.nodes) {
    const object = objects.get(definition.id);
    if (definition.parentId) objects.get(definition.parentId).add(object);
    else scene.add(object);
  }
  scene.updateMatrixWorld(true);

  return { scene, identityMap };
}

function buildGeometry(definition) {
  const value = definition.geometry;
  let geometry;
  switch (definition.type) {
    case 'box':
      geometry = new BoxGeometry(value.width, value.height, value.depth, value.widthSegments, value.heightSegments, value.depthSegments);
      break;
    case 'sphere':
      geometry = new SphereGeometry(value.radius, value.widthSegments, value.heightSegments);
      break;
    case 'cylinder':
      geometry = new CylinderGeometry(value.radiusTop, value.radiusBottom, value.height, value.radialSegments, value.heightSegments, value.openEnded);
      break;
    case 'cone':
      geometry = new ConeGeometry(value.radius, value.height, value.radialSegments, value.heightSegments, value.openEnded);
      break;
    case 'capsule':
      geometry = new CapsuleGeometry(value.radius, value.length, value.capSegments, value.radialSegments);
      break;
    case 'plane':
      geometry = new PlaneGeometry(value.width, value.height, value.widthSegments, value.heightSegments);
      break;
    case 'torus':
      geometry = new TorusGeometry(value.radius, value.tube, value.radialSegments, value.tubularSegments, value.arc);
      break;
    default:
      throw new SpatialCompilerError('UNSUPPORTED_NODE_TYPE', `Unsupported node type: ${definition.type}`);
  }
  geometry.name = `${definition.id}:geometry`;
  geometry.uuid = deterministicUuid(`geometry:${definition.id}:${canonicalJson(value)}`);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    aios: {
      componentId: definition.id,
      primitiveType: definition.type,
      parameters: value,
    },
  };
  return geometry;
}

function buildMaterial(definition, blueprintDigest) {
  const transparent = definition.alphaMode === 'BLEND';
  const alphaTest = definition.alphaMode === 'MASK' ? definition.alphaCutoff : 0;
  const material = new MeshStandardMaterial({
    color: definition.baseColor,
    emissive: definition.emissive,
    metalness: definition.metalness,
    roughness: definition.roughness,
    opacity: definition.opacity,
    transparent,
    alphaTest,
    side: definition.doubleSided ? DoubleSide : FrontSide,
  });
  material.name = definition.name;
  material.uuid = deterministicUuid(`material:${blueprintDigest}:${definition.id}`);
  material.userData = {
    aios: {
      materialId: definition.id,
      blueprintDigest,
      alphaMode: definition.alphaMode,
      alphaCutoff: definition.alphaCutoff,
      custom: definition.extras,
    },
  };
  return material;
}

async function exportCanonicalOutputs(scene) {
  const exporter = new GLTFExporter();
  const gltfObject = await exporter.parseAsync(scene, {
    binary: false,
    onlyVisible: false,
    trs: true,
    includeCustomExtensions: false,
  });
  const gltfText = `${canonicalJson(gltfObject)}\n`;
  const glb = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: false,
    trs: true,
    includeCustomExtensions: false,
  });
  return {
    gltf: new TextEncoder().encode(gltfText),
    glb: new Uint8Array(glb),
  };
}

async function validateOutputs(outputs) {
  const actualValidatorVersion = validatorVersion();
  if (actualValidatorVersion !== GLTF_VALIDATOR_VERSION) {
    throw new SpatialCompilerError(
      'VALIDATOR_VERSION_MISMATCH',
      `Expected glTF Validator ${GLTF_VALIDATOR_VERSION}, received ${actualValidatorVersion}.`,
    );
  }
  const records = [];
  for (const format of ['gltf', 'glb']) {
    const report = await validateBytes(outputs[format], {
      uri: `asset.${format}`,
      format,
      writeTimestamp: false,
      maxIssues: 0,
    });
    records.push(summarizeValidation(format, report));
  }
  return records;
}

function summarizeValidation(format, report) {
  const issues = report.issues ?? {};
  return canonicalize({
    format,
    validatorVersion: report.validatorVersion ?? validatorVersion(),
    errorCount: issues.numErrors ?? 0,
    warningCount: issues.numWarnings ?? 0,
    infoCount: issues.numInfos ?? 0,
    hintCount: issues.numHints ?? 0,
    messages: (issues.messages ?? []).map((message) => ({
      code: message.code,
      severity: message.severity,
      message: message.message,
      pointer: message.pointer ?? null,
    })),
  });
}

async function validateRoundTrips(outputs, originalProjection, assetId) {
  const loader = new GLTFLoader();
  const records = [];

  const gltfResult = await loader.parseAsync(new TextDecoder().decode(outputs.gltf), '');
  const gltfProjection = projectScene(gltfResult.scene, assetId);
  records.push({ format: 'gltf', ...compareSceneProjections(originalProjection, gltfProjection) });

  const glbBuffer = outputs.glb.buffer.slice(outputs.glb.byteOffset, outputs.glb.byteOffset + outputs.glb.byteLength);
  const glbResult = await loader.parseAsync(glbBuffer, '');
  const glbProjection = projectScene(glbResult.scene, assetId);
  records.push({ format: 'glb', ...compareSceneProjections(originalProjection, glbProjection) });

  return canonicalize(records);
}

export function projectScene(scene, assetId) {
  scene.updateMatrixWorld(true);
  const nodes = [];
  const materialMap = new Map();
  scene.traverse((object) => {
    const componentId = object.userData?.aios?.componentId;
    if (!componentId) return;
    const parentComponentId = object.parent?.userData?.aios?.componentId ?? null;
    const node = {
      id: componentId,
      name: object.name,
      type: object.userData.aios.componentType,
      parentId: parentComponentId,
      transform: {
        position: object.position.toArray(),
        rotationQuaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
        scale: object.scale.toArray(),
      },
      extras: canonicalize(object.userData.aios.custom ?? {}),
      geometry: null,
      materialId: null,
    };
    if (object.isMesh) {
      node.geometry = projectGeometry(object.geometry, object.userData.aios.componentType);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.length !== 1) {
        throw new SpatialCompilerError('MULTI_MATERIAL_UNSUPPORTED', `Component ${componentId} resolved to multiple materials.`);
      }
      const material = materials[0];
      const materialId = material.userData?.aios?.materialId;
      if (!materialId) throw new SpatialCompilerError('MISSING_ROUND_TRIP_MATERIAL_ID', `Component ${componentId} lost its material semantic ID.`);
      node.materialId = materialId;
      if (!materialMap.has(materialId)) materialMap.set(materialId, projectMaterial(material));
    }
    nodes.push(canonicalize(node));
  });

  return normalizeSceneProjection({
    assetId,
    nodes,
    materials: [...materialMap.values()],
  }).projection;
}

function projectGeometry(geometry, primitiveType) {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox ?? new Box3(new Vector3(), new Vector3());
  return canonicalize({
    primitiveType,
    positionCount: geometry.getAttribute('position')?.count ?? 0,
    normalCount: geometry.getAttribute('normal')?.count ?? 0,
    uvCount: geometry.getAttribute('uv')?.count ?? 0,
    indexCount: geometry.getIndex()?.count ?? 0,
    bounds: {
      min: bounds.min.toArray(),
      max: bounds.max.toArray(),
    },
  });
}

function projectMaterial(material) {
  const alphaMode = material.userData?.aios?.alphaMode
    ?? (material.transparent ? 'BLEND' : material.alphaTest > 0 ? 'MASK' : 'OPAQUE');
  return canonicalize({
    id: material.userData.aios.materialId,
    name: material.name,
    baseColorLinear: [material.color.r, material.color.g, material.color.b],
    emissiveLinear: [material.emissive.r, material.emissive.g, material.emissive.b],
    metalness: material.metalness,
    roughness: material.roughness,
    opacity: material.opacity,
    alphaMode,
    alphaCutoff: material.userData?.aios?.alphaCutoff ?? material.alphaTest ?? 0,
    doubleSided: material.side === DoubleSide,
    extras: canonicalize(material.userData?.aios?.custom ?? {}),
  });
}

function deterministicUuid(seed) {
  const hex = sha256(seed).slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

function installNodePolyfills() {
  if (typeof globalThis.ProgressEvent === 'undefined') {
    globalThis.ProgressEvent = class ProgressEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.lengthComputable = init.lengthComputable ?? false;
        this.loaded = init.loaded ?? 0;
        this.total = init.total ?? 0;
      }
    };
  }

  if (typeof globalThis.FileReader === 'undefined') {
    globalThis.FileReader = class FileReader {
      result = null;
      error = null;
      onload = null;
      onloadend = null;
      onerror = null;

      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then(
          (result) => this.#complete(result),
          (error) => this.#fail(error),
        );
      }

      readAsDataURL(blob) {
        blob.arrayBuffer().then(
          (buffer) => this.#complete(`data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`),
          (error) => this.#fail(error),
        );
      }

      #complete(result) {
        this.result = result;
        const event = { target: this };
        queueMicrotask(() => {
          this.onload?.(event);
          this.onloadend?.(event);
        });
      }

      #fail(error) {
        this.error = error;
        const event = { target: this };
        queueMicrotask(() => {
          this.onerror?.(event);
          this.onloadend?.(event);
        });
      }
    };
  }
}
