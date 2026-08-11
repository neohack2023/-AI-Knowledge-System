"""GPU sidecar for the GoG 2D→3D Lab.

This adapter uses the public SAM 3D Body API directly and normalizes its
MHR mesh output into the provider-independent web contract consumed by
/app/api/gog-3d-lab/run.

Expected runtime environment:
- facebookresearch/sam-3d-body installed/importable
- SAM 3D Body checkpoint available
- MHR asset available
- CUDA recommended
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from sam_3d_body import SAM3DBodyEstimator, load_sam_3d_body

app = FastAPI(title="GoG SAM 3D Body + MHR Worker", version="0.1.0")

_estimator: SAM3DBodyEstimator | None = None


def get_estimator() -> SAM3DBodyEstimator:
    global _estimator
    if _estimator is not None:
        return _estimator

    checkpoint = os.environ.get("SAM3D_CHECKPOINT_PATH", "").strip()
    mhr_path = os.environ.get("SAM3D_MHR_PATH", "").strip()
    if not checkpoint or not mhr_path:
        raise RuntimeError("SAM3D_CHECKPOINT_PATH and SAM3D_MHR_PATH are required")

    device = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    model, cfg = load_sam_3d_body(checkpoint, device=device, mhr_path=mhr_path)

    # Detection/FOV helpers are intentionally omitted here. The estimator may still
    # be supplied prompts by a later adapter revision. This worker keeps the first
    # contract narrow and reproducible.
    _estimator = SAM3DBodyEstimator(
        sam_3d_body_model=model,
        model_cfg=cfg,
        human_detector=None,
        human_segmentor=None,
        fov_estimator=None,
    )
    return _estimator


def to_obj(vertices: np.ndarray, faces: np.ndarray) -> str:
    lines: list[str] = ["# GoG normalized SAM 3D Body / MHR mesh"]
    lines.extend(f"v {x:.7f} {y:.7f} {z:.7f}" for x, y, z in vertices)
    # OBJ is 1-indexed.
    lines.extend(f"f {a + 1} {b + 1} {c + 1}" for a, b, c in faces.astype(np.int64))
    return "\n".join(lines) + "\n"


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model": "sam3d-body+mhr",
        "cuda": torch.cuda.is_available(),
        "checkpointConfigured": bool(os.environ.get("SAM3D_CHECKPOINT_PATH")),
        "mhrConfigured": bool(os.environ.get("SAM3D_MHR_PATH")),
    }


@app.post("/reconstruct")
async def reconstruct(
    image: UploadFile = File(...),
    use_mask: bool = Form(True),
    bbox_threshold: float = Form(0.8),
) -> dict[str, Any]:
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="image upload required")

    estimator = get_estimator()
    suffix = Path(image.filename or "reference.png").suffix or ".png"
    with tempfile.TemporaryDirectory(prefix="gog-sam3d-") as tmp:
        path = Path(tmp) / f"input{suffix}"
        path.write_bytes(await image.read())

        # process_one_image is the repo-native inference surface used by demo.py.
        outputs = estimator.process_one_image(
            str(path),
            bbox_thr=float(bbox_threshold),
            use_mask=bool(use_mask),
        )

    if not outputs:
        raise HTTPException(status_code=422, detail="no human reconstruction returned")

    # GoG v0.1 is intentionally single-subject. Preserve the strongest/first
    # recovered subject and surface a warning if more than one is detected.
    person = outputs[0]
    vertices = np.asarray(person["pred_vertices"], dtype=np.float32)
    faces = np.asarray(estimator.faces, dtype=np.int64)
    cam_t = np.asarray(person.get("pred_cam_t", [0, 0, 0]), dtype=np.float32)
    keypoints = np.asarray(person.get("pred_keypoints_2d", []), dtype=np.float32)

    return {
        "model": "facebookresearch/sam-3d-body + facebookresearch/MHR",
        "mesh_obj": to_obj(vertices, faces),
        "camera": {
            "translation": cam_t.tolist(),
            "focalLength": float(person.get("focal_length", 0.0)),
        },
        "metrics": {
            "vertexCount": int(vertices.shape[0]),
            "faceCount": int(faces.shape[0]),
            "keypointCount": int(keypoints.shape[0]) if keypoints.ndim else 0,
            "personCount": len(outputs),
            "bbox": np.asarray(person.get("bbox", []), dtype=np.float32).tolist(),
        },
        "warnings": ["MULTIPLE_PEOPLE_DETECTED"] if len(outputs) > 1 else [],
    }
