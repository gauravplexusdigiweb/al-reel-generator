import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Clapperboard, Settings, FolderTree, Share2, TrendingUp } from 'lucide-react';
import { Toaster } from 'sonner';
import { ServiceHealth } from '@/components/service-health';
import { ThemeProvider } from '@/lib/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle-dynamic';

export const metadata: Metadata = {
  title: 'AI Reel Generator',
  description: 'Turn long-form videos into scored, captioned 9:16 reels.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 items-center gap-2">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Clapperboard className="h-5 w-5" />
              <span className="hidden sm:inline">AI Reel Generator</span>
            </Link>
            <span className="ml-2 rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              local
            </span>
            <nav className="ml-4 hidden items-center gap-1 md:flex">
              <Link href="/" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <Clapperboard className="h-4 w-4" /> Videos
              </Link>
              <Link href="/categories" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <FolderTree className="h-4 w-4" /> Categories
              </Link>
              <Link href="/accounts" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <Share2 className="h-4 w-4" /> Accounts
              </Link>
              <Link href="/insights" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                <TrendingUp className="h-4 w-4" /> Insights
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ServiceHealth />
              <ThemeToggle />
              <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>
        <main className="container py-8">{children}</main>
        <Toaster richColors position="top-right" theme="dark" />
        </ThemeProvider>
      </body>
    </html>
  );
}