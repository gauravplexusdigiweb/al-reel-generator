import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { InsightsDto, ManualAnalyticsRequest, ReelAnalyticsDto, SocialPlatform } from '@arg/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MapperService } from '../common/mapper.service';
import { PublisherRegistry } from '../publishing/providers/publisher.registry';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: MapperService,
    private readonly registry: PublisherRegistry,
  ) {}

  async getReelAnalytics(reelId: string): Promise<ReelAnalyticsDto[]> {
    const rows = await this.prisma.reelAnalytics.findMany({
      where: { reelId },
      orderBy: { fetchedAt: 'desc' },
    });
    return rows.map((r) => this.mapper.toReelAnalyticsDto(r));
  }

  /** Manually record metrics for a platform (for cases with no API access). */
  async recordManual(reelId: string, dto: ManualAnalyticsRequest): Promise<ReelAnalyticsDto> {
    if (!(await this.prisma.reel.count({ where: { id: reelId } }))) {
      throw new NotFoundException('Reel not found');
    }
    return this.upsert(reelId, dto.platform, {
      views: dto.views ?? 0,
      likes: dto.likes ?? 0,
      comments: dto.comments ?? 0,
      shares: dto.shares ?? 0,
      watchTime: dto.watchTime ?? null,
      completionRate: dto.completionRate ?? null,
    });
  }

  /** Refresh analytics for every published post via its platform provider. */
  async refreshAll(): Promise<number> {
    const posts = await this.prisma.socialPost.findMany({
      where: { status: 'published', platformPostId: { not: null } },
      include: { account: true },
    });
    let updated = 0;
    for (const post of posts) {
      const provider = this.registry.get(post.platform);
      if (!provider.fetchMetrics) continue;
      try {
        const m = await provider.fetchMetrics(post.account, post);
        await this.upsert(post.reelId, post.platform, {
          views: m.views,
          likes: m.likes,
          comments: m.comments,
          shares: m.shares,
          watchTime: m.watchTime ?? null,
          completionRate: m.completionRate ?? null,
        });
        updated++;
      } catch (e) {
        this.logger.warn(`Analytics fetch failed for post ${post.id}: ${e}`);
      }
    }
    this.logger.log(`Analytics refreshed for ${updated}/${posts.length} posts`);
    return updated;
  }

  async refreshReel(reelId: string): Promise<number> {
    const posts = await this.prisma.socialPost.findMany({
      where: { reelId, status: 'published', platformPostId: { not: null } },
      include: { account: true },
    });
    let n = 0;
    for (const post of posts) {
      const provider = this.registry.get(post.platform);
      if (!provider.fetchMetrics) continue;
      try {
        const m = await provider.fetchMetrics(post.account, post);
        await this.upsert(post.reelId, post.platform, { ...m, watchTime: m.watchTime ?? null, completionRate: m.completionRate ?? null });
        n++;
      } catch (e) {
        this.logger.warn(`Analytics fetch failed for post ${post.id}: ${e}`);
      }
    }
    return n;
  }

  /** Aggregate "founder dashboard" insights from stored analytics. */
  async getInsights(): Promise<InsightsDto> {
    const reels = await this.prisma.reel.findMany({
      include: { analytics: true, tags: true, category: true, score: true },
    });
    const categories = await this.prisma.category.findMany();
    const catName = new Map(categories.map((c) => [c.id, c.name]));

    // Per-reel rolled-up views/engagement.
    type Roll = {
      reelId: string;
      title: string | null;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      completion: number | null;
      durationBucket: number;
      categoryId: string | null;
      tags: string[];
      hour: number;
      published: boolean;
    };
    const rolls: Roll[] = reels.map((r) => {
      const views = r.analytics.reduce((s, a) => s + a.views, 0);
      const likes = r.analytics.reduce((s, a) => s + a.likes, 0);
      const comments = r.analytics.reduce((s, a) => s + a.comments, 0);
      const shares = r.analytics.reduce((s, a) => s + a.shares, 0);
      const comps = r.analytics.map((a) => a.completionRate).filter((x): x is number => x != null);
      return {
        reelId: r.id,
        title: r.suggestedTitle,
        views,
        likes,
        comments,
        shares,
        completion: comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : null,
        durationBucket: r.durationBucket,
        categoryId: r.categoryId,
        tags: r.tags.map((t) => t.tag),
        hour: new Date(r.createdAt).getHours(),
        published: r.status === 'published',
      };
    });

    const withData = rolls.filter((r) => r.views > 0 || r.likes > 0);
    const totals = withData.reduce(
      (s, r) => ({ views: s.views + r.views, likes: s.likes + r.likes, comments: s.comments + r.comments, shares: s.shares + r.shares }),
      { views: 0, likes: 0, comments: 0, shares: 0 },
    );
    const comps = withData.map((r) => r.completion).filter((x): x is number => x != null);
    const avgCompletionRate = comps.length ? comps.reduce((a, b) => a + b, 0) / comps.length : null;

    // Group helpers.
    const groupAvg = <K extends string | number>(key: (r: Roll) => K) => {
      const m = new Map<K, { views: number; reels: number }>();
      for (const r of withData) {
        const g = m.get(key(r)) ?? { views: 0, reels: 0 };
        g.views += r.views;
        g.reels += 1;
        m.set(key(r), g);
      }
      return m;
    };

    const catGroup = groupAvg((r) => r.categoryId ?? '__none');
    const bestCategories = [...catGroup.entries()]
      .map(([id, g]) => ({
        categoryId: id === '__none' ? null : (id as string),
        name: id === '__none' ? 'Uncategorized' : catName.get(id as string) ?? 'Unknown',
        views: g.views,
        reels: g.reels,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 5);

    const durGroup = groupAvg((r) => r.durationBucket);
    const bestDurationBuckets = [...durGroup.entries()]
      .map(([durationBucket, g]) => ({ durationBucket: Number(durationBucket), avgViews: Math.round(g.views / g.reels), reels: g.reels }))
      .sort((a, b) => b.avgViews - a.avgViews);

    const tagStats = new Map<string, { views: number; reels: number }>();
    for (const r of withData) {
      for (const t of r.tags) {
        const g = tagStats.get(t) ?? { views: 0, reels: 0 };
        g.views += r.views;
        g.reels += 1;
        tagStats.set(t, g);
      }
    }
    const bestHooks = [...tagStats.entries()]
      .map(([tag, g]) => ({ tag, avgViews: Math.round(g.views / g.reels), reels: g.reels }))
      .filter((h) => h.reels >= 1)
      .sort((a, b) => b.avgViews - a.avgViews)
      .slice(0, 8);

    const hourGroup = groupAvg((r) => r.hour);
    const bestUploadHours = [...hourGroup.entries()]
      .map(([hour, g]) => ({ hour: Number(hour), avgViews: Math.round(g.views / g.reels), reels: g.reels }))
      .sort((a, b) => b.avgViews - a.avgViews)
      .slice(0, 5);

    const topReels = [...withData]
      .sort((a, b) => b.views - a.views)
      .slice(0, 10)
      .map((r) => ({
        reelId: r.reelId,
        title: r.title,
        views: r.views,
        likes: r.likes,
        engagementRate: r.views ? Math.round(((r.likes + r.comments + r.shares) / r.views) * 1000) / 10 : 0,
      }));

    const recommendations: string[] = [];
    if (bestCategories[0]) recommendations.push(`"${bestCategories[0].name}" reels get the most views — make more.`);
    if (bestDurationBuckets[0]) recommendations.push(`${bestDurationBuckets[0].durationBucket}s reels perform best (avg ${bestDurationBuckets[0].avgViews} views).`);
    if (bestUploadHours[0]) recommendations.push(`Reels created around ${bestUploadHours[0].hour}:00 perform best.`);
    if (bestHooks[0]) recommendations.push(`Top-performing topic: "${bestHooks[0].tag}".`);
    if (withData.length === 0) recommendations.push('No analytics yet — publish reels and refresh, or add metrics manually.');

    return {
      totalReels: reels.length,
      publishedReels: rolls.filter((r) => r.published).length,
      totals,
      avgCompletionRate,
      bestCategories,
      bestDurationBuckets,
      bestHooks,
      bestUploadHours,
      topReels,
      recommendations,
    };
  }

  private async upsert(
    reelId: string,
    platform: SocialPlatform,
    data: { views: number; likes: number; comments: number; shares: number; watchTime: number | null; completionRate: number | null },
  ): Promise<ReelAnalyticsDto> {
    const existing = await this.prisma.reelAnalytics.findFirst({ where: { reelId, platform } });
    const row = existing
      ? await this.prisma.reelAnalytics.update({ where: { id: existing.id }, data: { ...data, fetchedAt: new Date() } })
      : await this.prisma.reelAnalytics.create({ data: { reelId, platform, ...data } });
    return this.mapper.toReelAnalyticsDto(row);
  }
}
