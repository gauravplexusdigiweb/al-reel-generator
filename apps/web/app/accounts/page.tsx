'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SocialAccountDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

const PLATFORMS = [
  { id: 'webhook', name: 'Custom Webhook', icon: '🔗', description: 'POST reels to your own URL — works locally right now', tokenLabel: 'Webhook URL', tokenHint: 'e.g. https://webhook.site/xxxx', needsIg: false },
  { id: 'instagram', name: 'Instagram', icon: '📸', description: 'Publish reels via the Instagram Graph API', tokenLabel: 'Access token', tokenHint: 'Graph API token with instagram_content_publish', needsIg: true },
  { id: 'youtube', name: 'YouTube Shorts', icon: '▶️', description: 'Upload as YouTube Shorts (Data API)', tokenLabel: 'OAuth access token', tokenHint: 'Token with youtube.upload scope', needsIg: false },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', description: 'Post via the TikTok Content Posting API', tokenLabel: 'Access token', tokenHint: 'Token with video.publish scope', needsIg: false },
] as const;

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccountDto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setAccounts(await api.getAccounts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleDisconnect(id: string) {
    try {
      await api.deleteAccount(id);
      await reload();
      toast.success('Account disconnected');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div>
        <h1 className="text-xl font-semibold">Connected Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Connect accounts to publish reels. Full browser OAuth needs a public app, so connect with a
          token you generate (for Webhook, paste a destination URL — that one works locally today).
        </p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {PLATFORMS.map((platform) => {
        const connected = accounts.filter((a) => a.platform === platform.id);
        return (
          <Card key={platform.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{platform.icon}</span>
                  <div>
                    <CardTitle className="text-base">{platform.name}</CardTitle>
                    <CardDescription>{platform.description}</CardDescription>
                  </div>
                </div>
                <ConnectDialog platform={platform} onConnected={reload} />
              </div>
            </CardHeader>
            {connected.length > 0 && (
              <CardContent className="space-y-2">
                {connected.map((account) => (
                  <div key={account.id} className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <Share2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{account.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          Connected {new Date(account.connectedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <Badge variant="success">active</Badge>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="hover:text-destructive" title="Disconnect">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect &ldquo;{account.displayName}&rdquo;?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes the stored token. You can reconnect anytime.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDisconnect(account.id)}>Disconnect</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ConnectDialog({
  platform,
  onConnected,
}: {
  platform: (typeof PLATFORMS)[number];
  onConnected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [igUserId, setIgUserId] = useState('');
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!token.trim()) {
      toast.error(`${platform.tokenLabel} is required`);
      return;
    }
    setBusy(true);
    try {
      await api.connectAccount(platform.id, {
        accessToken: token.trim(),
        displayName: displayName.trim() || undefined,
        platformMeta: platform.needsIg && igUserId.trim() ? { igUserId: igUserId.trim() } : undefined,
      });
      toast.success(`${platform.name} connected`);
      setToken('');
      setDisplayName('');
      setIgUserId('');
      setOpen(false);
      onConnected();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to connect');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {platform.name}</DialogTitle>
          <DialogDescription>{platform.tokenHint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{platform.tokenLabel}</Label>
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder={platform.tokenHint} />
          </div>
          {platform.needsIg && (
            <div className="space-y-1.5">
              <Label>Instagram user ID</Label>
              <Input value={igUserId} onChange={(e) => setIgUserId(e.target.value)} placeholder="IG business account id" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Display name (optional)</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="My account" />
          </div>
          <Button onClick={connect} disabled={busy} className="w-full">
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
