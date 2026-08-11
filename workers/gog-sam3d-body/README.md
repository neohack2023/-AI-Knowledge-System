# GoG SAM 3D Body + MHR worker

GPU sidecar used by the Girls of Gaming 2D→3D Lab.

It intentionally keeps the browser/server application separate from the heavyweight reconstruction environment. The web app submits one image to this worker; the worker runs the public `facebookresearch/sam-3d-body` API and normalizes the recovered MHR mesh into a provider-independent OBJ response.

## Required upstream repositories/assets

- `facebookresearch/sam-3d-body`
- `facebookresearch/MHR` model asset consumed by SAM 3D Body

Follow the upstream repositories' checkpoint and license instructions. This directory does not redistribute checkpoints or model assets.

## Worker environment

```text
SAM3D_CHECKPOINT_PATH=/models/sam3d/model.ckpt
SAM3D_MHR_PATH=/models/sam3d/assets/mhr_model.pt
```

Run the worker in an environment where SAM 3D Body and its dependencies are installed:

```bash
uvicorn server:app --host 0.0.0.0 --port 8100
```

The main web application points to the worker with:

```text
GOG_SAM3D_BODY_ENDPOINT=http://gpu-worker:8100
```

Optionally set `GOG_SAM3D_BODY_TOKEN` when the worker is placed behind a bearer-token gateway.

## Contract

`GET /health`

Returns runtime/checkpoint readiness.

`POST /reconstruct`

Multipart fields:

- `image`: required image file
- `use_mask`: boolean, default true
- `bbox_threshold`: float, default 0.8

Response:

```json
{
  "model": "facebookresearch/sam-3d-body + facebookresearch/MHR",
  "mesh_obj": "v ...\\nf ...",
  "camera": { "translation": [0,0,0], "focalLength": 0 },
  "metrics": {
    "vertexCount": 18439,
    "faceCount": 0,
    "keypointCount": 0,
    "personCount": 1,
    "bbox": []
  },
  "warnings": []
}
```

## Deliberate v0.1 boundaries

- single subject only
- human prior only; costume/hair/accessory reconstruction remains a separate stage
- no generated-reference promotion to canon
- no automatic Drive/Notion write-back from inference
- no claim that browser hosting is a suitable GPU execution environment
