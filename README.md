# AI Reel Generator

Turn long-form videos into **scored, captioned, face-centered 9:16 reels** — automatically.

Upload a long video and the pipeline transcribes it, detects scenes and faces, finds the most
reel-worthy moments, then renders 10–20 vertical candidate clips (each with burned captions,
3 thumbnails, an AI-generated title/tags, and an 8-factor score) for you to review, trim, and
export. Built for **personal, local use** — everything runs on your machine, nothing is deployed
or published to third parties.

> Status: **Phase 1 core pipeline + Phase 1.5 enhancements — complete.** Analytics, AI learning
> engine, founder dashboard, and prediction engine are the deferred Phase 2 roadmap.

---

## Features

- **Upload** long videos (MP4 / MOV / MKV / AVI) with configurable size limits.
- **Multi-rendition transcode** (1080p / 720p / 480p) + audio & frame extraction (FFmpeg).
- **Speech-to-text** with Whisper → timestamped, **word-level** transcript (English/Hindi and more).
- **Scene detection** (PySceneDetect) and **face detection** (MediaPipe).
- **Highlight detection** — combines transcript, scenes, audio energy, and an LLM ranking to pick
  the best 10–20 windows at 15/30/45/60s, snapped to sentence boundaries.
- **Active-speaker 9:16 crop** with smoothed "camera movement"; **blurred-fill** fallback for
  face-less scenes.
- **Word-level "karaoke" captions** (falls back to plain), with style presets and safe-zones.
- **Audio loudness normalization** for consistent volume across reels.
- **AI scoring engine** — hook, emotion, speech, motion, face visibility, scene quality, replay
  prediction, and an overall score used to rank candidates.
- **AI titles & tags** per reel (local LLM via Ollama).
- **Admin review** — approve / reject / **edit title/tags/captions** / trim / regenerate /
  select thumbnail / publish (export locally) / download / **delete**; filter & sort the grid.
- **Manual clips** — cut your own window at 9:16 / 1:1 / 4:5; **batch zip export** of approved reels.
- **Live settings** — tune candidate count, durations, sample rate, captions from `/settings`
  (no restart); automatic disk cleanup of intermediates.
- **Retry** a failed video from its last incomplete step; **health indicator** shows when the
  pipeline is running in fallback mode.
- **Fault tolerant** — every AI step has a heuristic fallback, so the pipeline completes even if
  the ML service or LLM is down.

---

## How it works

```
Upload ─▶ Validate ─▶ Transcode & extract ─▶ Transcribe (word-level) ─▶ Scene detection
   ─▶ Face detection ─▶ Highlight detection (sentence-aligned) ─▶ Render ─▶ Ready ─▶ Review ─▶ Export

Render per reel: active-speaker 9:16 crop (or blurred-fill) → karaoke captions →
                 loudness-normalized audio → 3 thumbnails → 8-factor score → AI title/tags
```

Each step is a resumable, retryable job on a Redis/BullMQ queue; the render stage fans out (one
job per candidate reel) with a race-free fan-in. Intermediates (sampled frames, audio) are
auto-purged when no longer needed, and a failed video can be **retried from its last incomplete step**.

## Architecture

```
                 ┌─────────────┐        ┌──────────────────┐
 Browser ─────▶  │  web (Next) │ ─HTTP▶ │  api (NestJS)    │ ──▶ PostgreSQL (Prisma)
 shadcn admin    └─────────────┘        │  REST + Swagger  │ ──▶ local filesystem (data/)
                                        └───────┬──────────┘
                                                │ enqueue (BullMQ / Redis)
                                        ┌───────▼──────────┐
                                        │ worker (NestJS)  │  orchestrates the pipeline
                                        └───┬───────┬──────┘
                        FFmpeg / ffprobe ◀──┘       └──▶ HTTP
                        (transcode, crop,           ┌──────────────────────┐
                         captions, thumbs)          │ ai-service (FastAPI) │
                        Ollama HTTP ◀────────────────│  Whisper / PySceneDetect
                        (scoring, titles)            │  MediaPipe (faces)   │
                                                     └──────────────────────┘
```

- `api` and `worker` share one NestJS codebase (two entrypoints), so worker failures don't take
  down the API.
- `ai-service` keeps the heavy ML models warm in memory; both processes share the local `data/`
  directory and pass file paths (no uploads over HTTP).
- FFmpeg uses the bundled `ffmpeg-static` / `ffprobe-static` binaries — **no system FFmpeg install
  required**.

## Tech stack

| Concern | Choice |
|---|---|
| Backend / worker | NestJS (REST + Swagger) + BullMQ (flows) |
| Queue / cache | Redis |
| Database | PostgreSQL + Prisma |
| Storage | Local filesystem (swappable `StorageService`) |
| Media | FFmpeg / ffprobe (bundled static binaries) |
| Speech-to-text | faster-whisper (word-level timestamps) |
| Scenes / faces | PySceneDetect / MediaPipe |
| LLM | Ollama (default `qwen2.5:7b`), pluggable `LlmProvider` |
| Captions | ASS subtitles (karaoke `\k`) burned via FFmpeg |
| Zip export | archiver |
| Frontend | Next.js (App Router) + shadcn/ui + Tailwind |
| Tests | Jest + ts-jest (unit + ffmpeg smoke) |
| Packaging | Docker Compose (`full` profile) |
| Monorepo | pnpm workspaces |

