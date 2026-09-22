'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield, UserPlus, Trash2, Users, Trophy } from 'lucide-react';
import MatchCard from '@/components/MatchCard';
import {
  ConfirmDialog,
  EmptyState,
  Spinner,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const teamId = params.id as string;

  const [team, setTeam] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [record, setRecord] = useState<any>(null);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [newName, setNewName] = useState('');
  const [pickPlayerId, setPickPlayerId] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [teamData, playersData] = await Promise.all([
        apiCall(`/api/teams/${teamId}`),
        apiCall('/api/players'),
      ]);
      setTeam(teamData.team);
      setMatches(teamData.matches);
      setRecord(teamData.record);
      setAllPlayers(playersData.players);
    } catch (e: any) {
      if (e.message?.includes('not found')) setNotFound(true);
      else toast.error(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addPlayer(body: any) {
    try {
      setAdding(true);
      await apiCall(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'addPlayer', ...body }),
      });
      setNewName('');
      setPickPlayerId('');
      await load();
      toast.success('Player added to the squad');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function removePlayer() {
    if (!removing) return;
    try {
      await apiCall(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'removePlayer', playerId: removing.id }),
      });
      setRemoving(null);
      await load();
      toast.success('Player removed from the squad');
    } catch (e: any) {
      toast.error(e.message);
      setRemoving(null);
    }
  }

  if (loading) return <Spinner label="Loading team…" />;

  if (notFound || !team) {
    return (
      <div className="max-w-xl mx-auto my-12 px-4">
        <EmptyState
          icon={<Shield className="w-10 h-10" />}
          title="Team not found"
          message="This team may have been deleted."
          action={
            <Link href="/teams" className="px-4 py-2.5 rounded-xl bg-blue-600 text-xs font-bold text-white">
              Back to teams
            </Link>
          }
        />
      </div>
    );
  }

  const squadIds = new Set(team.players.map((tp: any) => tp.player.id));
  const available = allPlayers.filter((p) => !squadIds.has(p.id));

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <button
        onClick={() => router.push('/teams')}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> All teams
      </button>

      {/* Header */}
      <div className="bg-gradient-to-r from-pitch-card via-pitch-dark to-pitch-card border border-pitch-border rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-pitch-dark border border-pitch-border flex items-center justify-center font-black text-lg text-cricket-400 shrink-0">
            {team.shortName}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white truncate">{team.name}</h1>
            <p className="text-xs text-gray-400 mt-1">
              {[team.manager && `Manager: ${team.manager}`, team.homeVenue, team.contact]
                .filter(Boolean)
                .join(' • ') || 'No additional details'}
            </p>
          </div>
        </div>

        {record && (
          <div className="mt-5 grid grid-cols-3 sm:grid-cols-5 gap-3">
            {[
              { label: 'Played', value: record.played, color: 'text-gray-200' },
              { label: 'Won', value: record.won, color: 'text-cricket-400' },
              { label: 'Lost', value: record.lost, color: 'text-red-400' },
              { label: 'Tied', value: record.tied, color: 'text-amber-400' },
              { label: 'Upcoming', value: record.scheduled, color: 'text-blue-300' },
            ].map((s) => (
              <div key={s.label} className="p-3 bg-pitch-dark/70 border border-pitch-border rounded-xl text-center">
                <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tournaments */}
      {team.pointsEntries?.length > 0 && (
        <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-cricket-400" /> Tournament form
          </h2>
          <div className="space-y-2">
            {team.pointsEntries.map((pe: any) => (
              <Link
                key={pe.id}
                href={`/tournaments/${pe.tournament.slug}`}
                className="flex items-center justify-between p-3 rounded-xl bg-pitch-dark border border-pitch-border text-xs hover:border-cricket-800"
              >
                <span className="font-semibold text-gray-200 truncate">{pe.tournament.name}</span>
                <span className="text-gray-400 shrink-0 ml-3">
                  #{pe.rank || '—'} • {pe.points} pts • NRR{' '}
                  {pe.nrr > 0 ? `+${pe.nrr.toFixed(3)}` : pe.nrr.toFixed(3)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Squad */}
      <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" /> Squad ({team.players.length})
        </h2>

        {team.players.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">
            No players in this squad yet. Add one below — you can also type a brand-new name.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {team.players.map((tp: any) => (
              <div
                key={tp.id}
                className="flex items-center justify-between p-3 rounded-xl bg-pitch-dark border border-pitch-border"
              >
                <Link href={`/players/${tp.player.id}`} className="min-w-0 group">
                  <div className="text-sm font-semibold text-gray-100 truncate group-hover:text-cricket-400">
                    {tp.player.fullName}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase">
                    {tp.player.role?.replace('_', ' ')}
                    {tp.player.jerseyNumber ? ` • #${tp.player.jerseyNumber}` : ''}
                  </div>
                </Link>
                <button
                  onClick={() => setRemoving(tp.player)}
                  aria-label={`Remove ${tp.player.fullName}`}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-300 border border-pitch-border hover:text-red-300 hover:border-red-800 hover:bg-red-950/60 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-pitch-border/60 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Add an existing player
              </label>
              <div className="flex gap-2">
                <select
                  value={pickPlayerId}
                  onChange={(e) => setPickPlayerId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a player…</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => pickPlayerId && addPlayer({ playerId: pickPlayerId })}
                  disabled={!pickPlayerId || adding}
                  className="px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-40 shrink-0"
                  aria-label="Add selected player"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
              {available.length === 0 && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Every registered player is already in this squad.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                Or create a new player
              </label>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newName.trim()) addPlayer({ fullName: newName.trim() });
                }}
              >
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Player name"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={!newName.trim() || adding}
                  className="px-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-white disabled:opacity-40 shrink-0"
                  aria-label="Create and add player"
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Matches */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-white">Matches ({matches.length})</h2>
        {matches.length === 0 ? (
          <EmptyState
            title="No matches yet"
            message="This team has not been scheduled into a match. Create a single match or add the team to a tournament."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        title="Remove from squad?"
        message={
          removing
            ? `${removing.fullName} will be taken off ${team.name}'s squad list. Their player record and past statistics are kept.`
            : ''
        }
        confirmLabel="Remove"
        onConfirm={removePlayer}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
