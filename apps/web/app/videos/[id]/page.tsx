'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, Folder } from 'lucide-react';
import { toast } from 'sonner';
import type { VideoStatusDto, CategoryDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PipelineStatus } from '@/components/pipeline-status';
import { ReelsReview } from '@/components/reels-review';
import { formatDuration } from '@/lib/format';

export default function VideoDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [status, setStatus] = useState<VideoStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval>;

    const poll = async () => {
      try {
        const s = await api.getStatus(id);
        if (!active) return;
        setStatus(s);
        setError(null);

        if (s.video.status === 'ready' || s.video.status === 'failed') {
          clearInterval(interval);
          return;
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load');
      }
    };

    void poll();
    interval = setInterval(poll, 2500);

    const onVisibility = () => {
      if (!document.hidden && active) void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [id]);

  async function handleRetry() {
    try {
      setStatus(await api.retryVideo(id));
      toast.success('Retrying from the failed step');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    }
  }

  async function handleMoveCategory(categoryId: string) {
    try {
      await api.moveVideo(id, categoryId === '__none' ? null : categoryId);
      toast.success('Category updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to move');
    }
  }

  if (error && !status) return <p className="text-sm text-red-500">{error}</p>;
  if (!status) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { video } = status;
  const isReady = video.status === 'ready';
  const isFailed = video.status === 'failed';
  const isTerminal = isReady || isFailed;

  function flattenForSelect(cats: CategoryDto[], depth = 0): Array<{ id: string; name: string; depth: number }> {
    const result: Array<{ id: string; name: string; depth: number }> = [];
    for (const c of cats) {
      result.push({ id: c.id, name: c.name, depth });
      result.push(...flattenForSelect(c.children, depth + 1));
    }
    return result;
  }

  const flatCats = flattenForSelect(categories);

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
        <div className="flex items-center gap-2">
          <Select
            value={video.categoryId ?? '__none'}
            onValueChange={(v) => handleMoveCategory(v)}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <div className="flex items-center gap-1">
                <Folder className="h-3 w-3" />
                <SelectValue placeholder="Uncategorized" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Uncategorized</SelectItem>
              {flatCats.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {'\u00A0'.repeat(c.depth * 2)}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant={isReady ? 'success' : isFailed ? 'destructive' : 'warning'}>
            {video.status}
          </Badge>
          {isFailed && (
            <Button size="sm" variant="outline" onClick={handleRetry}>
              <RefreshCw className="mr-1 h-3 w-3" /> Retry
            </Button>
          )}
        </div>
      </div>

      {!isTerminal && (
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