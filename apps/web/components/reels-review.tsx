'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReelDto } from '@arg/shared';
import { toast } from 'sonner';
import { Download, Check, X, RefreshCw, Scissors, Star, Trash2, Save, Plus, Archive, Send } from 'lucide-react';
import { SocialPublishDialog } from '@/components/social-publish-dialog';
import { api, mediaUrl, ASPECT_RATIOS } from '@/lib/api';
import { formatDuration, scorePct, scoreTone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ScoreBars } from '@/components/score-bars';
import { Skeleton } from '@/components/ui/skeleton';
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
    } catch {
      /* silent */
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

  const [filter, setFilter] = useState<'all' | ReelDto['status']>('all');
  const [sort, setSort] = useState<'score' | 'newest' | 'duration'>('score');
  const [newClipOpen, setNewClipOpen] = useState(false);

  const visible = useMemo(() => {
    const list = filter === 'all' ? reels : reels.filter((r) => r.status === filter);
    const cmp = {
      score: (a: ReelDto, b: ReelDto) => (b.score?.overall ?? 0) - (a.score?.overall ?? 0),
      newest: (a: ReelDto, b: ReelDto) => +new Date(b.createdAt) - +new Date(a.createdAt),
      duration: (a: ReelDto, b: ReelDto) => b.endSec - b.startSec - (a.endSec - a.startSec),
    }[sort];
    return [...list].sort(cmp);
  }, [reels, filter, sort]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="candidate">Candidate</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Sort: score</SelectItem>
            <SelectItem value="newest">Sort: newest</SelectItem>
            <SelectItem value="duration">Sort: duration</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setNewClipOpen(true)}>
            <Plus className="mr-1 h-3 w-3" /> New clip
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={api.exportZipUrl(videoId, 'approved')}>
              <Archive className="mr-1 h-3 w-3" /> Export approved
            </a>
          </Button>
        </div>
      </div>

      {loading && reels.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed">
          <p className="text-sm text-muted-foreground">No reels match this filter.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((reel) => (
            <ReelCard key={reel.id} reel={reel} onOpen={() => setSelectedId(reel.id)} />
          ))}
        </div>
      )}

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

      <NewClipDialog
        videoId={videoId}
        durationSec={durationSec}
        open={newClipOpen}
        onOpenChange={setNewClipOpen}
        onCreated={(r) => setReels((prev) => [r, ...prev])}
      />
    </>
  );
}

function NewClipDialog({
  videoId,
  durationSec,
  open,
  onOpenChange,
  onCreated,
}: {
  videoId: string;
  durationSec: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (r: ReelDto) => void;
}) {
  const [range, setRange] = useState<[number, number]>([0, Math.min(30, durationSec || 30)]);
  const [aspect, setAspect] = useState('9:16');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const reel = await api.createReel(videoId, { startSec: range[0], endSec: range[1], aspectRatio: aspect });
      toast.success('Clip created — rendering');
      onCreated(reel);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create clip');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New manual clip</DialogTitle>
          <DialogDescription>Pick a time window and aspect ratio to render a reel.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Window</span>
            <span className="tabular-nums">
              {range[0].toFixed(1)}s → {range[1].toFixed(1)}s ({(range[1] - range[0]).toFixed(1)}s)
            </span>
          </div>
          <Slider
            min={0}
            max={Math.max(1, durationSec)}
            step={0.5}
            value={range}
            onValueChange={(v) => setRange([v[0], v[1]] as [number, number])}
            minStepsBetweenThumbs={2}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Aspect</span>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={create} disabled={busy || range[1] <= range[0]}>
            <Plus className="mr-1 h-4 w-4" /> Create clip
          </Button>
        </div>
      </DialogContent>
    </Dialog>
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
  const [shareOpen, setShareOpen] = useState(false);
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
            <Select
              value={reel.aspectRatio}
              onValueChange={(v) => run(() => api.regenerate(reel.id, { aspectRatio: v }), `Re-rendering at ${v}`)}
            >
              <SelectTrigger className="h-8 w-24 text-xs" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECT_RATIOS.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => api.publish(reel.id), 'Published & exported locally')}>
              Publish
            </Button>
            {fileUrl && (
              <Button size="sm" disabled={busy} onClick={() => setShareOpen(true)}>
                <Send className="mr-1 h-3 w-3" /> Share
              </Button>
            )}
            {fileUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={api.downloadUrl(reel.id)}>
                  <Download className="mr-1 h-3 w-3" /> Download
                </a>
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  disabled={busy}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this reel?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the reel and all its files.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <SocialPublishDialog
        reelId={reel.id}
        defaultCaption={reel.suggestedTitle ?? ''}
        defaultTags={reel.tags}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}