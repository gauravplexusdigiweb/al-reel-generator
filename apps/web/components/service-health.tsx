'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, type ServicesHealth } from '@/lib/api';
import { cn } from '@/lib/utils';

export function ServiceHealth() {
  const [health, setHealth] = useState<ServicesHealth | null>(null);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const h = await api.servicesHealth();
        if (active) {
          setHealth(h);
          setReachable(true);
        }
      } catch {
        if (active) setReachable(false);
      }
    };
    void poll();
    const t = setInterval(poll, 10000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  if (!reachable) {
    return <Chip tone="down" label="API offline" title="Cannot reach the API server" />;
  }
  if (!health) return null;

  if (health.degraded) {
    const down = [!health.aiService && 'ai-service', !health.ollama && 'Ollama'].filter(Boolean).join(', ');
    return <Chip tone="warn" label="Fallback mode" title={`Down: ${down}. Reels use heuristic fallbacks.`} />;
  }
  return <Chip tone="ok" label="AI ready" title="ai-service and Ollama are reachable" />;
}

function Chip({ tone, label, title }: { tone: 'ok' | 'warn' | 'down'; label: string; title: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        tone === 'ok' && 'border-emerald-600/40 text-emerald-500',
        tone === 'warn' && 'border-amber-500/40 text-amber-500',
        tone === 'down' && 'border-red-500/40 text-red-500',
      )}
    >
      {tone === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  );
}
