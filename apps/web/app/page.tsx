'use client';

import { useCallback, useEffect, useState } from 'react';
import type { VideoDto } from '@arg/shared';
import { api } from '@/lib/api';
import { UploadCard } from '@/components/upload-card';
import { VideoList } from '@/components/video-list';

export default function HomePage() {
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setVideos(await api.listVideos());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <UploadCard onUploaded={reload} />
      <VideoList videos={videos} loading={loading} />
    </div>
  );
}
