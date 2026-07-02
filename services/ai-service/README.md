# ai-service (Python ML)

FastAPI service that runs Whisper (speech-to-text), PySceneDetect (scenes), and
MediaPipe (faces) for the reel pipeline. It shares the project's local `data/`
directory with the Node worker and receives absolute file paths.

## Setup

```bash
cd services/ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
# from services/ai-service, with the venv active
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Environment (optional, inherited from the root `.env`):

- `WHISPER_DEVICE` (default `cpu`) — set `cuda` if you have a GPU.
- `WHISPER_COMPUTE_TYPE` (default `int8`) — e.g. `float16` on GPU.

## Endpoints

- `GET /health`
- `POST /transcribe` `{ "path": "/abs/audio.wav", "model": "base" }`
- `POST /scenes` `{ "path": "/abs/video.mp4" }`
- `POST /faces` `{ "frames_dir": "/abs/frames", "fps": 2 }`

The Node worker degrades gracefully (empty transcript / no scenes / center-crop)
if this service is unavailable, so the pipeline never hard-fails.
