'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api, type EffectiveSettings } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsPage() {
  const [s, setS] = useState<EffectiveSettings | null>(null);
  const [buckets, setBuckets] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then((v) => {
        setS(v);
        setBuckets(v.durationBuckets.join(', '));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load settings'));
  }, []);

  if (!s) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const set = <K extends keyof EffectiveSettings>(k: K, v: EffectiveSettings[K]) =>
    setS({ ...s, [k]: v });

  async function save() {
    setBusy(true);
    try {
      const durationBuckets = buckets
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
      const saved = await api.updateSettings({ ...s!, durationBuckets });
      setS(saved);
      setBuckets(saved.durationBuckets.join(', '));
      toast.success('Settings saved — applies to future runs');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline settings</CardTitle>
          <CardDescription>Overrides the .env defaults. Applies to newly processed videos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Min candidate reels">
              <Input type="number" value={s.candidateMin} onChange={(e) => set('candidateMin', +e.target.value)} />
            </Field>
            <Field label="Max candidate reels">
              <Input type="number" value={s.candidateMax} onChange={(e) => set('candidateMax', +e.target.value)} />
            </Field>
          </div>
          <Field label="Duration buckets (seconds, comma-separated)">
            <Input value={buckets} onChange={(e) => setBuckets(e.target.value)} placeholder="15, 30, 45, 60" />
          </Field>
          <Field label="Frame sample rate (fps)">
            <Input type="number" value={s.sampleFps} onChange={(e) => set('sampleFps', +e.target.value)} />
          </Field>
          <Field label="Caption preset">
            <Select value={s.captionPreset} onValueChange={(v) => set('captionPreset', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">default</SelectItem>
                <SelectItem value="raised">raised (clears platform UI)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="karaoke">Word-level karaoke captions</Label>
            <Switch id="karaoke" checked={s.karaoke} onCheckedChange={(v) => set('karaoke', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="retain">Keep intermediate files (frames, audio)</Label>
            <Switch id="retain" checked={s.retainIntermediates} onCheckedChange={(v) => set('retainIntermediates', v)} />
          </div>
          <Button onClick={save} disabled={busy}>
            <Save className="mr-1 h-4 w-4" /> Save settings
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}