import type { Metadata } from 'next';
import './globals.css';
import { RootProvider } from '@/components/RootProvider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'https://supabase-schema.vercel.app',
  ),
  title: 'Tiger SQL',
  description: 'Visualize your Supabase database schema',
  openGraph: {
    title: 'Tiger SQL',
    description: 'Visualize your Supabase database schema',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider defaultTheme="light" storageKey="theme">
          <RootProvider>
            <main className="w-screen h-screen relative bg-background text-foreground overflow-hidden">
              {children}
            </main>
            <Toaster richColors closeButton position="top-right" />
          </RootProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
