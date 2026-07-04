'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, TrendingUp, Eye, Heart, MessageCircle, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { InsightsDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function InsightsPage() {
  const [data, setData] = useState<InsightsDto | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getInsights());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load insights');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    try {
      await api.refreshAnalytics();
      toast.success('Analytics refresh queued — reload in a moment');
      setTimeout(load, 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
          <RefreshCw className="mr-1 h-3 w-3" /> Refresh analytics
        </Button>
      </div>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <TrendingUp className="h-5 w-5" /> Insights
        </h1>
        <p className="text-sm text-muted-foreground">
          {data.publishedReels} of {data.totalReels} reels published · aggregated from platform analytics.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={<Eye className="h-4 w-4" />} label="Views" value={fmt(data.totals.views)} />
        <Stat icon={<Heart className="h-4 w-4" />} label="Likes" value={fmt(data.totals.likes)} />
        <Stat icon={<MessageCircle className="h-4 w-4" />} label="Comments" value={fmt(data.totals.comments)} />
        <Stat icon={<Share2 className="h-4 w-4" />} label="Shares" value={fmt(data.totals.shares)} />
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {data.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">→</span>
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <RankCard
          title="Best categories"
          rows={data.bestCategories.map((c) => ({ label: c.name, value: `${fmt(c.views)} views`, sub: `${c.reels} reels` }))}
        />
        <RankCard
          title="Best durations"
          rows={data.bestDurationBuckets.map((d) => ({ label: `${d.durationBucket}s`, value: `${fmt(d.avgViews)} avg`, sub: `${d.reels} reels` }))}
        />
        <RankCard
          title="Top topics / hooks"
          rows={data.bestHooks.map((h) => ({ label: `#${h.tag}`, value: `${fmt(h.avgViews)} avg`, sub: `${h.reels} reels` }))}
        />
        <RankCard
          title="Best upload hours"
          rows={data.bestUploadHours.map((h) => ({ label: `${h.hour}:00`, value: `${fmt(h.avgViews)} avg`, sub: `${h.reels} reels` }))}
        />
      </div>

      {/* Top reels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top reels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.topReels.length === 0 && <p className="text-sm text-muted-foreground">No analytics yet.</p>}
          {data.topReels.map((r, i) => (
            <div key={r.reelId} className="flex items-center gap-3 rounded-md border p-2 text-sm">
              <span className="w-5 text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{r.title ?? 'Untitled reel'}</span>
              <span className="tabular-nums text-muted-foreground">{fmt(r.views)} views</span>
              <span className="tabular-nums text-muted-foreground">{fmt(r.likes)} likes</span>
              <span className="tabular-nums">{r.engagementRate}%</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function RankCard({ title, rows }: { title: string; rows: Array<{ label: string; value: string; sub: string }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="truncate">{r.label}</span>
            <span className="ml-2 shrink-0 text-muted-foreground">
              {r.value} · {r.sub}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
