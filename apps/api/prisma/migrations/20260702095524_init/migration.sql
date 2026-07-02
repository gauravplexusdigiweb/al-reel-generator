-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('uploaded', 'validating', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "PipelineStep" AS ENUM ('validate', 'transcode', 'transcribe', 'scenes', 'faces', 'highlights', 'render');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('pending', 'active', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ReelStatus" AS ENUM ('candidate', 'approved', 'rejected', 'published');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('approve', 'reject', 'trim', 'regenerate', 'publish');

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'uploaded',
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "codec" TEXT,
    "sizeBytes" BIGINT,
    "language" TEXT,
    "category" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_processing_jobs" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "step" "PipelineStep" NOT NULL,
    "state" "JobState" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_renditions" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "video_renditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_transcripts" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "language" TEXT,
    "segments" JSONB NOT NULL,

    CONSTRAINT "video_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_scenes" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "motion" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "video_scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_faces" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "samples" JSONB NOT NULL,

    CONSTRAINT "video_faces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_audio" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sampleRate" INTEGER NOT NULL,
    "energy" JSONB NOT NULL,

    CONSTRAINT "video_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "durationBucket" INTEGER NOT NULL,
    "status" "ReelStatus" NOT NULL DEFAULT 'candidate',
    "filePath" TEXT,
    "suggestedTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_scores" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "hook" DOUBLE PRECISION NOT NULL,
    "emotion" DOUBLE PRECISION NOT NULL,
    "speech" DOUBLE PRECISION NOT NULL,
    "motion" DOUBLE PRECISION NOT NULL,
    "faceVisibility" DOUBLE PRECISION NOT NULL,
    "sceneQuality" DOUBLE PRECISION NOT NULL,
    "replayPrediction" DOUBLE PRECISION NOT NULL,
    "overall" DOUBLE PRECISION NOT NULL,
    "rationale" JSONB,

    CONSTRAINT "reel_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_transcripts" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "segments" JSONB NOT NULL,

    CONSTRAINT "reel_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_tags" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "reel_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reel_thumbnails" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "reel_thumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_reviews" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_processing_jobs_videoId_step_key" ON "video_processing_jobs"("videoId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "video_renditions_videoId_label_key" ON "video_renditions"("videoId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "video_transcripts_videoId_key" ON "video_transcripts"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_faces_videoId_key" ON "video_faces"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_audio_videoId_key" ON "video_audio"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "reel_scores_reelId_key" ON "reel_scores"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "reel_transcripts_reelId_key" ON "reel_transcripts"("reelId");

-- CreateIndex
CREATE UNIQUE INDEX "reel_tags_reelId_tag_key" ON "reel_tags"("reelId", "tag");

-- AddForeignKey
ALTER TABLE "video_processing_jobs" ADD CONSTRAINT "video_processing_jobs_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_renditions" ADD CONSTRAINT "video_renditions_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_transcripts" ADD CONSTRAINT "video_transcripts_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scenes" ADD CONSTRAINT "video_scenes_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_faces" ADD CONSTRAINT "video_faces_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_audio" ADD CONSTRAINT "video_audio_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reels" ADD CONSTRAINT "reels_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_scores" ADD CONSTRAINT "reel_scores_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_transcripts" ADD CONSTRAINT "reel_transcripts_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_tags" ADD CONSTRAINT "reel_tags_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reel_thumbnails" ADD CONSTRAINT "reel_thumbnails_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_reviews" ADD CONSTRAINT "admin_reviews_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
