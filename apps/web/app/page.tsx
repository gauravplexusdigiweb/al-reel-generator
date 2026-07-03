'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VideoDto } from '@arg/shared';
import { api } from '@/lib/api';
import { UploadCard } from '@/components/upload-card';
import { VideoList } from '@/components/video-list';
import { CategorySidebar } from '@/components/category-sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Film } from 'lucide-react';

export default function HomePage() {
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setVideos(await api.listVideos(selectedCategory ?? undefined));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const hasProcessing = videos.some(
    (v) => v.status === 'processing' || v.status === 'validating' || v.status === 'uploaded',
  );

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const v = await api.listVideos(selectedCategory ?? undefined);
        if (active) {
          setVideos(v);
          setError(null);
        }
      } catch {
        /* silent */
      }
    };
    const interval = hasProcessing ? 5000 : 30000;
    const t = setInterval(poll, interval);

    const onVisibility = () => {
      if (!document.hidden && active) void poll();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedCategory, hasProcessing]);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <div className="hidden lg:block">
        <div className="sticky top-20">
          <h3 className="mb-2 px-2 text-xs font-semibold uppercase text-muted-foreground">Categories</h3>
          <CategorySidebar selectedId={selectedCategory} onSelect={setSelectedCategory} />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <UploadCard onUploaded={reload} />
        <div className="space-y-3">
          {loading && (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          )}
          {!loading && videos.length === 0 && !error && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed">
              <Film className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No videos yet. Upload one to get started.
              </p>
            </div>
          )}
          {!loading && error && (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-destructive/30">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={reload}
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Try again
              </button>
            </div>
          )}
          {!loading && videos.length > 0 && (
            <VideoList videos={videos} loading={loading} onChanged={reload} />
          )}
        </div>
      </div>
    </div>
  );
}