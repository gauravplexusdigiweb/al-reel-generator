'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SocialAccountDto } from '@arg/shared';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const PLATFORMS: Array<{ id: string; name: string; icon: string; description: string }> = [
  { id: 'instagram', name: 'Instagram', icon: '📸', description: 'Publish reels to Instagram' },
  { id: 'youtube', name: 'YouTube Shorts', icon: '▶️', description: 'Upload as YouTube Shorts' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', description: 'Post to TikTok' },
  { id: 'webhook', name: 'Custom Webhook', icon: '🔗', description: 'POST to your own URL' },
];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<SocialAccountDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAccounts()
      .then(setAccounts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDisconnect(id: string) {
    try {
      await api.deleteAccount(id);
      setAccounts(await api.getAccounts());
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
          Connect your social accounts to publish reels directly from the app.
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
                <Button variant="outline" size="sm" disabled>
                  Connect
                </Button>
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
                            This will revoke access for this account. You can reconnect it anytime.
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