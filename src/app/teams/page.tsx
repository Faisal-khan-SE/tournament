'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shield, PlusCircle, Users, Search, Pencil, Trash2, X } from 'lucide-react';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Spinner,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';

interface Team {
  id: string;
  name: string;
  shortName: string;
  manager?: string | null;
  contact?: string | null;
  homeVenue?: string | null;
  players: { player: { id: string; fullName: string } }[];
  _count?: { homeMatches: number; awayMatches: number; wonMatches: number };
}

export default function TeamsPage() {
  const toast = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const data = await apiCall('/api/teams');
      setTeams(data.teams);
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
    if (!q) return teams;
    return teams.filter((t) => `${t.name} ${t.shortName}`.toLowerCase().includes(q));
  }, [teams, query]);

  async function runDelete(force: boolean) {
    if (!pendingDelete) return;
    try {
      setDeleting(true);
      await apiCall(`/api/teams/${pendingDelete.id}${force ? '?force=true' : ''}`, {
        method: 'DELETE',
      });
      toast.success(`Deleted ${pendingDelete.name}`);
      setTeams((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      setPendingDelete(null);
      setDeleteWarning(null);
    } catch (e: any) {
      // The API asks for a second confirmation when matches would be destroyed.
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
            <Shield className="w-6 h-6 text-blue-400" />
            Teams
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Teams are reusable across every tournament and single match.
          </p>
        </div>

        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 justify-center"
        >
          <PlusCircle className="w-4 h-4" /> Add team
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams…"
          aria-label="Search teams"
          className={`${inputClass} pl-9`}
        />
      </div>

      {loading ? (
        <Spinner label="Loading teams…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Shield className="w-10 h-10" />}
          title={query ? 'No teams found' : 'No teams yet'}
          message={
            query
              ? `Nothing matches "${query}".`
              : 'Add a team to start building squads, or create a single match — it will create the teams for you as you type their names.'
          }
          action={
            !query && (
              <button
                onClick={() => setFormOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-xs font-bold text-white"
              >
                Add your first team
              </button>
            )
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((team) => {
            const played = (team._count?.homeMatches || 0) + (team._count?.awayMatches || 0);
            return (
              <div
                key={team.id}
                className="p-5 bg-pitch-card border border-pitch-border rounded-2xl space-y-3 hover:border-blue-900 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/teams/${team.id}`} className="flex items-center gap-3 min-w-0 group">
                    <div className="w-12 h-12 rounded-xl bg-pitch-dark border border-pitch-border flex items-center justify-center font-black text-sm text-cricket-400 shrink-0">
                      {team.shortName}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-white leading-tight truncate group-hover:text-cricket-400 transition">
                        {team.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">
                        {team.manager ? `Manager: ${team.manager}` : 'No manager set'}
                      </p>
                    </div>
                  </Link>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditing(team);
                        setFormOpen(true);
                      }}
                      aria-label={`Edit ${team.name}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-pitch-dark"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPendingDelete(team)}
                      aria-label={`Delete ${team.name}`}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-pitch-border/60 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-bold text-purple-300">{team.players.length}</div>
                    <div className="text-[10px] text-gray-400 uppercase">Players</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-200">{played}</div>
                    <div className="text-[10px] text-gray-400 uppercase">Matches</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-cricket-400">
                      {team._count?.wonMatches || 0}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Won</div>
                  </div>
                </div>

                <Link
                  href={`/teams/${team.id}`}
                  className="block w-full py-2 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-200 text-center hover:bg-pitch-border/40 flex items-center justify-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" /> Manage squad
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <TeamForm
          team={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setFormOpen(false);
            setEditing(null);
            load();
            toast.success(editing ? 'Team updated' : 'Team created');
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        busy={deleting}
        title={deleteWarning ? 'This will delete matches too' : 'Delete this team?'}
        message={
          deleteWarning ||
          (pendingDelete
            ? `"${pendingDelete.name}" will be removed. Its players stay in the player directory.`
            : '')
        }
        confirmLabel={deleteWarning ? 'Delete everything' : 'Delete team'}
        onConfirm={() => runDelete(!!deleteWarning)}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteWarning(null);
        }}
      />
    </div>
  );
}

function TeamForm({
  team,
  onClose,
  onSaved,
}: {
  team: Team | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(team?.name || '');
  const [shortName, setShortName] = useState(team?.shortName || '');
  const [manager, setManager] = useState(team?.manager || '');
  const [contact, setContact] = useState(team?.contact || '');
  const [homeVenue, setHomeVenue] = useState(team?.homeVenue || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Suggest a short name from the team name, but never overwrite a typed one.
  useEffect(() => {
    if (team || shortName) return;
    const guess = name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 4);
    if (guess.length >= 2) setShortName(guess);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Team name is required');
    if (!shortName.trim()) return setError('Short name is required');

    try {
      setSaving(true);
      const body = JSON.stringify({ name, shortName, manager, contact, homeVenue });
      if (team) await apiCall(`/api/teams/${team.id}`, { method: 'PATCH', body });
      else await apiCall('/api/teams', { method: 'POST', body });
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
          <h3 className="text-base font-bold text-white">{team ? 'Edit team' : 'New team'}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-950/80 border border-red-800 text-red-300 text-xs rounded-xl">
            {error}
          </div>
        )}

        <Field label="Team name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Shahodi Strikers"
            className={inputClass}
            autoFocus
          />
        </Field>

        <Field label="Short name" hint="Up to 5 characters, shown on scorecards.">
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value.toUpperCase().slice(0, 5))}
            placeholder="SST"
            className={inputClass}
          />
        </Field>

        <Field label="Manager (optional)">
          <input value={manager} onChange={(e) => setManager(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Contact (optional)">
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Phone or email"
            className={inputClass}
          />
        </Field>

        <Field label="Home ground (optional)">
          <input value={homeVenue} onChange={(e) => setHomeVenue(e.target.value)} className={inputClass} />
        </Field>

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
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : team ? 'Save changes' : 'Create team'}
          </button>
        </div>
      </form>
    </div>
  );
}
