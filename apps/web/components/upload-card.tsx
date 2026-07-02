'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { uploadVideo } from '@/lib/api';
import { cn } from '@/lib/utils';

const ALLOWED = ['mp4', 'mov', 'mkv', 'avi'];

export function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.includes(ext)) {
      toast.error(`Unsupported format ".${ext}". Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const { videoId } = await uploadVideo(file, setProgress);
      toast.success('Upload complete — processing started');
      onUploaded();
      router.push(`/videos/${videoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Upload a video</CardTitle>
        <CardDescription>MP4, MOV, MKV or AVI. Reels are generated automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
            dragOver ? 'border-primary bg-accent' : 'border-input hover:bg-accent/50',
            uploading && 'pointer-events-none opacity-70',
          )}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <UploadCloud className="h-8 w-8 text-muted-foreground" />
          )}
          <div className="text-sm text-muted-foreground">
            {uploading ? 'Uploading…' : 'Drag & drop or click to choose a file'}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED.map((e) => `.${e}`).join(',')}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {uploading && (
          <div className="mt-4 space-y-1">
            <Progress value={progress} />
            <div className="text-right text-xs text-muted-foreground">{progress}%</div>
          </div>
        )}
        {!uploading && (
          <Button className="mt-4 w-full" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
