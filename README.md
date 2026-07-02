# AI Reel Generator

Turn long-form videos into **scored, captioned, face-centered 9:16 reels** — automatically.

Upload a long video and the pipeline transcribes it, detects scenes and faces, finds the most
reel-worthy moments, then renders 10–20 vertical candidate clips (each with burned captions,
3 thumbnails, an AI-generated title/tags, and an 8-factor score) for you to review, trim, and
export. Built for **personal, local use** — everything runs on your machine, nothing is deployed
or published to third parties.

> Status: **Phase 1 (core generation pipeline) — complete.** Analytics, AI learning engine,
> founder dashboard, and prediction engine are the deferred Phase 2 roadmap.

---

## Features

- **Upload** long videos (MP4 / MOV / MKV / AVI) with configurable size limits.
- **Multi-rendition transcode** (1080p / 720p / 480p) + audio & frame extraction (FFmpeg).
- **Speech-to-text** with Whisper → timestamped transcript (English/Hindi and more).
- **Scene detection** (PySceneDetect) and **face detection** (MediaPipe).
- **Highlight detection** — combines transcript, scenes, audio energy, and an LLM ranking to pick
  the best 10–20 windows at 15/30/45/60s.
- **Auto 9:16 crop** centered on the dominant speaker, with smoothed "camera movement".
- **Burned captions** generated from the transcript.
- **3 thumbnails** per reel; pick the best.
- **AI scoring engine** — hook, emotion, speech, motion, face visibility, scene quality, replay
  prediction, and an overall score used to rank candidates.
- **AI titles & tags** per reel (local LLM via Ollama).
- **Admin review** — approve / reject / trim (re-render) / regenerate / select thumbnail /
  publish (export locally) / download.
- **Fault tolerant** — every AI step has a heuristic fallback, so the pipeline completes even if
  the ML service or LLM is down.

---

## How it works

```
Upload ─▶ Validate ─▶ Transcode & extract ─▶ Transcribe ─▶ Scene detection
   ─▶ Face detection ─▶ Highlight detection ─▶ Render (crop + captions + thumbs + score + title)
   ─▶ Ready ─▶ Admin review ─▶ Publish / Download
```

Each step is a resumable, retryable job on a Redis/BullMQ queue; the render stage fans out (one
job per candidate reel) with a race-free fan-in.

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
| Backend / worker | NestJS (REST + Swagger) + BullMQ |
| Queue | Redis + BullMQ (flows) |
| Database | PostgreSQL + Prisma |
| Storage | Local filesystem (swappable `StorageService`) |
| Media | FFmpeg / ffprobe (static binaries) |
| Speech-to-text | faster-whisper |
| Scenes / faces | PySceneDetect / MediaPipe |
| LLM | Ollama (default `qwen2.5:7b`), pluggable |
| Frontend | Next.js (App Router) + shadcn/ui + Tailwind |
| Monorepo | pnpm workspaces |

## Monorepo layout

```
al-reel-generator/
  apps/
    api/            NestJS API + BullMQ worker + Prisma schema/migrations
    web/            Next.js + shadcn/ui admin panel
  services/
    ai-service/     Python FastAPI (Whisper / PySceneDetect / MediaPipe)
  packages/
    shared/         Shared TypeScript DTOs (api + web)
  docs/             PRD + DEVELOPMENT.md
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

> **Prerequisites:** Node 22+, pnpm 10+, Python 3.10+, Docker. FFmpeg is bundled (no install).

## Using it

1. Upload a video in the web UI.
2. Watch the pipeline progress live.
3. Review candidate reels: video player, score breakdown, transcript, tags, 3 thumbnails.
4. Trim / regenerate / pick a thumbnail as needed.
5. Approve and **Publish** (exports to `data/published/`) or **Download** the reel.

## Key API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/videos` | Upload a video, start the pipeline |
| GET | `/videos/:id/status` | Pipeline progress (per-step) |
| GET | `/videos/:id/reels` | Candidate reels (scored, ordered) |
| POST | `/reels/:id/approve` \| `/reject` \| `/publish` | Review actions |
| POST | `/reels/:id/trim` \| `/regenerate` | Re-render a reel |
| POST | `/reels/:id/thumbnail` | Select a thumbnail |
| GET | `/reels/:id/download` | Download the rendered reel |

Interactive docs at `/docs` (Swagger).

## Configuration

All settings live in `.env` (see `.env.example`) — database/Redis URLs, `DATA_DIR`, upload limits,
allowed formats, candidate count, duration buckets, frame sample rate, `AI_SERVICE_URL`,
`OLLAMA_MODEL`, and Whisper model/device. Pick a smaller `OLLAMA_MODEL` (e.g. `qwen2.5:3b`) for
faster processing on CPU-only machines.

## Roadmap (Phase 2)

Reel analytics ingestion, AI learning engine (best categories/duration/timing/hooks), founder
insights dashboard, prediction engine, and (optional) social publishing. The schema and service
interfaces are designed to accommodate these.

---

_Personal project — for local use only._
