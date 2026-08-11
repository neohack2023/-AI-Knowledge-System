# GoG 2D→3D Lab v0.1

Status: `EXPERIMENTAL / DRAFT BRANCH / NO MERGE AUTHORIZATION`

Character fixture: Kan-E-Senna

## Purpose

Turn the reusable Girls of Gaming 2D→3D research into an executable product-line surface without pretending external neural providers ran when their checkpoints and runtimes are not admitted in this environment.

## Current executable chain

```text
source evidence
→ identity / costume locks
→ region decomposition
→ procedural fallback mesh
→ interactive multi-view inspection
→ wireframe / silhouette inspection
→ GLB + OBJ artifact
```

The current v0.4 fixture carries two corrections from the latest review:

- horn / head structures are muted gray-blue rather than saturated blue;
- unsupported robe chains, dangling gems, heels and invented hem decoration are excluded from the geometry.

## Provider slots

The product line deliberately separates provider adapters from GoG policy:

- SAM 3D Body → image-guided articulated-human recovery
- MHR → human topology / skeleton / identity / expression prior
- ECON-derived mechanism → articulated body under separate loose clothing
- PyTorch3D → source-camera fit, landmark reprojection and silhouette QA
- RigNet → fallback rig / skin benchmark for arbitrary meshes
- TRELLIS.2 / Hunyuan3D → optional costume / accessory proposal engines behind license and provenance gates

None of those neural providers is represented as executed by this branch.

## Interface

Route: `/gog-3d-lab`

The route is dependency-free and uses a canvas renderer so it does not add a new Three.js package or disturb the existing lockfile. It provides:

- front / three-quarter / side / back views
- drag orbit and wheel zoom
- wireframe mode
- silhouette mode
- visible pipeline stage state
- explicit `PROVISIONAL / NOT CANON GEOMETRY` labeling

## Product-line invariant

The generator is replaceable. Evidence authority, provenance, QA, viewer, promotion gates and acceptance semantics are not.

A future SAM3D/MHR adapter should be able to replace the procedural body prior without replacing the rest of the pipeline.

## Next validation

`GOG_3D_HUMAN_PRIOR_ADAPTER_FIXTURE_02`

Required comparison:

1. run an admitted human-prior provider against the same source packet;
2. fit / solve the source camera;
3. compare silhouette and landmark error against this v0.4 fallback;
4. inspect neutral-pose likeness and deformation readiness;
5. keep FACE-RETOPO-04 blocked until the prior-fit result passes.
