# Development Guide

AI Reel Generator — local, personal-use pipeline that turns long videos into scored,
captioned, 9:16 reels for review. Monorepo: NestJS API + BullMQ worker, a Python FastAPI
ML service, and a Next.js + shadcn admin UI.

## Prerequisites

- Node 22+ and pnpm 10+
- Python 3.10+ (for the ai-service)
- Docker (for Postgres, Redis, Ollama)
- FFmpeg is **not** required system-wide — the worker uses the bundled
  `ffmpeg-static` / `ffprobe-static` binaries. (Set `FFMPEG_PATH` / `FFPROBE_PATH`
  in `.env` to override.)

## 1. Configure

```bash
cp .env.example .env
```

## 2. Start infra (Postgres, Redis, Ollama)

```bash
pnpm infra:up
# Pull the LLM once (matches OLLAMA_MODEL in .env):
docker compose exec ollama ollama pull qwen2.5:7b
```

### Choosing the Ollama model

The LLM handles titles, tags, hook/emotion scoring, and highlight ranking — all
structured JSON tasks. Set `OLLAMA_MODEL` in `.env`:

| Model | RAM | Notes |
|---|---|---|
| `qwen2.5:7b` (default) | ~4.7 GB | Best quality/speed balance on CPU; reliable JSON |
| `qwen2.5:3b` | ~2 GB | ~2–3× faster on CPU, still good |
| `llama3.1:8b` | ~4.7 GB | Alternative; per PRD |

Ollama runs in Docker (no native install). On a GPU, set `WHISPER_DEVICE=cuda` for
faster transcription; Ollama uses the GPU automatically if available. The pipeline
still completes with heuristic fallbacks if Ollama isn't running.

## 3. Install & migrate

```bash
pnpm install
pnpm --filter @arg/shared build      # build shared types (used by api + web)
pnpm --filter @arg/api prisma:generate
pnpm --filter @arg/api prisma:migrate
```

## 4. Start the Python ai-service

```bash
cd services/ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 5. Start the app (API, worker, web)

```bash
pnpm dev            # runs api (:4000), worker, and web (:3000) together
# or individually:
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

- Web UI:  http://localhost:3000
- API + Swagger:  http://localhost:4000/docs
- Media served at:  http://localhost:4000/files/...

## Run everything in Docker (alternative)

Instead of the hybrid dev workflow above, run the whole stack in containers:

```bash
docker compose --profile full up --build
docker compose exec ollama ollama pull qwen2.5:7b   # one-time
```

This builds and runs `api`, `worker`, `web`, and `ai-service` alongside Postgres,
Redis, and Ollama. The API applies DB migrations on startup. Media persists in the
`appdata` volume. (`pnpm infra:up` still starts only the infra services for the
hybrid workflow.)

## GPU (optional)

CPU works out of the box. On an NVIDIA GPU:

- Set `WHISPER_DEVICE=cuda` and `WHISPER_COMPUTE_TYPE=float16` for faster transcription.
- Uncomment the `deploy.resources.reservations.devices` blocks for `ollama` (and
  `ai-service`) in `docker-compose.yml` so they can use the GPU.

## Settings

Pipeline knobs (candidate count, duration buckets, sample fps, caption preset,
karaoke, retain-intermediates) can be changed live at **/settings** in the web UI
(persisted in the `app_settings` table, layered over `.env`) — no restart needed.

## Tests

```bash
pnpm --filter @arg/api test   # unit tests for crop/scoring/highlights/captions + an ffmpeg smoke
```

## Flow

Upload a video in the UI → watch the pipeline
(validate → transcode → transcribe → scenes → faces → highlights → render) →
review candidate reels (score breakdown, captions, 9:16 crop, 3 thumbnails) →
approve / trim / regenerate / publish (exports to `data/published/`) or download.

## Fault tolerance

Every AI step degrades gracefully: if the ai-service or Ollama is down the pipeline
still completes using heuristic fallbacks (empty transcript, no captions, center crop,
heuristic scoring). Kill the ai-service and re-upload to see this.

## Storage layout (`DATA_DIR`, default `./data`)

```
data/
  videos/<videoId>/
    original.<ext>
    renditions/{1080p,720p,480p}.mp4
    audio.wav
    frames/frame-000001.jpg…
    reels/<reelId>.mp4 (+ .ass captions)
    thumbnails/<reelId>-{1,2,3}.jpg
  published/<reelId>.mp4
```

## Phase 2 (deferred)

Reel analytics ingestion, AI learning engine, founder insights dashboard, and the
prediction engine — schema/interfaces are designed to accommodate these later.
