import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

const KEY = 'pipeline';

export interface EffectiveSettings {
  candidateMin: number;
  candidateMax: number;
  durationBuckets: number[];
  sampleFps: number;
  retainIntermediates: boolean;
  captionPreset: string;
  karaoke: boolean;
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Effective pipeline settings = DB overrides (app_settings) layered over the
 * .env defaults. Lets the admin tune the pipeline from the UI without a restart.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async effective(): Promise<EffectiveSettings> {
    const p = this.config.get('pipeline', { infer: true });
    const c = this.config.get('caption', { infer: true });
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    const o = (row?.value as Record<string, unknown>) ?? {};
    return {
      candidateMin: num(o.candidateMin, p.candidateMin),
      candidateMax: num(o.candidateMax, p.candidateMax),
      durationBuckets:
        Array.isArray(o.durationBuckets) && o.durationBuckets.length
          ? (o.durationBuckets as number[]).map(Number)
          : p.durationBuckets,
      sampleFps: num(o.sampleFps, p.sampleFps),
      retainIntermediates:
        typeof o.retainIntermediates === 'boolean' ? o.retainIntermediates : p.retainIntermediates,
      captionPreset: typeof o.captionPreset === 'string' ? o.captionPreset : c.preset,
      karaoke: typeof o.karaoke === 'boolean' ? o.karaoke : c.karaoke,
    };
  }

  async update(patch: Partial<EffectiveSettings>): Promise<EffectiveSettings> {
    const current = await this.effective();
    const merged: EffectiveSettings = { ...current };
    if (patch.candidateMin !== undefined) merged.candidateMin = patch.candidateMin;
    if (patch.candidateMax !== undefined) merged.candidateMax = patch.candidateMax;
    if (patch.durationBuckets !== undefined) merged.durationBuckets = patch.durationBuckets;
    if (patch.sampleFps !== undefined) merged.sampleFps = patch.sampleFps;
    if (patch.retainIntermediates !== undefined) merged.retainIntermediates = patch.retainIntermediates;
    if (patch.captionPreset !== undefined) merged.captionPreset = patch.captionPreset;
    if (patch.karaoke !== undefined) merged.karaoke = patch.karaoke;

    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: merged as unknown as Prisma.InputJsonValue },
      update: { value: merged as unknown as Prisma.InputJsonValue },
    });
    return merged;
  }
}
