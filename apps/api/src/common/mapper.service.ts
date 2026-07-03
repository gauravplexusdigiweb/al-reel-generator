import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CategoryDto,
  DurationBucket,
  ReelDto,
  SocialAccountDto,
  SocialPostDto,
  StepStatusDto,
  TranscriptSegment,
  VideoDto,
  VideoStatusDto,
} from '@arg/shared';
import { PIPELINE_STEPS } from '@arg/shared';
import { StorageService } from '../storage/storage.service';

const reelInclude = {
  score: true,
  transcript: true,
  tags: true,
  thumbnails: true,
  socialPosts: true,
} satisfies Prisma.ReelInclude;

export type ReelWithRelations = Prisma.ReelGetPayload<{ include: typeof reelInclude }>;
export type VideoWithJobs = Prisma.VideoGetPayload<{ include: { jobs: true } }>;

/** Maps Prisma entities to the wire DTOs shared with the web app. */
@Injectable()
export class MapperService {
  static readonly reelInclude = reelInclude;

  constructor(private readonly storage: StorageService) {}

  toVideoDto(v: Prisma.VideoGetPayload<Record<string, never>>): VideoDto {
    return {
      id: v.id,
      originalFilename: v.originalFilename,
      status: v.status,
      durationSec: v.durationSec,
      width: v.width,
      height: v.height,
      codec: v.codec,
      sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes),
      language: v.language,
      categoryId: v.categoryId,
      createdAt: v.createdAt.toISOString(),
    };
  }

  toReelDto(r: ReelWithRelations): ReelDto {
    return {
      id: r.id,
      videoId: r.videoId,
      startSec: r.startSec,
      endSec: r.endSec,
      durationBucket: r.durationBucket as DurationBucket,
      status: r.status,
      suggestedTitle: r.suggestedTitle,
      tags: r.tags.map((t) => t.tag),
      fileUrl: r.filePath ? this.storage.publicUrl(r.filePath) : null,
      previewUrl: r.previewPath ? this.storage.publicUrl(r.previewPath) : null,
      needsRerender: r.needsRerender,
      aspectRatio: r.aspectRatio,
      categoryId: r.categoryId,
      score: r.score
        ? {
            hook: r.score.hook,
            emotion: r.score.emotion,
            speech: r.score.speech,
            motion: r.score.motion,
            faceVisibility: r.score.faceVisibility,
            sceneQuality: r.score.sceneQuality,
            replayPrediction: r.score.replayPrediction,
            overall: r.score.overall,
            rationale: (r.score.rationale as Record<string, unknown>) ?? undefined,
          }
        : null,
      thumbnails: r.thumbnails.map((t) => ({
        id: t.id,
        url: this.storage.publicUrl(t.path),
        selected: t.selected,
      })),
      transcript: (r.transcript?.segments as unknown as TranscriptSegment[]) ?? [],
      posts: (r.socialPosts ?? []).map((p) => this.toSocialPostDto(p)),
      createdAt: r.createdAt.toISOString(),
    };
  }

  toSocialAccountDto(a: Prisma.SocialAccountGetPayload<Record<string, never>>): SocialAccountDto {
    return {
      id: a.id,
      platform: a.platform,
      displayName: a.displayName,
      connectedAt: a.connectedAt.toISOString(),
      tokenExpiresAt: a.tokenExpiresAt?.toISOString() ?? null,
      platformMeta: (a.platformMeta as Record<string, unknown>) ?? null,
    };
  }

  toSocialPostDto(p: Prisma.SocialPostGetPayload<Record<string, never>>): SocialPostDto {
    return {
      id: p.id,
      reelId: p.reelId,
      accountId: p.accountId,
      platform: p.platform,
      status: p.status,
      platformPostId: p.platformPostId,
      permalink: p.permalink,
      caption: p.caption,
      hashtags: p.hashtags,
      error: p.error,
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    };
  }

  toStatusDto(video: VideoWithJobs): VideoStatusDto {
    const byStep = new Map(video.jobs.map((j) => [j.step, j]));
    const steps: StepStatusDto[] = PIPELINE_STEPS.map((step) => {
      const j = byStep.get(step);
      return {
        step,
        state: j?.state ?? 'pending',
        progress: j?.progress ?? 0,
        error: j?.error ?? null,
      };
    });
    const overallProgress = Math.round(steps.reduce((s, x) => s + x.progress, 0) / steps.length);
    return { video: this.toVideoDto(video), steps, overallProgress };
  }
}
