"""AI service for the Reel Generator.

Keeps heavy ML models (Whisper / MediaPipe) warm in memory and exposes them over
HTTP to the NestJS worker. Both processes share the local filesystem (DATA_DIR),
so requests pass absolute file paths rather than uploading media.

Endpoints:
    GET  /health
    POST /transcribe  { path, model }        -> { language, segments[] }
    POST /scenes      { path }               -> { scenes[] }
    POST /faces       { frames_dir, fps }    -> { samples[] }
"""
from __future__ import annotations

import glob
import os
from functools import lru_cache
from typing import List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="AI Reel Generator - ML Service", version="1.0")


# --------------------------- request models ---------------------------
class TranscribeReq(BaseModel):
    path: str
    model: str = "base"


class ScenesReq(BaseModel):
    path: str


class FacesReq(BaseModel):
    frames_dir: str
    fps: float = 2.0


# --------------------------- model loaders ----------------------------
@lru_cache(maxsize=4)
def get_whisper(model_name: str):
    from faster_whisper import WhisperModel

    device = os.environ.get("WHISPER_DEVICE", "cpu")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    return WhisperModel(model_name, device=device, compute_type=compute_type)


@lru_cache(maxsize=1)
def get_face_detector():
    import mediapipe as mp

    # model_selection=1 = full-range model (better for varied distances)
    return mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.4)


# --------------------------- endpoints --------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/transcribe")
def transcribe(req: TranscribeReq) -> dict:
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"audio not found: {req.path}")
    model = get_whisper(req.model)
    segments, info = model.transcribe(req.path, vad_filter=True, beam_size=1)
    out: List[dict] = [
        {"start": float(s.start), "end": float(s.end), "text": s.text.strip()}
        for s in segments
        if s.text and s.text.strip()
    ]
    return {"language": getattr(info, "language", None), "segments": out}


@app.post("/scenes")
def scenes(req: ScenesReq) -> dict:
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"video not found: {req.path}")
    from scenedetect import detect, ContentDetector

    try:
        scene_list = detect(req.path, ContentDetector())
    except Exception as exc:  # pragma: no cover - detector edge cases
        raise HTTPException(status_code=500, detail=f"scene detection failed: {exc}")

    ranges = [(s.get_seconds(), e.get_seconds()) for s, e in scene_list]
    if not ranges:
        dur = _video_duration(req.path)
        ranges = [(0.0, dur)]

    motions = _scene_motion(req.path, ranges)
    scenes_out = [
        {"startSec": round(a, 3), "endSec": round(b, 3), "motion": round(m, 4)}
        for (a, b), m in zip(ranges, motions)
    ]
    return {"scenes": scenes_out}


@app.post("/faces")
def faces(req: FacesReq) -> dict:
    frames = sorted(glob.glob(os.path.join(req.frames_dir, "frame-*.jpg")))
    if not frames:
        return {"samples": []}
    detector = get_face_detector()
    samples = []
    for idx, fp in enumerate(frames):
        img = cv2.imread(fp)
        if img is None:
            continue
        t = idx / max(0.001, req.fps)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        result = detector.process(rgb)
        boxes = []
        if result.detections:
            for det in result.detections:
                box = det.location_data.relative_bounding_box
                score = float(det.score[0]) if det.score else 0.0
                boxes.append(
                    {
                        "x": _clamp01(box.xmin),
                        "y": _clamp01(box.ymin),
                        "w": _clamp01(box.width),
                        "h": _clamp01(box.height),
                        "score": round(score, 3),
                    }
                )
        samples.append({"t": round(t, 3), "boxes": boxes})
    return {"samples": samples}


# --------------------------- helpers ----------------------------------
def _clamp01(v: float) -> float:
    return round(max(0.0, min(1.0, float(v))), 4)


def _video_duration(path: str) -> float:
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frames = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
    cap.release()
    return float(frames / fps) if fps else 0.0


def _scene_motion(path: str, ranges: List[tuple]) -> List[float]:
    """Approximate per-scene motion via mean absolute frame difference (0..1)."""
    cap = cv2.VideoCapture(path)
    motions: List[float] = []
    for a, b in ranges:
        times = np.linspace(a, b, num=5)[1:-1] if b > a else [a]
        prev: Optional[np.ndarray] = None
        diffs: List[float] = []
        for t in times:
            cap.set(cv2.CAP_PROP_POS_MSEC, float(t) * 1000.0)
            ok, frame = cap.read()
            if not ok:
                continue
            g = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.int16)
            if prev is not None:
                diffs.append(float(np.mean(np.abs(g - prev))))
            prev = g
        motions.append(min(1.0, (float(np.mean(diffs)) if diffs else 0.0) / 40.0))
    cap.release()
    return motions
