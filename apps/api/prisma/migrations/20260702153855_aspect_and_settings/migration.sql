-- AlterTable
ALTER TABLE "reels" ADD COLUMN     "aspectRatio" TEXT NOT NULL DEFAULT '9:16';

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
