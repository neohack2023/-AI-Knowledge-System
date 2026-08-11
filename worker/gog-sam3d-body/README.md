# GoG SAM 3D Body + MHR worker

GPU sidecar for the Girls of Gaming 2D→3D Lab.

The web application stays lightweight; reconstruction runs in a separate GPU environment that has the upstream `facebookresearch/sam-3d-body` package, checkpoint, and MHR asset installed.

## Worker environment

```text
SAM3D_CHECKPOINT_PATH=/models/sam3d/model.ckpt
SAM3D_MHR_PATH=/models/sam3d/assets/mhr_model.pt
```

Start the worker from an environment where SAM 3D Body and its dependencies are already installed:

```bash
uvicorn server:app --host 0.0.0.0 --port 8100
```

Point the main app at the worker:

```text
GOG_SAM3D_BODY_ENDPOINT=http://gpu-worker:8100
```

Optional gateway authentication:

```text
GOG_SAM3D_BODY_TOKEN=<bearer token>
```

## Contract

`GET /health` returns readiness.

`POST /reconstruct` accepts multipart form data:

- `image`
- `use_mask` (default `true`)
- `bbox_threshold` (default `0.8`)

It returns a normalized payload containing:

- model identity
- OBJ mesh text
- recovered camera metadata
- vertex/face/keypoint counts
- warnings

## Boundaries

- single-subject fixture in v0.1
- MHR human prior only, not final costume truth
- no checkpoint/model redistribution
- no Notion/Drive mutation from inference
- no automatic canon promotion
- production clothing, accessories, camera-fit QA, retopology, skinning, and export remain later product-line stages
