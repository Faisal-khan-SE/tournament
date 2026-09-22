'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ListOrdered, Search, PlusCircle, Download, RefreshCw } from 'lucide-react';
import MatchCard, { MatchLike } from '@/components/MatchCard';
import {
  ConfirmDialog,
  EmptyState,
  Spinner,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';

const STATUS_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'LIVE', label: 'Live' },
  { key: 'SCHEDULED', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'ABANDONED', label: 'Abandoned' },
];

export default function MatchesPage() {
  const toast = useToast();
  const [matches, setMatches] = useState<MatchLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MatchLike | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<MatchLike | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (type !== 'ALL') params.set('type', type);
      const data = await apiCall(`/api/matches?${params.toString()}`);
      setMatches(data.matches);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type]);

  useEffect(() => {
    load();
  }, [load]);

  // Filter locally so typing feels instant.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matches;
    return matches.filter((m) =>
      [m.homeTeam.name, m.awayTeam.name, m.venue, m.tournament?.name || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [matches, query]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await apiCall(`/api/matches/${pendingDelete.id}`, { method: 'DELETE' });
      toast.success(
        `Deleted ${pendingDelete.homeTeam.name} vs ${pendingDelete.awayTeam.name}`
      );
      setMatches((prev) => prev.filter((m) => m.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pitch-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <ListOrdered className="w-6 h-6 text-amber-400" />
            Matches
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Every match on the platform — live, upcoming and finished.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={load}
            className="px-3 py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5 hover:bg-pitch-border/40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <a
            href="/api/export?type=matches"
            className="px-3 py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5 hover:bg-pitch-border/40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>
          <Link
            href="/match/create"
            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> New match
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by team, venue or tournament…"
            aria-label="Search matches"
            className={`${inputClass} pl-9`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                status === tab.key
                  ? 'bg-cricket-600 border-cricket-500 text-white'
                  : 'bg-pitch-card border-pitch-border text-gray-300 hover:bg-pitch-border/40'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <span className="w-px bg-pitch-border mx-1 hidden sm:block" />

          {[
            { key: 'ALL', label: 'Any type' },
            { key: 'TOURNAMENT', label: 'Tournament' },
            { key: 'SINGLE', label: 'Single' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setType(t.key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                type === t.key
                  ? 'bg-pitch-border text-white border-gray-600'
                  : 'bg-pitch-card border-pitch-border text-gray-400 hover:bg-pitch-border/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading matches…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="w-10 h-10" />}
          title={query ? 'No matches found' : 'No matches here yet'}
          message={
            query
              ? `Nothing matches "${query}". Try a different team, venue or tournament name.`
              : 'Create a single match to start scoring right away, or set up a tournament to generate a full fixture list.'
          }
          action={
            !query && (
              <Link
                href="/match/create"
                className="px-4 py-2.5 rounded-xl bg-amber-600 text-xs font-bold text-white"
              >
                Create a match
              </Link>
            )
          }
        />
      ) : (
        <>
          <p className="text-xs text-gray-400">
            Showing {visible.length} match{visible.length === 1 ? '' : 'es'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visible.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                onDelete={setPendingDelete}
                onEdit={setEditing}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title="Delete this match?"
        message={
          pendingDelete
            ? `${pendingDelete.homeTeam.name} vs ${pendingDelete.awayTeam.name} and its entire scorecard will be permanently removed.${
                pendingDelete.tournament ? ' The points table will be recalculated.' : ''
              }`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {editing && (
        <EditMatchDialog
          match={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setMatches((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
            );
            setEditing(null);
            toast.success('Match updated');
          }}
        />
      )}
    </div>
  );
}

function EditMatchDialog({
  match,
  onClose,
  onSaved,
}: {
  match: MatchLike;
  onClose: () => void;
  onSaved: (m: any) => void;
}) {
  const toast = useToast();
  const [venue, setVenue] = useState(match.venue);
  const [overs, setOvers] = useState(match.overs);
  const [date, setDate] = useState(
    new Date(match.date).toISOString().slice(0, 16)
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    try {
      setSaving(true);
      const data = await apiCall(`/api/matches/${match.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ venue, overs: Number(overs), date: new Date(date).toISOString() }),
      });
      onSaved(data.match);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-pitch-card border border-pitch-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-white">Edit match</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {match.homeTeam.name} vs {match.awayTeam.name}
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-300 mb-1.5">Venue</span>
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-300 mb-1.5">Overs</span>
            <input
              type="number"
              min={1}
              max={50}
              value={overs}
              onChange={(e) => setOvers(Number(e.target.value))}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-300 mb-1.5">Date & time</span>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
