'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReelDto } from '@arg/shared';
import { toast } from 'sonner';
import { Download, Check, X, RefreshCw, Scissors, Star, Trash2, Save } from 'lucide-react';
import { api, mediaUrl } from '@/lib/api';
import { formatDuration, scorePct, scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScoreBars } from '@/components/score-bars';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const STATUS_VARIANT = {
  candidate: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  published: 'default',
} as const;

export function ReelsReview({ videoId, durationSec }: { videoId: string; durationSec: number }) {
  const [reels, setReels] = useState<ReelDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setReels(await api.getReels(videoId));
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    void reload();
    const t = setInterval(reload, 4000);
    return () => clearInterval(t);
  }, [reload]);

  const patch = useCallback((r: ReelDto) => {
    setReels((prev) => prev.map((x) => (x.id === r.id ? r : x)));
  }, []);

  const removeReel = useCallback((id: string) => {
    setReels((prev) => prev.filter((x) => x.id !== id));
    setSelectedId(null);
  }, []);

  const selected = useMemo(() => reels.find((r) => r.id === selectedId) ?? null, [reels, selectedId]);

  if (loading && reels.length === 0) {
    return <p className="text-sm text-muted-foreground">Loading reels…</p>;
  }
  if (reels.length === 0) {
    return <p className="text-sm text-muted-foreground">No candidate reels yet.</p>;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {reels.map((reel) => (
          <ReelCard key={reel.id} reel={reel} onOpen={() => setSelectedId(reel.id)} />
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent>
          {selected && (
            <ReelReviewPanel
              reel={selected}
              durationSec={durationSec}
              onChange={patch}
              onDeleted={removeReel}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReelCard({ reel, onOpen }: { reel: ReelDto; onOpen: () => void }) {
  const thumb = reel.thumbnails.find((t) => t.selected) ?? reel.thumbnails[0];
  const overall = reel.score?.overall ?? 0;
  return (
    <Card className="overflow-hidden">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative aspect-[9/16] bg-black">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(thumb.url) ?? ''} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              rendering…
            </div>
          )}
          <div className="absolute left-2 top-2 flex gap-1">
            <Badge variant={scoreTone(overall)}>{scorePct(overall)}</Badge>
            <Badge variant="outline" className="bg-black/60">
              {formatDuration(reel.endSec - reel.startSec)}
            </Badge>
          </div>
          <div className="absolute right-2 top-2">
            <Badge variant={STATUS_VARIANT[reel.status]}>{reel.status}</Badge>
          </div>
        </div>
      </button>
      <CardContent className="p-3">
        <p className="line-clamp-2 text-sm font-medium">{reel.suggestedTitle ?? 'Untitled reel'}</p>
      </CardContent>
    </Card>
  );
}

function ReelReviewPanel({
  reel,
  durationSec,
  onChange,
  onDeleted,
}: {
  reel: ReelDto;
  durationSec: number;
  onChange: (r: ReelDto) => void;
  onDeleted: (id: string) => void;
}) {
  const [range, setRange] = useState<[number, number]>([reel.startSec, reel.endSec]);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(reel.suggestedTitle ?? '');
  const [tags, setTags] = useState<string[]>(reel.tags);
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    setRange([reel.startSec, reel.endSec]);
    setTitle(reel.suggestedTitle ?? '');
    setTags(reel.tags);
  }, [reel.id, reel.startSec, reel.endSec, reel.suggestedTitle, reel.tags]);

  async function run(action: () => Promise<ReelDto>, msg: string) {
    setBusy(true);
    try {
      onChange(await action());
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function addTag(raw: string) {
    const t = raw.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }

  async function handleDelete() {
    if (!confirm('Delete this reel?')) return;
    setBusy(true);
    try {
      await api.deleteReel(reel.id);
      toast.success('Reel deleted');
      onDeleted(reel.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  const dirty = title !== (reel.suggestedTitle ?? '') || tags.join(',') !== reel.tags.join(',');
  const fileUrl = mediaUrl(reel.fileUrl);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{reel.suggestedTitle ?? 'Untitled reel'}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <span>
            {formatDuration(reel.endSec - reel.startSec)} · overall score{' '}
            {scorePct(reel.score?.overall ?? 0)} · {reel.status}
          </span>
          {reel.needsRerender && (
            <Badge variant="warning" className="text-[10px]">
              edited — re-render to apply
            </Badge>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="aspect-[9/16] overflow-hidden rounded-lg bg-black">
            {fileUrl ? (
              <video src={fileUrl} controls className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                rendering…
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {reel.thumbnails.map((t) => (
              <button
                key={t.id}
                onClick={() => run(() => api.selectThumbnail(reel.id, t.id), 'Thumbnail selected')}
                className={cn(
                  'relative aspect-[9/16] flex-1 overflow-hidden rounded border-2',
                  t.selected ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(t.url) ?? ''} alt="" className="h-full w-full object-cover" />
                {t.selected && <Star className="absolute right-1 top-1 h-3 w-3 fill-primary text-primary" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {reel.score && <ScoreBars score={reel.score} />}

          {/* Editable title + tags */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reel title" />
            <div className="flex flex-wrap items-center gap-1">
              {tags.map((t) => (
                <Badge key={t} variant="outline" className="gap-1">
                  #{t}
                  <button onClick={() => setTags(tags.filter((x) => x !== t))} title="Remove tag">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder="add tag…"
                className="w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !dirty}
              onClick={() => run(() => api.updateReel(reel.id, { suggestedTitle: title, tags }), 'Saved')}
            >
              <Save className="mr-1 h-3 w-3" /> Save title & tags
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Trim</span>
              <span className="tabular-nums">
                {range[0].toFixed(1)}s → {range[1].toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0}
              max={Math.max(durationSec, reel.endSec)}
              step={0.5}
              value={range}
              onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
              minStepsBetweenThumbs={2}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || (range[0] === reel.startSec && range[1] === reel.endSec)}
              onClick={() => run(() => api.trim(reel.id, { startSec: range[0], endSec: range[1] }), 'Re-rendering trimmed reel')}
            >
              <Scissors className="mr-1 h-3 w-3" /> Apply trim & re-render
            </Button>
          </div>

          {reel.transcript.length > 0 && (
            <div className="max-h-28 overflow-y-auto rounded-md border p-2 text-xs text-muted-foreground">
              {reel.transcript.map((s, i) => (
                <span key={i}>{s.text} </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" disabled={busy} onClick={() => run(() => api.approve(reel.id), 'Approved')}>
              <Check className="mr-1 h-3 w-3" /> Approve
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => run(() => api.reject(reel.id), 'Rejected')}>
              <X className="mr-1 h-3 w-3" /> Reject
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.regenerate(reel.id, {}), 'Regenerating')}>
              <RefreshCw className="mr-1 h-3 w-3" /> Regenerate
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.publish(reel.id), 'Published & exported locally')}>
              Publish
            </Button>
            {fileUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={api.downloadUrl(reel.id)}>
                  <Download className="mr-1 h-3 w-3" /> Download
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={handleDelete}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
