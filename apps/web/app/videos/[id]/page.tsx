'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { VideoStatusDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PipelineStatus } from '@/components/pipeline-status';
import { ReelsReview } from '@/components/reels-review';
import { formatDuration } from '@/lib/format';

export default function VideoDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [status, setStatus] = useState<VideoStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await api.getStatus(id);
        if (active) setStatus(s);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };
    void poll();
    const t = setInterval(poll, 2500);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!status) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { video } = status;
  const isReady = video.status === 'ready';

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{video.originalFilename}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDuration(video.durationSec)}
            {video.width ? ` · ${video.width}×${video.height}` : ''}
            {video.language ? ` · ${video.language}` : ''}
          </p>
        </div>
        <Badge variant={isReady ? 'success' : video.status === 'failed' ? 'destructive' : 'warning'}>
          {video.status}
        </Badge>
      </div>

      {!isReady && (
        <Card>
          <CardHeader>
            <CardTitle>Processing</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineStatus status={status} />
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Candidate reels {isReady ? '' : '(generating…)'}
        </h2>
        <ReelsReview videoId={id} durationSec={video.durationSec ?? 0} />
      </div>
    </div>
  );
}
