'use client';

import Link from 'next/link';
import type { VideoDto, VideoStatus } from '@arg/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatDuration } from '@/lib/format';
import { Film, ChevronRight } from 'lucide-react';

const STATUS_VARIANT: Record<VideoStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  uploaded: 'secondary',
  validating: 'warning',
  processing: 'warning',
  ready: 'success',
  failed: 'destructive',
};

export function VideoList({ videos, loading }: { videos: VideoDto[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your videos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && videos.length === 0 && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {!loading && videos.length === 0 && (
          <p className="text-sm text-muted-foreground">No videos yet. Upload one to get started.</p>
        )}
        {videos.map((v) => (
          <Link
            key={v.id}
            href={`/videos/${v.id}`}
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <Film className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{v.originalFilename}</div>
              <div className="text-xs text-muted-foreground">
                {formatDuration(v.durationSec)} · {formatBytes(v.sizeBytes)} ·{' '}
                {new Date(v.createdAt).toLocaleString()}
              </div>
            </div>
            <Badge variant={STATUS_VARIANT[v.status]}>{v.status}</Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
