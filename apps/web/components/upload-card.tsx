'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectValue, SelectTrigger } from '@/components/ui/select';
import { uploadVideo, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CategoryDto } from '@arg/shared';

const ALLOWED = ['mp4', 'mov', 'mkv', 'avi'];

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
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED.includes(ext)) {
      toast.error(`Unsupported format ".${ext}". Allowed: ${ALLOWED.join(', ')}`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const { videoId } = await uploadVideo(file, setProgress, categoryId ?? undefined);
      toast.success('Upload complete — processing started');
      onUploaded();
      router.push(`/videos/${videoId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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
        <CardDescription>MP4, MOV, MKV or AVI. Reels are generated automatically.</CardDescription>
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
                    {'\u00A0'.repeat(c.depth * 2)}{c.name}
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