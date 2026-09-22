'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Users, PlusCircle, Search, Pencil, Trash2, X, Download } from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Spinner,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';

const ROLES = ['BATSMAN', 'BOWLER', 'ALL_ROUNDER', 'WICKETKEEPER'];
const ROLE_LABEL: Record<string, string> = {
  BATSMAN: 'Batter',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WICKETKEEPER: 'Wicketkeeper',
};

export default function PlayersPage() {
  const toast = useToast();
  const [players, setPlayers] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [p, t] = await Promise.all([apiCall('/api/players'), apiCall('/api/teams')]);
      setPlayers(p.players);
      setTeams(t.teams);
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
    return players.filter((p) => {
      if (roleFilter !== 'ALL' && p.role !== roleFilter) return false;
      if (!q) return true;
      const teamNames = p.teams.map((tp: any) => tp.team.name).join(' ');
      return `${p.fullName} ${teamNames}`.toLowerCase().includes(q);
    });
  }, [players, query, roleFilter]);

  async function runDelete(force: boolean) {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await apiCall(`/api/players/${pendingDelete.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      });
      toast.success(`Deleted ${pendingDelete.fullName}`);
      setPlayers((prev) => prev.filter((p) => p.id !== pendingDelete.id));
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
            <Users className="w-6 h-6 text-purple-400" />
            Players
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            One record per player, reused across every team and tournament.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="/api/export?type=players"
            className="px-3 py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5 hover:bg-pitch-border/40"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>
          <button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> Add player
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players or teams…"
            aria-label="Search players"
            className={`${inputClass} pl-9`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {['ALL', ...ROLES].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                roleFilter === r
                  ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-pitch-card border-pitch-border text-gray-300 hover:bg-pitch-border/40'
              }`}
            >
              {r === 'ALL' ? 'All roles' : ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading players…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Users className="w-10 h-10" />}
          title={query || roleFilter !== 'ALL' ? 'No players found' : 'No players yet'}
          message={
            query || roleFilter !== 'ALL'
              ? 'Try clearing the search or role filter.'
              : 'Add players here, or just type their names when you create a match — they get registered automatically.'
          }
          action={
            !query &&
            roleFilter === 'ALL' && (
              <button
                onClick={() => setFormOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-purple-600 text-xs font-bold text-white"
              >
                Add your first player
              </button>
            )
          }
        />
      ) : (
        <>
          <p className="text-xs text-gray-400">
            {visible.length} player{visible.length === 1 ? '' : 's'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((player) => {
              const teamNames = player.teams.map((tp: any) => tp.team.name);
              return (
                <div
                  key={player.id}
                  className="p-4 bg-pitch-card border border-pitch-border rounded-xl hover:border-purple-900 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/players/${player.id}`} className="flex items-center gap-3 min-w-0 group">
                      <div className="w-10 h-10 rounded-full bg-pitch-dark border border-purple-900 flex items-center justify-center text-purple-400 font-bold text-xs shrink-0">
                        {player.jerseyNumber ? `#${player.jerseyNumber}` : player.fullName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-white text-sm truncate group-hover:text-cricket-400 transition">
                          {player.fullName}
                        </h3>
                        <span className="text-[10px] text-cricket-400 font-semibold uppercase">
                          {ROLE_LABEL[player.role] || player.role}
                        </span>
                      </div>
                    </Link>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => {
                          setEditing(player);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${player.fullName}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-pitch-dark"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingDelete(player)}
                        aria-label={`Delete ${player.fullName}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-pitch-border/50 text-[11px] text-gray-400 space-y-1">
                    <div className="truncate">
                      Teams:{' '}
                      <span className="text-gray-200 font-semibold">
                        {teamNames.length ? teamNames.join(', ') : 'Free agent'}
                      </span>
                    </div>
                    <div className="truncate">
                      {player.battingStyle} • {player.bowlingStyle}
                    </div>
                    <div>
                      Scorecards:{' '}
                      <span className="text-gray-200">
                        {(player._count?.battingScores || 0) + (player._count?.bowlingFigures || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {formOpen && (
        <PlayerForm
          player={editing}
          teams={teams}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
            toast.success(editing ? 'Player updated' : 'Player added');
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title={deleteWarning ? 'This player has scorecards' : 'Delete this player?'}
        message={
          deleteWarning ||
          (pendingDelete ? `"${pendingDelete.fullName}" will be permanently removed.` : '')
        }
        confirmLabel={deleteWarning ? 'Delete anyway' : 'Delete player'}
        onConfirm={() => runDelete(!!deleteWarning)}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteWarning(null);
        }}
      />
    </div>
  );
}

function PlayerForm({
  player,
  teams,
  onClose,
  onSaved,
}: {
  player: any;
  teams: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(player?.fullName || '');
  const [jerseyNumber, setJerseyNumber] = useState(player?.jerseyNumber ?? '');
  const [role, setRole] = useState(player?.role || 'ALL_ROUNDER');
  const [battingStyle, setBattingStyle] = useState(player?.battingStyle || 'Right-hand bat');
  const [bowlingStyle, setBowlingStyle] = useState(player?.bowlingStyle || 'Right-arm medium');
  const [teamId, setTeamId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Player name is required');

    try {
      setSaving(true);
      const body = JSON.stringify({
        fullName,
        jerseyNumber: jerseyNumber === '' ? null : jerseyNumber,
        role,
        battingStyle,
        bowlingStyle,
        ...(player ? {} : { teamId: teamId || undefined }),
      });
      if (player) await apiCall(`/api/players/${player.id}`, { method: 'PATCH', body });
      else await apiCall('/api/players', { method: 'POST', body });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-pitch-card border border-pitch-border rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 my-8"
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-bold text-white">{player ? 'Edit player' : 'New player'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <Field label="Full name" hint="Names must be unique — add an initial if two players share one.">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Jersey number">
            <input
              type="number"
              min={0}
              max={999}
              value={jerseyNumber}
              onChange={(e) => setJerseyNumber(e.target.value)}
              placeholder="—"
              className={inputClass}
            />
          </Field>
          <Field label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Batting style">
          <select
            value={battingStyle}
            onChange={(e) => setBattingStyle(e.target.value)}
            className={inputClass}
          >
            <option>Right-hand bat</option>
            <option>Left-hand bat</option>
          </select>
        </Field>

        <Field label="Bowling style">
          <select
            value={bowlingStyle}
            onChange={(e) => setBowlingStyle(e.target.value)}
            className={inputClass}
          >
            <option>Right-arm fast</option>
            <option>Right-arm medium</option>
            <option>Right-arm off-spin</option>
            <option>Right-arm leg-spin</option>
            <option>Left-arm fast</option>
            <option>Left-arm medium</option>
            <option>Left-arm spin</option>
            <option>Does not bowl</option>
          </select>
        </Field>

        {!player && teams.length > 0 && (
          <Field label="Add to team (optional)">
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={inputClass}>
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-semibold text-gray-300"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : player ? 'Save changes' : 'Add player'}
          </button>
        </div>
      </form>
    </div>
  );
}
