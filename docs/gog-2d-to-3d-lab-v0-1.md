# GoG 2D→3D Lab

Status: `EXPERIMENTAL / DRAFT BRANCH / NO MERGE AUTHORIZATION`

The Lab is the interactive control surface for the reusable Girls of Gaming 2D→3D product line. The browser/server app stays lightweight while heavy GPU reconstruction runs in a replaceable worker.

## User flow

1. Upload a 2D character image.
2. Select an admitted reconstruction provider.
3. Submit through `/api/gog-3d-lab/run`.
4. The server forwards the image to the provider worker.
5. The worker performs repo-native inference and returns the provider-independent mesh contract.
6. The browser renders the normalized OBJ and exposes front, 3/4, side, back, wireframe, and silhouette inspection.
7. Download the OBJ for downstream fitting, clothing, retopology, and rigging.

## First real provider adapter

`worker/gog-sam3d-body/server.py`

The adapter uses the public `facebookresearch/sam-3d-body` inference surface and its MHR body representation. It reads `pred_vertices` plus `estimator.faces` and converts them to a normalized OBJ payload for the web app.

The repository does not redistribute SAM 3D Body checkpoints or MHR model assets.

## Runtime bindings

Web application:

```text
GOG_SAM3D_BODY_ENDPOINT=http://gpu-worker:8100
GOG_SAM3D_BODY_TOKEN=<optional bearer token>
```

GPU worker:

```text
SAM3D_CHECKPOINT_PATH=/models/sam3d/model.ckpt
SAM3D_MHR_PATH=/models/sam3d/assets/mhr_model.pt
```

When the endpoint is absent, the UI explicitly reports `WORKER NOT CONFIGURED`, disables neural reconstruction, and retains a procedural baseline for viewer QA.

## Provider contract

`POST /reconstruct`

Multipart input:

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

## Current app capability

- source upload and preview
- provider readiness state
- SAM3D/MHR inference routing
- mask-conditioned and bbox-threshold controls
- normalized OBJ ingestion
- interactive orbit and fixed-angle inspection
- wireframe and silhouette modes
- vertex/face/runtime metadata
- OBJ download
- procedural baseline reset
- explicit pending stages for camera-fit QA, clothing/accessories, retopology, and skinning

## ChatGPT app bridge

The same draft branch now includes a thin ChatGPT-facing MCP adapter instead of duplicating AIOS logic inside a widget.

```text
ChatGPT inline widget
  → worker/aios-chatgpt-app/server.py `/mcp`
  → /api/aios-bridge
  → live capability registry + workflow kernel
  → existing /gog-3d-lab and provider surfaces
```

The backend bridge exposes:

- standard read-only `search` and `fetch` over bounded repository execution truth
- `aios_status` inventory
- `run_backend_workflow` through a backend-enforced `SIMULATION` action only
- `open_aios_workbench` to render the inline ChatGPT UI

The initial bridge scope is `global-working-memory` with coverage `REPOSITORY_EXECUTION_TRUTH_ONLY`. It does not project full Notion/Drive memory authority and does not grant MASON or destination-write authority.

Server-to-server calls may be protected with a matching `AIOS_BRIDGE_TOKEN`. The MCP endpoint itself still requires a production user-auth slice before public deployment, so the current bridge is Developer Mode only.

## Boundaries

- the human-prior worker does not own character canon
- inference never auto-writes Notion or Drive
- generated meshes are candidates until GoG QA admits them
- SAM3D/MHR owns the articulated human prior, not costume/hair/accessory truth
- PyTorch3D camera/silhouette scoring remains a later stage
- GPU/checkpoint availability is never fabricated by the web UI
- ChatGPT bridge search/fetch remain read-only
- ChatGPT workflow execution is forced to SIMULATION
- merge remains a separate authorization decision

## Next gates

### Provider execution

`GOG_3D_PROVIDER_EXECUTION_FIXTURE_03`

Run one admitted source image through a configured SAM3D/MHR worker and compare the returned prior against the procedural Kan-E-Senna baseline before extending the product line into clothing or production retopology.

### ChatGPT bridge execution

`AIOS_CHATGPT_APP_BRIDGE_FIXTURE_01`

Deploy or tunnel the MCP worker, connect `/mcp` through ChatGPT Developer Mode, render the inline workbench, verify `search`/`fetch`, and run one registered workflow in SIMULATION. No public deployment or authority expansion until authentication is separately admitted.
