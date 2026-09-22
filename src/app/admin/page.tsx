'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  PlusCircle,
  Download,
  PlayCircle,
  Trash2,
  RefreshCw,
  Trophy,
  Shield,
  Users,
  ListOrdered,
} from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  Spinner,
  StatusBadge,
  apiCall,
  useToast,
} from '@/components/ui';
import { oversDisplay } from '@/lib/matchRules';

export default function AdminPage() {
  const toast = useToast();
  const [matches, setMatches] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [m, t, s] = await Promise.all([
        apiCall('/api/matches'),
        apiCall('/api/tournaments'),
        apiCall('/api/stats'),
      ]);
      setMatches(m.matches);
      setTournaments(t.tournaments);
      setStats(s);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteMatch(match: any) {
    try {
      setBusy(true);
      await apiCall(`/api/matches/${match.id}`, { method: 'DELETE' });
      toast.success('Match deleted');
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
      setConfirm(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading admin panel…" />;

  const totals = stats?.totals || {};
  const live = matches.filter((m) => m.status === 'LIVE' || m.status === 'INNINGS_BREAK');
  const scheduled = matches.filter((m) => m.status === 'SCHEDULED');
  const completed = matches.filter((m) => m.status === 'COMPLETED');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-pitch-border pb-4 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-cricket-400" />
            Admin panel
          </h1>
          <p className="text-xs text-gray-400 mt-1">Everything on the platform, in one place.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            className="px-3 py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <Link
            href="/tournaments/create"
            className="px-3.5 py-2.5 bg-cricket-600 hover:bg-cricket-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> Tournament
          </Link>
          <Link
            href="/match/create"
            className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-xl text-xs font-bold text-white flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> Match
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Tournaments', value: totals.tournaments ?? 0, color: 'text-cricket-400', href: '/tournaments', icon: Trophy },
          { label: 'Teams', value: totals.teams ?? 0, color: 'text-blue-400', href: '/teams', icon: Shield },
          { label: 'Players', value: totals.players ?? 0, color: 'text-purple-400', href: '/players', icon: Users },
          { label: 'Matches', value: totals.matches ?? 0, color: 'text-amber-400', href: '/matches', icon: ListOrdered },
        ].map(({ label, value, color, href, icon: Icon }) => (
          <Link
            key={label}
            href={href}
            className="p-4 sm:p-5 bg-pitch-card border border-pitch-border rounded-2xl hover:border-cricket-800 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400 font-semibold uppercase">{label}</span>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl sm:text-3xl font-black mt-2 ${color}`}>{value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Live', value: live.length, cls: 'border-red-900/50 text-red-400' },
          { label: 'Upcoming', value: scheduled.length, cls: 'border-amber-900/50 text-amber-400' },
          { label: 'Completed', value: completed.length, cls: 'border-cricket-900/50 text-cricket-400' },
        ].map((s) => (
          <div key={s.label} className={`p-4 bg-pitch-card border rounded-xl text-center ${s.cls}`}>
            <div className="text-[11px] font-bold uppercase">{s.label}</div>
            <div className="text-2xl font-black mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Exports */}
      <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-white">Export data</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { type: 'points', label: 'Points tables' },
            { type: 'players', label: 'Player statistics' },
            { type: 'matches', label: 'Match results' },
          ].map((x) => (
            <a
              key={x.type}
              href={`/api/export?type=${x.type}`}
              className="px-3.5 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5 hover:bg-pitch-border/40"
            >
              <Download className="w-3.5 h-3.5" /> {x.label}
            </a>
          ))}
        </div>
      </div>

      {/* Tournaments */}
      <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Tournaments</h2>
          <Link href="/tournaments" className="text-xs text-cricket-400 hover:underline font-semibold">
            Manage all →
          </Link>
        </div>

        {tournaments.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No tournaments yet.</p>
        ) : (
          <div className="space-y-2">
            {tournaments.map((t) => (
              <Link
                key={t.id}
                href={`/tournaments/${t.slug}`}
                className="flex items-center justify-between p-3 rounded-xl bg-pitch-dark border border-pitch-border hover:border-cricket-800 gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{t.name}</div>
                  <div className="text-[11px] text-gray-400">
                    {t.teams.length} teams • {t.progress.completed}/{t.progress.total} played
                  </div>
                </div>
                {t.progress.live > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-950 border border-red-800 text-[10px] font-bold text-red-300 shrink-0">
                    {t.progress.live} live
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Matches table */}
      <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">All matches ({matches.length})</h2>
          <Link href="/matches" className="text-xs text-cricket-400 hover:underline font-semibold">
            Browse with filters →
          </Link>
        </div>

        {matches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            message="Create a single match or generate a tournament fixture list to get started."
            action={
              <Link
                href="/match/create"
                className="px-4 py-2.5 rounded-xl bg-amber-600 text-xs font-bold text-white"
              >
                Create a match
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                  <th className="pb-3">Match</th>
                  <th className="pb-3">Competition</th>
                  <th className="pb-3">Score</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border/50">
                {matches.map((m) => {
                  const i1 = m.innings?.find((i: any) => i.inningsNo === 1);
                  const i2 = m.innings?.find((i: any) => i.inningsNo === 2);
                  const fmt = (i: any) =>
                    i ? `${i.totalRuns}/${i.totalWickets} (${oversDisplay(i.legalBalls)})` : '—';
                  return (
                    <tr key={m.id} className="hover:bg-pitch-dark/40">
                      <td className="py-3 pr-3">
                        <Link href={`/match/${m.id}`} className="font-bold text-white hover:text-cricket-400">
                          {m.homeTeam.name} v {m.awayTeam.name}
                        </Link>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          {m.venue} • {new Date(m.date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-gray-300">
                        {m.tournament ? (
                          <Link
                            href={`/tournaments/${m.tournament.slug}`}
                            className="hover:text-cricket-400"
                          >
                            {m.tournament.name}
                          </Link>
                        ) : (
                          <span className="text-gray-500">Single</span>
                        )}
                        {m.stage && !['LEAGUE', 'FRIENDLY'].includes(m.stage) && (
                          <span className="ml-1.5 text-[10px] text-amber-400 font-bold">{m.stage}</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-mono text-[11px] text-gray-300 whitespace-nowrap">
                        {fmt(i1)}
                        {i2 && <span className="text-gray-500"> / {fmt(i2)}</span>}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={m.status} />
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          {m.status !== 'COMPLETED' && m.status !== 'ABANDONED' && (
                            <Link
                              href={`/score/${m.id}`}
                              className="px-2.5 py-1.5 rounded-lg bg-cricket-600 hover:bg-cricket-500 text-white font-bold text-[11px] inline-flex items-center gap-1"
                            >
                              <PlayCircle className="w-3.5 h-3.5" /> Score
                            </Link>
                          )}
                          <button
                            onClick={() =>
                              setConfirm({
                                title: 'Delete this match?',
                                message: `${m.homeTeam.name} v ${m.awayTeam.name} and its scorecard will be permanently removed.${
                                  m.tournament ? ' The points table will be recalculated.' : ''
                                }`,
                                run: () => deleteMatch(m),
                              })
                            }
                            aria-label={`Delete ${m.homeTeam.name} v ${m.awayTeam.name}`}
                            className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-900 text-red-300 font-bold text-[11px] inline-flex items-center gap-1 hover:bg-red-900/60"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel="Delete match"
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
