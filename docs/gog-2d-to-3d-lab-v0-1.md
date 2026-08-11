# GoG 2D→3D Lab

Status: `EXPERIMENTAL / DRAFT BRANCH / NO MERGE AUTHORIZATION`

The Lab is the interactive control surface for the reusable Girls of Gaming 2D→3D product line. It deliberately separates the web application from GPU reconstruction runtimes.

## Current user flow

1. Upload a 2D character reference.
2. Select an admitted reconstruction provider.
3. Submit the image through `/api/gog-3d-lab/run`.
4. The server forwards the image to the provider worker.
5. The worker runs repo-native inference and normalizes the result to the GoG provider contract.
6. The browser parses and displays the returned OBJ mesh.
7. Inspect front, 3/4, side, back, wireframe, and silhouette views.
8. Download the normalized OBJ for downstream QA/retopology.

## First real provider adapter

### SAM 3D Body + MHR

The first worker lives at:

`workers/gog-sam3d-body/server.py`

It uses the public `facebookresearch/sam-3d-body` inference surface:

- `load_sam_3d_body`
- `SAM3DBodyEstimator`
- `estimator.process_one_image(...)`
- `person_output["pred_vertices"]`
- `estimator.faces`

The worker converts those vertices/faces to a provider-independent OBJ response. It does not redistribute upstream checkpoints or MHR assets.

Main app runtime configuration:

```text
GOG_SAM3D_BODY_ENDPOINT=http://gpu-worker:8100
GOG_SAM3D_BODY_TOKEN=<optional gateway bearer token>
```

If no worker endpoint is configured, the UI shows `WORKER NOT CONFIGURED`, disables repo inference, and keeps the procedural Kan-E-Senna fixture available for viewer testing. It never claims neural inference ran.

## Provider contract v0.1

Worker endpoint:

`POST /reconstruct`

Input is multipart form data:

```text
image=<image file>
use_mask=true
bbox_threshold=0.8
```

Normalized response:

```json
{
  "model": "provider/model identity",
  "mesh_obj": "v ...\nf ...",
  "camera": {},
  "metrics": {},
  "warnings": []
}
```

The browser/server boundary depends on this contract rather than on provider-specific Python types. This is what allows later TRELLIS.2, Hunyuan3D, or other admitted workers to plug into the product line without replacing the evidence/QA interface.

## What the app does today

- source image upload/preview
- SAM3D/MHR provider readiness check
- mask-conditioned and bbox-threshold controls
- server-side provider proxy
- normalized OBJ ingestion
- 3D projection/orbit viewer
- fixed front / 3/4 / side / back views
- wireframe and silhouette inspection
- vertex/face/run metadata
- OBJ download
- procedural baseline reset
- explicit pending stages for camera/silhouette QA, clothing/accessories, and production retopo

## Deliberate boundaries

- generated geometry is never promoted to GoG canon automatically
- inference does not mutate Notion or Drive
- SAM3D/MHR provides the articulated human prior, not final costume truth
- clothing/accessory reconstruction remains a later product-line stage
- PyTorch3D camera/silhouette fitting remains pending
- no model checkpoint or GPU runtime is falsely claimed as installed in the web host
- draft PR only; merge is a separate decision

## Next implementation gate

`GOG_3D_PROVIDER_EXECUTION_FIXTURE_03`

Run one actual source image through a configured SAM3D/MHR GPU worker, capture the returned mesh and metrics, and compare it against the procedural v0.4 fixture before adding clothing or retopology stages.
