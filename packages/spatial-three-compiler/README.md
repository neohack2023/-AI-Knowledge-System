# AIOS Spatial Three Compiler

Status: Candidate implementation slice  
Contracts: `SpatialAssetBlueprint/0.1`, `ThreeCompilerReceipt/0.1`

This package compiles a governed Spatial Asset Blueprint into canonical, in-memory glTF and GLB artifacts using an exact Three.js toolchain.

```text
Spatial Asset Blueprint
  -> fail-closed normalization
  -> stable semantic identity map
  -> deterministic Three.js scene graph
  -> bounded primitive geometry and PBR materials
  -> glTF extras metadata
  -> canonical glTF and GLB export
  -> Khronos validation
  -> GLTFLoader round trip
  -> normalized structural comparison
  -> compiler receipt
```

## Boundaries

The package does not:

- execute arbitrary JavaScript from blueprint data
- load remote textures or other network resources
- accept custom shaders
- write files or mutate external destinations
- register itself as an Active capability
- authorize workflow execution, canon changes, or durable writes
- compress, optimize, or repair generated assets silently

All outputs remain in memory. Callers decide where an authorized artifact may be written.

## Exact toolchain

- Node.js `>=22.13.0`
- Three.js `0.185.1`
- Khronos `gltf-validator` `2.0.0-dev.3.10`

The dependency versions are exact and locked in this package's `package-lock.json`.

## Supported blueprint surface

Coordinate system:

- right-handed
- Y up
- -Z forward
- source units: meters, centimeters, or millimeters
- compiler units: meters

Primitive nodes:

- group
- box
- sphere
- cylinder
- cone
- capsule
- plane
- torus

Materials use a bounded `MeshStandardMaterial` profile:

- base color
- metalness
- roughness
- emissive color
- opacity
- OPAQUE, MASK, or BLEND alpha mode
- alpha cutoff
- double-sided flag

Unknown fields fail closed instead of being silently approximated.

## Usage

```js
import { compileSpatialAsset } from '@aios/spatial-three-compiler';

const result = await compileSpatialAsset(blueprint);

result.outputs.gltf;   // Uint8Array
result.outputs.glb;    // Uint8Array
result.receipt;        // ThreeCompilerReceipt/0.1
```

## Determinism grades

This slice gates:

- semantic determinism
- structural determinism
- normalized numeric determinism

It also records binary SHA-256 digests. Byte-identical output is tested on the pinned toolchain, but the normalized scene digest remains the durable comparison authority across future dependency migrations.

## Validation

Run:

```sh
npm ci --ignore-scripts
npm test
```

The test suite verifies four frozen synthetic fixtures plus negative validation cases. Every compiled fixture must pass the Khronos validator for both glTF and GLB and must survive a GLTFLoader round trip with no normalized structural drift.
