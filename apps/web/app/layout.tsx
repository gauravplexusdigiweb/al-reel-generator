import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { Toaster } from 'sonner';
import { ServiceHealth } from '@/components/service-health';

export const metadata: Metadata = {
  title: 'AI Reel Generator',
  description: 'Turn long-form videos into scored, captioned 9:16 reels.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background antialiased">
        <header className="border-b">
          <div className="container flex h-14 items-center gap-2">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Clapperboard className="h-5 w-5" />
              AI Reel Generator
            </Link>
            <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              local
            </span>
            <div className="ml-auto">
              <ServiceHealth />
            </div>
          </div>
        </header>
        <main className="container py-8">{children}</main>
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}
