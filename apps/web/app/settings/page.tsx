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

  if (!s) return <p className="text-sm text-muted-foreground">Loading…</p>;

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
            <select
              value={s.captionPreset}
              onChange={(e) => set('captionPreset', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="default">default</option>
              <option value="raised">raised (clears platform UI)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.karaoke} onChange={(e) => set('karaoke', e.target.checked)} />
            Word-level karaoke captions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.retainIntermediates}
              onChange={(e) => set('retainIntermediates', e.target.checked)}
            />
            Keep intermediate files (frames, audio) — uses more disk
          </label>
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
