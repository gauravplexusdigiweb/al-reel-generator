'use client';

import Link from 'next/link';
import type { VideoDto, VideoStatus } from '@arg/shared';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDuration } from '@/lib/format';
import { Film, ChevronRight, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

const STATUS_VARIANT: Record<VideoStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  uploaded: 'secondary',
  validating: 'warning',
  processing: 'warning',
  ready: 'success',
  failed: 'destructive',
};

export function VideoList({
  videos,
  loading,
  onChanged,
}: {
  videos: VideoDto[];
  loading: boolean;
  onChanged?: () => void;
}) {
  async function handleDelete(e: React.MouseEvent, v: VideoDto) {
    e.preventDefault();
    if (!confirm(`Delete "${v.originalFilename}" and all its reels?`)) return;
    try {
      await api.deleteVideo(v.id);
      toast.success('Video deleted');
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  }

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
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
          >
            <Link href={`/videos/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
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
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => handleDelete(e, v)}
              title="Delete video"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
