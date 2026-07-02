# 🎬 AI Reel Generator

Turn one long video into **10–20 ready-to-post vertical reels — automatically.**

You upload a long-form video (a talk, podcast, interview, stream, lecture…). The app watches it
the way an editor would: it listens to the words, spots scene changes, follows faces, finds the
most interesting moments, and renders short **9:16 clips** — each one auto-cropped to the speaker,
with **word-by-word captions**, a thumbnail, an AI-written title, tags, and a quality score. You
review them, tweak anything you want, and export.

It runs **entirely on your own machine** — no cloud, no accounts, nothing uploaded to third
parties. The AI is local too (Whisper for speech, MediaPipe for faces, a local Ollama LLM for
titles/scoring).

> **Status:** Phase 1 core pipeline **+** Phase 1.5 enhancements — **complete and working.**
> Analytics, an AI learning engine, a founder dashboard, and a prediction engine are the planned
> Phase 2 roadmap.

---

## Table of contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [Architecture](#architecture)
4. [Tech stack](#tech-stack)
5. [Project structure](#project-structure)
6. [Prerequisites](#prerequisites)
7. [Installation & setup](#installation--setup)
8. [Configuration reference](#configuration-reference)
9. [Using the app](#using-the-app)
10. [API reference](#api-reference)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)
13. [How it stays reliable (fault tolerance)](#how-it-stays-reliable-fault-tolerance)
14. [Roadmap (Phase 2)](#roadmap-phase-2)

---

## What it does

- **Upload** long videos — MP4 / MOV / MKV / AVI, with a configurable size limit.
- **Transcode** to 1080p / 720p / 480p and extract audio + sampled frames (FFmpeg).
- **Transcribe** speech to a **word-level** timestamped transcript with Whisper (English, Hindi, more).
- **Detect scenes** (PySceneDetect) and **faces** (MediaPipe).
- **Find highlights** — combines the transcript, scene cuts, audio energy, and an LLM ranking to
  pick the best 10–20 windows (15 / 30 / 45 / 60s), snapped to sentence boundaries so clips don't
  start or end mid-sentence.
- **Auto-crop to 9:16** centered on the person talking, with smoothed "camera movement." Scenes
  with no face get a polished **blurred-fill** background instead of a hard crop.
- **Burn word-level "karaoke" captions** (with plain-caption fallback), plus style presets and a
  safe-zone option so text clears the TikTok/Instagram UI.
- **Normalize loudness** so every reel has consistent volume.
- **Score every reel** on 8 factors — hook, emotion, speech, motion, face visibility, scene
  quality, replay prediction, and an overall score used to rank candidates.
- **Write a title + tags** for each reel with a local LLM (Ollama).
- **Generate 3 thumbnails** per reel; you pick the best.
- **Review dashboard** — play, see the score breakdown & transcript, then **edit the AI
  title/tags/captions**, **trim**, **regenerate**, switch **aspect ratio** (9:16 / 1:1 / 4:5),
  make your own **manual clip**, approve/reject, **publish** (export locally), **download**, or
  **delete** — with **filter & sort** on the grid.
- **Batch export** all approved reels as a single zip.
- **Live settings** — change candidate count, durations, captions, etc. from a `/settings` page,
  no restart required.
- **Retry** a failed video from the exact step it failed on.
- **Fault tolerant** — if the ML service or the LLM is down, the pipeline still finishes using
  built-in heuristic fallbacks (see [below](#how-it-stays-reliable-fault-tolerance)).

---

## How it works

The pipeline is a chain of small, retryable jobs on a Redis/BullMQ queue:

```
Upload ─▶ Validate ─▶ Transcode & extract ─▶ Transcribe (word-level) ─▶ Scene detection
   ─▶ Face detection ─▶ Highlight detection (sentence-aligned) ─▶ Render ─▶ Ready ─▶ Review ─▶ Export
```

For each candidate reel, the **Render** step does:

```
active-speaker 9:16 crop (or blurred-fill)  →  karaoke captions  →  loudness-normalized audio
   →  3 thumbnails  →  8-factor score  →  AI title & tags
```

- Independent steps run as separate jobs, so any one can retry on its own, and the whole video can
  be **retried from the earliest incomplete step**.
- The render stage **fans out** (one job per reel) and **fans in** race-free before marking the
  video ready.
- Intermediate files (sampled frames, the working WAV) are **auto-purged** once they're no longer
  needed, to save disk.

---

## Architecture

Three runtime services plus backing infrastructure — all local:

```
                 ┌─────────────┐        ┌──────────────────┐
 Browser ─────▶  │  web (Next) │ ─HTTP▶ │  api (NestJS)    │ ──▶ PostgreSQL (Prisma)
 shadcn admin    └─────────────┘        │  REST + Swagger  │ ──▶ local filesystem (data/)
                                        └───────┬──────────┘
                                                │ enqueue (BullMQ / Redis)
                                        ┌───────▼──────────┐
                                        │ worker (NestJS)  │  runs the pipeline
                                        └───┬───────┬──────┘
                        FFmpeg / ffprobe ◀──┘       └──▶ HTTP
                        (transcode, crop,           ┌──────────────────────┐
                         captions, thumbs)          │ ai-service (FastAPI) │
                        Ollama HTTP ◀────────────────│  Whisper / PySceneDetect
                        (scoring, titles)            │  MediaPipe (faces)   │
                                                     └──────────────────────┘
```

- **`api`** (HTTP) and **`worker`** (queue consumer) share one NestJS codebase with two
  entrypoints, so a crashing worker never takes down the API.
- **`ai-service`** is a small Python FastAPI app that keeps the heavy ML models **warm in memory**.
  It shares the local `data/` folder with the worker and receives **file paths**, so large media
  is never uploaded over HTTP.
- **FFmpeg** uses bundled `ffmpeg-static` / `ffprobe-static` binaries — **no system FFmpeg install
  needed**.
- **Ollama** runs the local LLM; it's wrapped behind an `LlmProvider` interface so the model is
  swappable via config.

---

## Tech stack

| Concern | Choice |
|---|---|
| Backend / worker | NestJS (REST + Swagger) + BullMQ (flows) |
| Queue | Redis |
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

---

## Project structure

```
al-reel-generator/
├─ apps/
│  ├─ api/                       NestJS API + BullMQ worker
│  │  ├─ prisma/                 schema + migrations
│  │  └─ src/
│  │     ├─ videos/ reels/       upload, status, review & edit endpoints
│  │     ├─ health/ settings/    health checks + live settings
│  │     ├─ pipeline/steps/      validate → … → render (one file per step)
│  │     ├─ pipeline/util/       crop, captions, scoring, highlights, aspect
│  │     ├─ media/ llm/ ai/      FFmpeg, Ollama, ai-service client
│  │     └─ main.ts / worker.ts  the two entrypoints
│  └─ web/                       Next.js + shadcn admin (upload, review, /settings)
├─ services/
│  └─ ai-service/                Python FastAPI (Whisper / PySceneDetect / MediaPipe) + Dockerfile
├─ packages/
│  └─ shared/                    shared TypeScript types/DTOs (used by api + web)
├─ docs/                         PRD + DEVELOPMENT.md
├─ Dockerfile.node               image for api / worker / web
├─ docker-compose.yml            postgres, redis, ollama (+ app services under "full" profile)
└─ .env.example
```

---

## Prerequisites

Install these first:

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 22+ | JavaScript runtime |
| **pnpm** | 10+ | `corepack enable` (ships with Node) |
| **Python** | 3.10+ | for the ai-service (Whisper/MediaPipe) |
| **Docker** + Compose | recent | runs Postgres, Redis, Ollama |

You do **not** need to install FFmpeg or Ollama on the system — FFmpeg is bundled, and Ollama runs
in Docker.

> **Hardware:** works on CPU-only machines. ~16 GB RAM is comfortable. A GPU is optional and only
> speeds up Whisper / Ollama (see the GPU notes in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

---

## Installation & setup

There are two ways to run it. **Option A (hybrid)** is best for development; **Option B (Docker)**
is one command.

### Option A — Hybrid (infra in Docker, apps on your machine)

**1. Get the code and create your env file**

```bash
git clone <your-repo-url> al-reel-generator
cd al-reel-generator
cp .env.example .env
```

**2. Start the backing services** (Postgres, Redis, Ollama)

```bash
pnpm infra:up
```

> If port **5432** is already used by another Postgres on your machine, set `POSTGRES_PORT=5433`
> (and match the port in `DATABASE_URL`) in `.env` before running this.

**3. Pull a local LLM once** (into the Ollama container)

```bash
docker compose exec ollama ollama pull qwen2.5:7b
```

> `qwen2.5:7b` is the recommended default (great quality/speed balance on CPU). For faster
> processing on a slower machine, use `qwen2.5:3b` and set `OLLAMA_MODEL=qwen2.5:3b` in `.env`.

**4. Install dependencies, build shared types, set up the database**

```bash
pnpm install
pnpm --filter @arg/shared build          # shared types (used by api + web)
pnpm --filter @arg/api prisma:generate
pnpm --filter @arg/api prisma:migrate     # creates the tables
```

**5. Start the Python ML service** (in its own terminal)

```bash
cd services/ai-service
python3 -m venv .venv
source .venv/bin/activate                 # Windows: .venv\Scripts\activate
pip install -r requirements.txt           # first run downloads Whisper/MediaPipe deps
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> If port **8000** is taken (e.g. by a Laravel/PHP app), run it on `--port 8001` and set
> `AI_SERVICE_URL=http://localhost:8001` in `.env`.
>
> Check it: `curl localhost:8000/health` → `{"status":"ok"}`.

**6. Start the app** (API + worker + web, in a new terminal from the repo root)

```bash
pnpm dev
```

That's it. Open **http://localhost:3000**.

### Option B — Everything in Docker

```bash
cp .env.example .env
docker compose --profile full up --build
docker compose exec ollama ollama pull qwen2.5:7b   # one-time
```

This builds and runs `api`, `worker`, `web`, and `ai-service` alongside Postgres, Redis, and
Ollama. The API applies database migrations on startup; media persists in a Docker volume.

### Where things live

| Service | URL |
|---|---|
| Web UI | http://localhost:3000 |
| API + Swagger docs | http://localhost:4000/docs |
| Served media (reels, thumbnails) | http://localhost:4000/files/… |
| ai-service | http://localhost:8000 (or 8001) |
| Ollama | http://localhost:11434 |

### Verify it's working

Open the web app, confirm the header shows **"AI ready"** (green), and upload a short video with
speech. You should see the pipeline advance through each step and produce captioned 9:16 reels.
If the header shows **"Fallback mode,"** the ai-service or Ollama isn't reachable — see
[Troubleshooting](#troubleshooting).

---

## Configuration reference

Defaults live in `.env` (copy from `.env.example`). Most pipeline knobs can also be changed live
from the **/settings** page (stored in the `app_settings` table, layered over these defaults).

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | `postgresql://arg:arg@localhost:5432/arg` | Postgres connection string |
| `POSTGRES_PORT` | `5432` | Host port for the docker Postgres (use `5433` if 5432 is taken) |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis for the job queue |
| `API_PORT` | `4000` | API server port |
| `DATA_DIR` | `./data` | Where uploads, renditions, reels & thumbnails are stored |
| `MAX_UPLOAD_MB` | `2048` | Max upload size |
| `ALLOWED_FORMATS` | `mp4,mov,mkv,avi` | Accepted upload formats |
| `CANDIDATE_MIN` / `CANDIDATE_MAX` | `10` / `20` | How many candidate reels to generate |
| `DURATION_BUCKETS` | `15,30,45,60` | Reel lengths (seconds) to try |
| `SAMPLE_FPS` | `2` | Frame sampling rate for face/scene/thumbnail analysis |
| `RETAIN_INTERMEDIATES` | `false` | Keep frames/audio after processing (uses more disk) |
| `AI_SERVICE_URL` | `http://localhost:8000` | The Python ML service |
| `WHISPER_MODEL` | `base` | Whisper size: `tiny`/`base`/`small`/`medium`/`large-v3` |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` |
| `WHISPER_COMPUTE_TYPE` | `int8` | e.g. `int8` (CPU) or `float16` (GPU) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server |
| `OLLAMA_MODEL` | `qwen2.5:7b` | LLM for titles/tags/scoring |
| `CAPTION_PRESET` | `default` | `default` or `raised` (clears platform UI) |
| `CAPTION_KARAOKE` | `true` | Word-level highlight captions |
| `FFMPEG_PATH` / `FFPROBE_PATH` | (empty) | Override the bundled FFmpeg binaries |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | API base the web app calls |

---

## Using the app

1. **Upload** a video on the home page (drag & drop or pick a file). Processing starts immediately
   and you're taken to the video page.
2. **Watch the pipeline** advance step by step. If a step fails, hit **Retry** to resume from it.
3. When it's **ready**, browse the **candidate reels** — each card shows a thumbnail, the overall
   score, the duration, and the AI title. Use the **filter** (status) and **sort** (score / newest
   / duration) controls at the top.
4. **Open a reel** to review it:
   - Play the rendered 9:16 clip; see the **score breakdown**, transcript, and tags.
   - **Edit** the title and tags (and captions via the API); **Save**.
   - **Trim** with the in/out slider (re-renders), **Regenerate**, or change the **aspect ratio**
     (9:16 / 1:1 / 4:5).
   - **Pick a thumbnail** from the three generated.
   - **Approve** / **Reject**, then **Publish** (copies the file to `data/published/`) or
     **Download**. **Delete** removes the reel and its files.
5. **Make a manual clip** with **New clip** — choose any start/end window and aspect ratio.
6. **Export approved** downloads all approved reels for the video as one zip.
7. **Settings** (top-right) — adjust candidate count, duration buckets, sample rate, caption
   preset/karaoke, and retain-intermediates; changes apply to the next video processed.

Published/exported files land in `DATA_DIR` (default `./data`):

```
data/
  videos/<videoId>/reels/<reelId>.mp4      rendered reels (+ .ass captions)
  videos/<videoId>/thumbnails/…            3 per reel
  published/<reelId>.mp4                    published exports
```

---

## API reference

Full interactive docs (Swagger) at **http://localhost:4000/docs**.

| Method | Path | Purpose |
|---|---|---|
| POST | `/videos` | Upload a video, start the pipeline |
| GET | `/videos` · `/videos/:id` | List / get videos |
| GET | `/videos/:id/status` | Pipeline progress (per-step) |
| GET | `/videos/:id/reels` | Candidate reels (scored, ordered) |
| POST | `/videos/:id/reels` | Create a **manual clip** (custom window + aspect) |
| GET | `/videos/:id/reels/export.zip` | **Batch zip** of rendered reels (default: approved + published) |
| POST | `/videos/:id/retry` | **Retry** from the earliest incomplete step |
| DELETE | `/videos/:id` | Delete a video + its reels + files |
| PATCH | `/reels/:id` | **Edit** title / tags / captions |
| POST | `/reels/:id/approve` · `/reject` · `/publish` | Review actions |
| POST | `/reels/:id/trim` · `/regenerate` | Re-render (regenerate accepts a new aspect ratio) |
| POST | `/reels/:id/thumbnail` | Select a thumbnail |
| GET | `/reels/:id/download` | Download the rendered reel |
| DELETE | `/reels/:id` | Delete a reel + its files |
| GET · PUT | `/settings` | Read / update live pipeline settings |
| GET | `/health` · `/health/services` | Liveness / dependency reachability |

---

## Testing

```bash
pnpm --filter @arg/api test
```

Unit tests cover the pure pipeline logic (crop-path, captions, scoring, highlight selection) plus
an FFmpeg smoke test that renders a real 1080×1920 frame.

---

## Troubleshooting

| Symptom | Cause & fix |
|---|---|
| **`pnpm infra:up` fails: port 5432 already allocated** | Another Postgres owns 5432. Set `POSTGRES_PORT=5433` and change `DATABASE_URL` to `…@localhost:5433/…` in `.env`. |
| **ai-service won't start: "address already in use" (8000)** | Another app (e.g. Laravel) uses 8000. Run `uvicorn … --port 8001` and set `AI_SERVICE_URL=http://localhost:8001` in `.env`. |
| **Header shows "Fallback mode"** | The ai-service or Ollama isn't reachable. Start the ai-service, and `docker compose exec ollama ollama pull qwen2.5:7b`. Reels still generate, but without real transcripts/captions/AI titles. |
| **Reels have no captions / generic titles** | Same as above — the pipeline used fallbacks. Fix connectivity and re-upload. |
| **Word-level captions not appearing** | Restart the `uvicorn` ai-service so it picks up word timestamps, then re-upload. |
| **LLM feels slow on CPU** | Switch to a smaller model: `OLLAMA_MODEL=qwen2.5:3b` (≈2–3× faster). |
| **Web can't reach the API** | Ensure `NEXT_PUBLIC_API_BASE_URL` matches your API URL (default `http://localhost:4000`) and restart the web app (it inlines this at build time). |

---

## How it stays reliable (fault tolerance)

Every AI step has a deterministic **fallback**, so the pipeline always completes:

- **ai-service down** → empty transcript (no captions), no scene/face data → the crop falls back to
  blurred-fill / center, and scoring uses heuristics only.
- **Ollama down** → titles, tags, and hook/emotion scores come from built-in heuristics.
- Each job is **retryable with backoff**, and a failed video can be re-run from its last incomplete
  step. Deleting a video mid-processing is safe.

The header **health chip** tells you at a glance whether you're getting the full-quality path or a
fallback.

---

## Roadmap (Phase 2)

Deferred by design (they need real engagement data to be meaningful), with the schema and service
interfaces already shaped to accommodate them:

- **Reel analytics** ingestion (views, watch time, completion, replays, …).
- **AI learning engine** — best categories, durations, timings, hooks, thumbnails.
- **Founder insights dashboard** — daily plain-language insights.
- **Prediction engine** — next trending categories, expected CTR, confidence.
- Optional **social publishing** integrations.

---

_Personal project — built to run locally. Not intended for public/multi-tenant deployment as-is._
