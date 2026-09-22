'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Trophy,
  Dices,
  Shield,
  Users,
  LayoutDashboard,
  PlusCircle,
  Menu,
  X,
  ListOrdered,
  BarChart3,
  LogIn,
  LogOut,
} from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Home', icon: LayoutDashboard, color: 'text-gray-300' },
  { href: '/tournaments', label: 'Tournaments', icon: Trophy, color: 'text-cricket-400' },
  { href: '/matches', label: 'Matches', icon: ListOrdered, color: 'text-amber-400' },
  { href: '/teams', label: 'Teams', icon: Shield, color: 'text-blue-400' },
  { href: '/players', label: 'Players', icon: Users, color: 'text-purple-400' },
  { href: '/stats', label: 'Stats', icon: BarChart3, color: 'text-emerald-400' },
  { href: '/admin', label: 'Admin', icon: LayoutDashboard, color: 'text-emerald-400' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // null = auth disabled (open site), otherwise whether this browser is signed in.
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((s) => setLoggedIn(s.enabled ? Boolean(s.loggedIn) : null))
      .catch(() => setLoggedIn(null));
  }, [pathname]);

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setLoggedIn(false);
    window.location.href = '/';
  }

  const sessionButton =
    loggedIn === null ? null : loggedIn ? (
      <button
        onClick={signOut}
        className="flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-pitch-card border border-pitch-border transition"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    ) : (
      <Link
        href={`/login?next=${encodeURIComponent(pathname || '/')}`}
        className="flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-semibold text-gray-300 hover:text-white hover:bg-pitch-card border border-pitch-border transition"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );

  // Close the drawer whenever navigation happens.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The scoring console is a full-screen touch surface; the nav chrome only
  // gets in the way there.
  if (pathname?.startsWith('/score/')) return null;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <header className="sticky top-0 z-50 bg-pitch-dark/95 backdrop-blur-md border-b border-pitch-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center space-x-3 group shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cricket-500 to-cricket-700 flex items-center justify-center shadow-lg shadow-cricket-900/50 group-hover:scale-105 transition-transform">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-cricket-400 to-emerald-200 bg-clip-text text-transparent">
                TapeBall Pro
              </span>
              <span className="hidden sm:block text-[10px] text-cricket-400 font-medium tracking-wider uppercase">
                Cricket Tournament Platform
              </span>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center space-x-1">
            {LINKS.map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center space-x-1.5 ${
                  isActive(href)
                    ? 'bg-cricket-900/60 text-white'
                    : 'text-gray-300 hover:text-white hover:bg-cricket-900/40'
                }`}
              >
                <Icon className={`w-4 h-4 ${color}`} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center space-x-2">
            <Link
              href="/tournaments/create"
              className="hidden sm:flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-semibold bg-cricket-600 hover:bg-cricket-500 text-white transition shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Tournament</span>
            </Link>
            <Link
              href="/match/create"
              className="hidden sm:flex items-center space-x-1 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white transition shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Match</span>
            </Link>
            {sessionButton}

            <button
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="lg:hidden p-2 rounded-lg text-gray-300 hover:text-white hover:bg-pitch-card border border-pitch-border"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-pitch-border bg-pitch-card">
          <nav className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-2 gap-2">
            {LINKS.map(({ href, label, icon: Icon, color }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-3 rounded-xl text-sm font-semibold flex items-center space-x-2 border ${
                  isActive(href)
                    ? 'bg-cricket-900/60 border-cricket-700 text-white'
                    : 'bg-pitch-dark border-pitch-border text-gray-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${color}`} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="max-w-7xl mx-auto px-4 pb-4 grid grid-cols-2 gap-2">
            <Link
              href="/tournaments/create"
              className="px-3 py-3 rounded-xl text-xs font-bold bg-cricket-600 text-white flex items-center justify-center space-x-1"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Tournament</span>
            </Link>
            <Link
              href="/match/create"
              className="px-3 py-3 rounded-xl text-xs font-bold bg-amber-600 text-white flex items-center justify-center space-x-1"
            >
              <Dices className="w-4 h-4" />
              <span>New Match</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
