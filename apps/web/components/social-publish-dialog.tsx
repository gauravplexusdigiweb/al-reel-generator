'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Send, RefreshCw, ExternalLink } from 'lucide-react';
import type { SocialAccountDto, SocialPostDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANT = {
  pending: 'secondary',
  uploading: 'warning',
  published: 'success',
  failed: 'destructive',
} as const;

export function SocialPublishDialog({
  reelId,
  defaultCaption,
  defaultTags,
  open,
  onOpenChange,
}: {
  reelId: string;
  defaultCaption: string;
  defaultTags: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [accounts, setAccounts] = useState<SocialAccountDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [caption, setCaption] = useState(defaultCaption);
  const [hashtags, setHashtags] = useState(defaultTags.join(' '));
  const [scheduledAt, setScheduledAt] = useState('');
  const [posts, setPosts] = useState<SocialPostDto[]>([]);
  const [busy, setBusy] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setPosts(await api.getReelPosts(reelId));
    } catch {
      /* ignore */
    }
  }, [reelId]);

  useEffect(() => {
    if (!open) return;
    setCaption(defaultCaption);
    setHashtags(defaultTags.join(' '));
    api.getAccounts().then(setAccounts).catch(() => {});
    void loadPosts();
    const t = setInterval(loadPosts, 4000);
    return () => clearInterval(t);
  }, [open, reelId, defaultCaption, defaultTags, loadPosts]);

  async function publish() {
    if (selected.size === 0) {
      toast.error('Select at least one account');
      return;
    }
    setBusy(true);
    try {
      await api.publishReel(reelId, {
        accountIds: [...selected],
        caption: caption.trim() || undefined,
        hashtags: hashtags.split(/[\s,]+/).map((h) => h.replace(/^#/, '')).filter(Boolean),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      toast.success(scheduledAt ? 'Scheduled' : 'Publishing…');
      setSelected(new Set());
      await loadPosts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to social</DialogTitle>
          <DialogDescription>Select accounts and publish this reel. Webhook works locally now.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts connected. <Link href="/accounts" className="underline">Connect one →</Link>
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Accounts</Label>
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={selected.has(a.id)}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const n = new Set(prev);
                        if (c) n.add(a.id);
                        else n.delete(a.id);
                        return n;
                      })
                    }
                  />
                  <span className="font-medium">{a.displayName}</span>
                  <Badge variant="outline">{a.platform}</Badge>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Caption</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Hashtags</Label>
              <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="tag1 tag2" />
            </div>
            <div className="space-y-1.5">
              <Label>Schedule (optional)</Label>
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            </div>
          </div>

          <Button onClick={publish} disabled={busy || accounts.length === 0} className="w-full">
            <Send className="mr-1 h-4 w-4" /> {scheduledAt ? 'Schedule' : 'Publish now'}
          </Button>

          {posts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Posts</Label>
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Badge variant="outline">{p.platform}</Badge>
                  <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                  {p.error && <span className="truncate text-xs text-red-500" title={p.error}>{p.error}</span>}
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <div className="ml-auto flex gap-1">
                    {p.status === 'failed' && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" title="Retry"
                        onClick={async () => { await api.retryPost(p.id); await loadPosts(); }}>
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
