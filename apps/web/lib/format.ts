export function formatDuration(sec: number | null): string {
  if (sec === null || Number.isNaN(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}

export function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

/** 0..1 score -> 0..100 integer. */
export function scorePct(v: number): number {
  return Math.round(v * 100);
}

export function scoreTone(v: number): 'success' | 'warning' | 'destructive' {
  if (v >= 0.66) return 'success';
  if (v >= 0.4) return 'warning';
  return 'destructive';
}