## Monorepo layout

```
al-reel-generator/
  apps/
    api/            NestJS API + BullMQ worker + Prisma schema/migrations
      src/videos, reels, health, settings   REST modules
      src/pipeline/steps, util               pipeline steps + crop/captions/scoring/aspect utils
    web/            Next.js + shadcn/ui admin panel (upload, review, /settings)
  services/
    ai-service/     Python FastAPI (Whisper / PySceneDetect / MediaPipe) + Dockerfile
  packages/
    shared/         Shared TypeScript DTOs (api + web)
  docs/             PRD + DEVELOPMENT.md
  Dockerfile.node   api/worker/web image
  docker-compose.yml
```

---

## Quick start

Full, step-by-step instructions are in **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**. In short:

```bash
# 1. Config
cp .env.example .env

# 2. Infra (Postgres, Redis, Ollama) and pull the LLM once
pnpm infra:up
docker compose exec ollama ollama pull qwen2.5:7b

# 3. Install, build shared types, migrate the DB
pnpm install
pnpm --filter @arg/shared build
pnpm --filter @arg/api prisma:generate
pnpm --filter @arg/api prisma:migrate

# 4. Python ML service
cd services/ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000   # use the port in your .env

# 5. Run API + worker + web (from the repo root, new terminal)
pnpm dev
```

Then open:

- **Web UI:** http://localhost:3000
- **API + Swagger:** http://localhost:4000/docs
- **Media files:** http://localhost:4000/files/...

Or run the whole stack in containers:

```bash
docker compose --profile full up --build
docker compose exec ollama ollama pull qwen2.5:7b
```

Run the tests with `pnpm --filter @arg/api test`.

> **Prerequisites:** Node 22+, pnpm 10+, Python 3.10+, Docker. FFmpeg is bundled (no install).

## Using it

1. Upload a video in the web UI (or `POST /videos`).
2. Watch the pipeline progress live; **retry** if a step fails.
3. Review candidate reels: player, score breakdown, transcript, tags, 3 thumbnails — **filter & sort** the grid.
4. **Edit** the AI title/tags/captions, **trim**, **regenerate**, switch **aspect ratio**, or make a **manual clip**.
5. Approve, then **Publish** (exports to `data/published/`), **Download**, or **Export approved** as a zip.
6. Tune the pipeline anytime at **/settings** — no restart.

## Key API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/videos` | Upload a video, start the pipeline |
| GET | `/videos` \| `/videos/:id` | List / get videos |
| GET | `/videos/:id/status` | Pipeline progress (per-step) |
| GET | `/videos/:id/reels` | Candidate reels (scored, ordered) |
| POST | `/videos/:id/reels` | Create a **manual clip** (custom window + aspect) |
| GET | `/videos/:id/reels/export.zip` | **Batch zip** of rendered reels (default: approved + published) |
| POST | `/videos/:id/retry` | **Retry** from the earliest incomplete step |
| DELETE | `/videos/:id` | Delete a video + its reels + files |
| PATCH | `/reels/:id` | **Edit** title / tags / captions |
| POST | `/reels/:id/approve` \| `/reject` \| `/publish` | Review actions |
| POST | `/reels/:id/trim` \| `/regenerate` | Re-render (regenerate accepts a new aspect ratio) |
| POST | `/reels/:id/thumbnail` | Select a thumbnail |
| GET | `/reels/:id/download` | Download the rendered reel |
| DELETE | `/reels/:id` | Delete a reel + its files |
| GET / PUT | `/settings` | Read / update live pipeline settings |
| GET | `/health` \| `/health/services` | Liveness / dependency reachability |

Interactive docs at `/docs` (Swagger).

## Configuration

Defaults live in `.env` (see `.env.example`): database/Redis URLs (`POSTGRES_PORT` for a custom
host port), `DATA_DIR`, upload limits, allowed formats, candidate count, duration buckets, frame
sample rate, `RETAIN_INTERMEDIATES`, `AI_SERVICE_URL`, `OLLAMA_MODEL`, Whisper model/device, and
caption options (`CAPTION_PRESET`, `CAPTION_KARAOKE`).

Most pipeline knobs can also be changed **live from the `/settings` UI** (persisted in the
`app_settings` table, layered over `.env`) — candidate count, duration buckets, sample rate,
caption preset/karaoke, and retain-intermediates, all without a restart. On CPU-only machines,
pick a smaller `OLLAMA_MODEL` (e.g. `qwen2.5:3b`) for faster processing.

## Roadmap (Phase 2)

Reel analytics ingestion, AI learning engine (best categories/duration/timing/hooks), founder
insights dashboard, prediction engine, and (optional) social publishing. The schema and service
interfaces are designed to accommodate these.

---

_Personal project — for local use only._
