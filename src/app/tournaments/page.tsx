'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Trophy, PlusCircle, Search, Trash2, MapPin, Users } from 'lucide-react';
import { ConfirmDialog, EmptyState, Spinner, apiCall, inputClass, useToast } from '@/components/ui';

export default function TournamentsPage() {
  const toast = useToast();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await apiCall('/api/tournaments');
      setTournaments(data.tournaments);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tournaments;
    return tournaments.filter((t) => `${t.name} ${t.venue}`.toLowerCase().includes(q));
  }, [tournaments, query]);

  async function runDelete(force: boolean) {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await apiCall(`/api/tournaments/${pendingDelete.slug}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      });
      toast.success(`Deleted ${pendingDelete.name}`);
      setTournaments((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      setPendingDelete(null);
      setDeleteWarning(null);
    } catch (e: any) {
      if (e.requiresConfirmation && !force) setDeleteWarning(e.message);
      else {
        toast.error(e.message);
        setPendingDelete(null);
        setDeleteWarning(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pitch-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-cricket-400" />
            Tournaments
          </h1>
          <p className="text-xs text-gray-400 mt-1">Leagues and knockouts with automatic standings.</p>
        </div>

        <Link
          href="/tournaments/create"
          className="px-4 py-2.5 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white flex items-center gap-1.5 justify-center"
        >
          <PlusCircle className="w-4 h-4" /> New tournament
        </Link>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tournaments…"
          aria-label="Search tournaments"
          className={`${inputClass} pl-9`}
        />
      </div>

      {loading ? (
        <Spinner label="Loading tournaments…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-10 h-10" />}
          title={query ? 'No tournaments found' : 'No tournaments yet'}
          message={
            query
              ? `Nothing matches "${query}".`
              : 'Pick your teams and the fixtures, points table and knockout bracket are generated for you.'
          }
          action={
            !query && (
              <Link
                href="/tournaments/create"
                className="px-4 py-2.5 rounded-xl bg-cricket-600 text-xs font-bold text-white"
              >
                Create your first tournament
              </Link>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((t) => {
            const pct = t.progress?.total
              ? Math.round((t.progress.completed / t.progress.total) * 100)
              : 0;
            return (
              <div
                key={t.id}
                className="p-5 bg-pitch-card border border-pitch-border rounded-2xl transition hover:border-cricket-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-cricket-900 text-cricket-300 border border-cricket-700">
                    {t.ballType.replace('_', ' ')} • {t.defaultOvers} OVERS
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {t.progress?.live > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-950 border border-red-800 text-[10px] font-bold text-red-300 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse" />
                        {t.progress.live} live
                      </span>
                    )}
                    <button
                      onClick={() => setPendingDelete(t)}
                      aria-label={`Delete ${t.name}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <Link href={`/tournaments/${t.slug}`} className="block group mt-3">
                  <h3 className="text-lg font-bold text-white group-hover:text-cricket-400 transition">
                    {t.name}
                  </h3>
                  <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {t.venue}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {t.teams.length} teams
                    </span>
                  </p>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                      <span>
                        {t.progress?.completed || 0} of {t.progress?.total || 0} matches played
                      </span>
                      <span className="font-semibold text-cricket-400">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-pitch-dark overflow-hidden">
                      <div className="h-full bg-cricket-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-pitch-border/60 text-xs text-cricket-300 font-semibold flex items-center justify-between">
                    <span>Standings, fixtures & bracket</span>
                    <span>→</span>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title={deleteWarning ? 'This tournament has results' : 'Delete this tournament?'}
        message={
          deleteWarning ||
          (pendingDelete
            ? `"${pendingDelete.name}", its fixtures and its points table will be permanently removed. Teams and players are kept.`
            : '')
        }
        confirmLabel={deleteWarning ? 'Delete everything' : 'Delete tournament'}
        onConfirm={() => runDelete(!!deleteWarning)}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteWarning(null);
        }}
      />
    </div>
  );
}
