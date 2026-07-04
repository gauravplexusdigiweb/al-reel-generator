'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, Loader2, Plus, Music2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from '@/components/ui/select';
import { uploadVideo, api, type UploadOpts } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CategoryDto } from '@arg/shared';

const ALLOWED = ['mp4', 'mov', 'mkv', 'avi'];
const MUSIC_ALLOWED = ['mp3', 'wav', 'm4a', 'aac', 'ogg'];

// Dropdown label → numeric strictness (0=off … 100=strictest / remove all).
const ADULT_LEVELS: Array<{ label: string; value: number }> = [
  { label: 'Off — keep everything', value: 0 },
  { label: 'Light — skip the most explicit', value: 25 },
  { label: 'Medium — skip strong nudity', value: 50 },
  { label: 'Strict — skip any nudity', value: 75 },
  { label: 'Remove all — any exposure', value: 100 },
];

function flattenCategories(cats: CategoryDto[], depth = 0): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const c of cats) {
    result.push({ id: c.id, name: c.name, depth });
    result.push(...flattenCategories(c.children, depth + 1));
  }
  return result;
}

export function UploadCard({ onUploaded }: { onUploaded: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Generation options (read at upload time).
  const [outputType, setOutputType] = useState<'reel' | 'teaser'>('reel');
  const [teaserCount, setTeaserCount] = useState(3);
  const [musicSource, setMusicSource] = useState<'original' | 'custom' | 'none'>('original');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [adultThreshold, setAdultThreshold] = useState(0);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.includes(ext)) {
      toast.error(`Unsupported format ".${ext}". Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    if (outputType === 'teaser' && musicSource === 'custom' && !musicFile) {
      toast.error('Choose a music file, or switch the teaser music to Original/None.');
      return;
    }
    setUploading(true);
    setProgress(0);
    const opts: UploadOpts = {
      categoryId: categoryId ?? undefined,
      outputType,
      adultThreshold,
      captionsEnabled,
    };
    if (outputType === 'teaser') {
      opts.teaserCount = teaserCount;
      opts.musicSource = musicSource;
      if (musicSource === 'custom') opts.music = musicFile;
    }
    try {
      const { videoId } = await uploadVideo(file, setProgress, opts);
      toast.success(
        outputType === 'teaser'
          ? `Upload complete — generating ${teaserCount} teaser${teaserCount > 1 ? 's' : ''}`
          : 'Upload complete — processing started',
      );
      onUploaded();
      router.push(`/videos/${videoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleMusicFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MUSIC_ALLOWED.includes(ext)) {
      toast.error(`Unsupported audio ".${ext}". Allowed: ${MUSIC_ALLOWED.join(', ')}`);
      return;
    }
    setMusicFile(file);
    setMusicSource('custom');
  }

  async function createCategory() {
    if (!newCatName.trim()) return;
    try {
      const cat = await api.createCategory({ name: newCatName.trim() });
      setCategories(await api.getCategories());
      setCategoryId(cat.id);
      setNewCatName('');
      setShowNewCat(false);
      toast.success('Category created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create category');
    }
  }

  const flat = flattenCategories(categories);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Upload a video</CardTitle>
        <CardDescription>MP4, MOV, MKV or AVI. Reels or teasers are generated automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Category (optional)</Label>
          <div className="flex gap-2">
            <Select value={categoryId ?? '__none'} onValueChange={(v) => setCategoryId(v === '__none' ? null : v)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Uncategorized</SelectItem>
                {flat.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {' '.repeat(c.depth * 2)}{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowNewCat(!showNewCat)}
              title="New category"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {showNewCat && (
            <div className="mt-2 flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createCategory();
                }}
              />
              <Button size="sm" variant="secondary" onClick={createCategory} disabled={!newCatName.trim()}>
                Create
              </Button>
            </div>
          )}
        </div>

        {/* Output type */}
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Output</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['reel', 'teaser'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOutputType(t)}
                className={cn(
                  'rounded-md border px-3 py-2 text-left text-xs transition-colors',
                  outputType === t ? 'border-primary bg-accent' : 'border-input hover:bg-accent/50',
                )}
              >
                <div className="font-medium capitalize">{t}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t === 'reel' ? 'Best single clips' : 'Trailer montage(s)'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Teaser-only options */}
        {outputType === 'teaser' && (
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">How many teasers</Label>
              <Select value={String(teaserCount)} onValueChange={(v) => setTeaserCount(Number(v))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} teaser{n > 1 ? 's' : ''} (20–45s each)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">Music</Label>
              <Select
                value={musicSource}
                onValueChange={(v) => {
                  const src = v as 'original' | 'custom' | 'none';
                  setMusicSource(src);
                  if (src === 'custom' && !musicFile) musicInputRef.current?.click();
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">From video (original audio)</SelectItem>
                  <SelectItem value="custom">Upload a track…</SelectItem>
                  <SelectItem value="none">No music</SelectItem>
                </SelectContent>
              </Select>
              {musicSource === 'custom' && (
                <div className="mt-2 flex items-center gap-2">
                  {musicFile ? (
                    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs">
                      <Music2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{musicFile.name}</span>
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setMusicFile(null)}
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => musicInputRef.current?.click()}
                    >
                      <Music2 className="mr-1.5 h-3.5 w-3.5" /> Choose audio
                    </Button>
                  )}
                  <input
                    ref={musicInputRef}
                    type="file"
                    accept={MUSIC_ALLOWED.map((e) => `.${e}`).join(',')}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleMusicFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="captions" className="text-xs text-muted-foreground">
                Burn-in captions
              </Label>
              <Switch id="captions" checked={captionsEnabled} onCheckedChange={setCaptionsEnabled} />
            </div>
          </div>
        )}

        {/* Adult filter */}
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">Adult filter</Label>
          <Select value={String(adultThreshold)} onValueChange={(v) => setAdultThreshold(Number(v))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADULT_LEVELS.map((l) => (
                <SelectItem key={l.value} value={String(l.value)}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {adultThreshold > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Scenes above this strictness are skipped when picking clips.
            </p>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (!uploading) inputRef.current?.click();
            }
          }}
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
          <div className="space-y-1">
            <Progress value={progress} />
            <div className="text-right text-xs text-muted-foreground">{progress}%</div>
          </div>
        )}
        {!uploading && (
          <Button className="w-full" onClick={() => inputRef.current?.click()}>
            Choose file
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
