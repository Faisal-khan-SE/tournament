import './globals.css';
import Navbar from '@/components/Navbar';
import { ToastProvider } from '@/components/ui';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'TapeBall Pro — Tournament & Live Cricket Scoring Platform',
  description:
    'Manage tape-ball cricket tournaments and standalone single matches with live ball-by-ball scoring, automatic NRR, points table, and knockout brackets.',
};

// Scoring happens on a phone at the ground, so lock the layout to device width.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a160e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-pitch-dark text-gray-100 min-h-screen flex flex-col antialiased">
        <ToastProvider>
          <Navbar />
          <main className="flex-grow">{children}</main>
          <footer className="bg-pitch-card border-t border-pitch-border py-6 mt-12 text-center text-xs text-gray-400">
            <div className="max-w-7xl mx-auto px-4">
              TapeBall Pro &copy; {new Date().getFullYear()} — Tape-Ball Cricket Platform.
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
