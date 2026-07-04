-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PipelineStep" ADD VALUE 'nsfw';
ALTER TYPE "PipelineStep" ADD VALUE 'identities';

-- AlterTable
ALTER TABLE "reels" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'reel',
ADD COLUMN     "segments" JSONB;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "adultThreshold" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "captionsEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "musicPath" TEXT,
ADD COLUMN     "musicSource" TEXT NOT NULL DEFAULT 'original',
ADD COLUMN     "outputType" TEXT NOT NULL DEFAULT 'reel',
ADD COLUMN     "teaserCount" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "video_nsfw" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "samples" JSONB NOT NULL,

    CONSTRAINT "video_nsfw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_identities" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "people" JSONB NOT NULL,

    CONSTRAINT "video_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_nsfw_videoId_key" ON "video_nsfw"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "video_identities_videoId_key" ON "video_identities"("videoId");

-- AddForeignKey
ALTER TABLE "video_nsfw" ADD CONSTRAINT "video_nsfw_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_identities" ADD CONSTRAINT "video_identities_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
