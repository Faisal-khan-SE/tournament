'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trophy,
  Award,
  Download,
  RefreshCw,
  Settings,
  Zap,
  Trash2,
  MapPin,
  Users,
  Plus,
} from 'lucide-react';
import MatchCard from '@/components/MatchCard';
import { KNOCKOUT_FEEDS } from '@/lib/matchRules';
import {
  ConfirmDialog,
  EmptyState,
  Field,
  Spinner,
  StatusBadge,
  apiCall,
  inputClass,
  useToast,
} from '@/components/ui';
import { oversDisplay } from '@/lib/matchRules';
import { GroupSelect, PlayerListEditor } from '@/components/TeamBuilder';

type Tab = 'POINTS' | 'FIXTURES' | 'BRACKET' | 'STATS' | 'MANAGE';

const TAB_LABELS: Record<Tab, string> = {
  POINTS: 'Points table',
  FIXTURES: 'Fixtures',
  BRACKET: 'Knockouts',
  STATS: 'Leaderboards',
  MANAGE: 'Manage',
};

export default function TournamentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const slug = params.slug as string;

  const [data, setData] = useState<any>(null);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('POINTS');
  const [confirm, setConfirm] = useState<null | {
    title: string;
    message: string;
    label: string;
    run: () => Promise<unknown>;
  }>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [t, teams] = await Promise.all([
        apiCall(`/api/tournaments/${slug}`),
        apiCall('/api/teams'),
      ]);
      setData(t);
      setAllTeams(teams.teams);
    } catch (e: any) {
      if (e.message?.includes('not found')) setNotFound(true);
      else toast.error(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  /** Runs a tournament action, surfacing the API's confirmation prompts. */
  async function act(body: any, successMessage?: string) {
    try {
      setBusy(true);
      const res = await apiCall(`/api/tournaments/${slug}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(successMessage || res.message || 'Done');
      await load();
      setConfirm(null);
      return true;
    } catch (e: any) {
      if (e.requiresConfirmation) {
        setConfirm({
          title: 'Are you sure?',
          message: e.message,
          label: 'Continue anyway',
          run: async () => act({ ...body, force: true }, successMessage),
        });
      } else {
        toast.error(e.message);
        setConfirm(null);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading tournament…" />;

  if (notFound || !data) {
    return (
      <div className="max-w-xl mx-auto my-12 px-4">
        <EmptyState
          icon={<Trophy className="w-10 h-10" />}
          title="Tournament not found"
          message="This tournament may have been deleted."
          action={
            <Link href="/tournaments" className="px-4 py-2.5 rounded-xl bg-cricket-600 text-xs font-bold text-white">
              Back to tournaments
            </Link>
          }
        />
      </div>
    );
  }

  const { tournament, topBatsmen, topBowlers, progress } = data;
  const leagueMatches = tournament.matches.filter((m: any) => m.stage === 'LEAGUE');
  const knockouts = tournament.knockoutMatches || [];
  const qualifyCount = tournament.pointsTable.length >= 8 ? 8 : 4;
  // Group labels in use, in order; empty when the tournament is a single league.
  const groups: string[] = Array.from(
    new Set<string>(tournament.teams.map((t: any) => t.groupName).filter(Boolean))
  ).sort();
  const usesGroups = groups.length > 0;
  const tournamentTeamIds = new Set(tournament.teams.map((t: any) => t.teamId));
  const addableTeams = allTeams.filter((t) => !tournamentTeamIds.has(t.id));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-pitch-card via-cricket-950 to-pitch-card border border-pitch-border rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-cricket-600 flex items-center justify-center shadow-lg shrink-0">
              <Trophy className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black text-white">{tournament.name}</h1>
              <p className="text-xs text-gray-300 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {tournament.venue}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" /> {tournament.teams.length} teams
                </span>
                <span>{tournament.defaultOvers} overs</span>
                <span>{tournament.ballType.replace('_', ' ').toLowerCase()}</span>
              </p>
              {tournament.description && (
                <p className="text-xs text-gray-400 mt-2 max-w-xl">{tournament.description}</p>
              )}
            </div>
          </div>

          {progress.champion && (
            <div className="px-4 py-3 rounded-xl bg-amber-950/70 border border-amber-700 text-center shrink-0">
              <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wide">Champion</div>
              <div className="text-base font-black text-white mt-0.5">{progress.champion.name}</div>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
            <span>
              League progress — {progress.leaguePlayed} of {progress.leagueTotal} matches
            </span>
            {progress.leagueComplete && (
              <span className="text-cricket-400 font-bold">League complete</span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-pitch-dark overflow-hidden">
            <div
              className="h-full bg-cricket-500 rounded-full transition-all"
              style={{
                width: `${progress.leagueTotal ? (progress.leaguePlayed / progress.leagueTotal) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-pitch-border -mx-4 px-4 sm:mx-0 sm:px-0">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3.5 py-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition ${
              tab === key
                ? 'border-cricket-500 text-cricket-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* ---------------- POINTS ---------------- */}
      {tab === 'POINTS' && (
        <div className="bg-pitch-card border border-pitch-border rounded-2xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">League standings</h2>
            <div className="flex gap-2">
              <button
                onClick={() => act({ action: 'recalculate' }, 'Standings recalculated')}
                disabled={busy}
                className="px-3 py-2 rounded-xl bg-pitch-dark border border-pitch-border text-[11px] font-bold text-gray-200 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recalculate
              </button>
              <a
                href={`/api/export?type=points&tournamentId=${tournament.id}`}
                className="px-3 py-2 rounded-xl bg-pitch-dark border border-pitch-border text-[11px] font-bold text-gray-200 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </a>
            </div>
          </div>

          {tournament.pointsTable.length === 0 ? (
            <EmptyState
              title="No teams in this tournament"
              message="Add teams from the Manage tab to build a points table."
            />
          ) : (
            <>
              {(usesGroups ? groups : [null]).map((group: string | null) => {
                const rows = tournament.pointsTable.filter((p: any) => (group ? p.groupName === group : true));
                // In a group stage the top two of each group go through.
                const qualifyHere = usesGroups ? 2 : qualifyCount;
                return (
              <div key={group || 'all'} className="space-y-2">
              {group && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-cricket-400">Group {group}</h3>
              )}
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                      <th className="pb-3 pr-2">#</th>
                      <th className="pb-3">Team</th>
                      <th className="pb-3 text-center">P</th>
                      <th className="pb-3 text-center">W</th>
                      <th className="pb-3 text-center">L</th>
                      <th className="pb-3 text-center">T</th>
                      <th className="pb-3 text-center">NR</th>
                      <th className="pb-3 text-center font-extrabold text-cricket-400">PTS</th>
                      <th className="pb-3 text-right font-bold text-amber-400">NRR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-border/50">
                    {rows.map((p: any, idx: number) => {
                      // Qualification only means something once games have been played.
                      const anyPlayed = progress.leaguePlayed > 0;
                      const isQualified = anyPlayed && idx < qualifyHere;
                      const nrr = p.nrr > 0 ? `+${p.nrr.toFixed(3)}` : p.nrr.toFixed(3);
                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-pitch-dark/40 ${isQualified ? 'bg-cricket-950/20' : ''}`}
                        >
                          <td className="py-3 pr-2 font-bold text-gray-300">{p.rank || idx + 1}</td>
                          <td className="py-3">
                            <Link
                              href={`/teams/${p.teamId}`}
                              className="font-bold text-white hover:text-cricket-400"
                            >
                              {p.team.name}
                            </Link>
                            <span className="text-[10px] text-gray-500 ml-2">{p.team.shortName}</span>
                            {isQualified && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-cricket-900 text-cricket-300 border border-cricket-700">
                                Q
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-center text-gray-300">{p.played}</td>
                          <td className="py-3 text-center text-cricket-400 font-bold">{p.won}</td>
                          <td className="py-3 text-center text-red-400">{p.lost}</td>
                          <td className="py-3 text-center text-amber-400">{p.tied}</td>
                          <td className="py-3 text-center text-gray-400">{p.noResult}</td>
                          <td className="py-3 text-center font-extrabold text-cricket-400 text-sm">
                            {p.points}
                          </td>
                          <td className="py-3 text-right font-mono font-bold text-amber-300">{nrr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
                );
              })}
              <p className="text-[11px] text-gray-500">
                {progress.leaguePlayed > 0
                  ? usesGroups
                    ? 'Top 2 in each group qualify for the knockouts. Ties are split on Net Run Rate.'
                    : `Top ${qualifyCount} qualify for the knockouts. Ties are split on Net Run Rate.`
                  : 'Standings appear once matches have been played. A win is 2 points, a tie or no-result 1 point.'}
              </p>
            </>
          )}
        </div>
      )}

      {/* ---------------- FIXTURES ---------------- */}
      {tab === 'FIXTURES' && (
        <div className="space-y-4">
          {leagueMatches.length === 0 ? (
            <EmptyState
              icon={<Trophy className="w-10 h-10" />}
              title="No fixtures yet"
              message="Generate a league schedule from the Manage tab, or add fixtures one at a time."
              action={
                <button
                  onClick={() => setTab('MANAGE')}
                  className="px-4 py-2.5 rounded-xl bg-cricket-600 text-xs font-bold text-white"
                >
                  Go to Manage
                </button>
              }
            />
          ) : (
            (usesGroups ? [...groups, null] : [null]).map((group: string | null) => {
              const rows = usesGroups
                ? leagueMatches.filter((m: any) => (group ? m.groupName === group : !m.groupName))
                : leagueMatches;
              if (rows.length === 0) return null;
              return (
            <div key={group || 'all'} className="space-y-3">
              {usesGroups && (
                <h3 className="text-xs font-bold uppercase tracking-wider text-cricket-400">
                  {group ? `Group ${group}` : 'Other fixtures'}
                </h3>
              )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rows.map((m: any) => (
                <MatchCard
                  key={m.id}
                  match={{ ...m, tournament: { name: tournament.name, slug: tournament.slug } }}
                  onDelete={(match) =>
                    setConfirm({
                      title: 'Delete this fixture?',
                      message: `${match.homeTeam.name} vs ${match.awayTeam.name} and its scorecard will be removed, and the points table recalculated.`,
                      label: 'Delete fixture',
                      run: async () => {
                        await apiCall(`/api/matches/${match.id}`, { method: 'DELETE' });
                        toast.success('Fixture deleted');
                        await load();
                        setConfirm(null);
                      },
                    })
                  }
                />
              ))}
            </div>
            </div>
              );
            })
          )}
        </div>
      )}

      {/* ---------------- BRACKET ---------------- */}
      {tab === 'BRACKET' && (
        <div className="bg-pitch-card border border-pitch-border rounded-2xl p-4 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-white">Knockout bracket</h2>
            {knockouts.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => act({ action: 'advanceKnockouts' }, 'Bracket updated')}
                  disabled={busy}
                  className="px-3 py-2 rounded-xl bg-pitch-dark border border-pitch-border text-[11px] font-bold text-gray-200 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh bracket
                </button>
                <button
                  onClick={() =>
                    setConfirm({
                      title: 'Remove the bracket?',
                      message:
                        'Every knockout match and its scorecard will be deleted. League results are not affected.',
                      label: 'Remove bracket',
                      run: async () => act({ action: 'resetKnockouts' }, 'Bracket removed'),
                    })
                  }
                  disabled={busy}
                  className="px-3 py-2 rounded-xl bg-red-950/60 border border-red-900 text-[11px] font-bold text-red-300 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            )}
          </div>

          {knockouts.length === 0 ? (
            <EmptyState
              icon={<Zap className="w-10 h-10" />}
              title="Bracket not generated yet"
              message={
                tournament.pointsTable.length < 4
                  ? 'You need at least 4 teams before a knockout bracket can be seeded.'
                  : progress.leagueComplete
                  ? `The league is finished. Seed the top ${qualifyCount} teams into the bracket.`
                  : `${progress.leagueTotal - progress.leaguePlayed} league match(es) still to play. You can seed early if you want to.`
              }
              action={
                tournament.pointsTable.length >= 4 && (
                  <button
                    onClick={() => act({ action: 'generateKnockouts' })}
                    disabled={busy}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white disabled:opacity-50"
                  >
                    Generate bracket (top {qualifyCount})
                  </button>
                )
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { title: 'Quarter-finals', prefix: 'QF', color: 'text-amber-400' },
                { title: 'Semi-finals', prefix: 'SF', color: 'text-purple-400' },
                { title: 'Final', prefix: 'FINAL', color: 'text-cricket-400' },
              ].map((round) => {
                const rows = knockouts.filter((k: any) =>
                  round.prefix === 'FINAL' ? k.stage === 'FINAL' : k.stage.startsWith(round.prefix)
                );
                if (rows.length === 0) return null;
                return (
                  <div key={round.prefix} className="space-y-3">
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${round.color}`}>
                      {round.title}
                    </h3>
                    {rows.map((k: any) => {
                      const m = k.match;
                      const homeInn = m.innings?.find((i: any) => i.battingTeamId === m.homeTeamId);
                      const awayInn = m.innings?.find((i: any) => i.battingTeamId === m.awayTeamId);
                      // Later rounds are seeded with stand-in teams until the
                      // feeding matches finish; show who they are waiting on.
                      const slot = k.slot as
                        | { pending: boolean; waitingOn: string[]; tiedFeeders: string[] }
                        | undefined;
                      if (slot?.pending) {
                        const feeders: string[] = KNOCKOUT_FEEDS[k.stage] || [];
                        return (
                          <Link
                            key={k.id}
                            href={`/match/${m.id}`}
                            className="block p-3 bg-pitch-dark border border-dashed border-pitch-border rounded-xl text-xs space-y-2 hover:border-cricket-800"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-gray-400 font-bold">{k.stage}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                TBD
                              </span>
                            </div>
                            <div className="space-y-1 text-gray-400 italic">
                              {feeders.map((f) => (
                                <div key={f}>Winner of {f}</div>
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-500 pt-1 border-t border-pitch-border/60">
                              {slot.tiedFeeders.length > 0
                                ? `${slot.tiedFeeders.join(' & ')} tied — record a tie-breaker`
                                : `Waiting for ${slot.waitingOn.join(' & ')}`}
                            </p>
                          </Link>
                        );
                      }
                      return (
                        <Link
                          key={k.id}
                          href={`/match/${m.id}`}
                          className="block p-3 bg-pitch-dark border border-pitch-border rounded-xl text-xs space-y-2 hover:border-cricket-800"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400 font-bold">{k.stage}</span>
                            <StatusBadge status={m.status} />
                          </div>
                          <div className="space-y-1">
                            <div
                              className={`flex justify-between gap-2 ${
                                m.winnerId === m.homeTeamId ? 'text-cricket-300 font-bold' : 'text-white'
                              }`}
                            >
                              <span className="truncate">{m.homeTeam.name}</span>
                              <span className="font-mono shrink-0">
                                {homeInn ? `${homeInn.totalRuns}/${homeInn.totalWickets}` : '—'}
                              </span>
                            </div>
                            <div
                              className={`flex justify-between gap-2 ${
                                m.winnerId === m.awayTeamId ? 'text-cricket-300 font-bold' : 'text-white'
                              }`}
                            >
                              <span className="truncate">{m.awayTeam.name}</span>
                              <span className="font-mono shrink-0">
                                {awayInn ? `${awayInn.totalRuns}/${awayInn.totalWickets}` : '—'}
                              </span>
                            </div>
                          </div>
                          {m.resultSummary && (
                            <p className="text-[10px] text-cricket-400 font-semibold pt-1 border-t border-pitch-border/60">
                              {m.resultSummary}
                            </p>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {knockouts.length > 0 && (
            <p className="text-[11px] text-gray-500">
              Winners move up automatically as each round finishes — quarter-final winners meet in the
              semis, semi-final winners in the final.
            </p>
          )}
        </div>
      )}

      {/* ---------------- STATS ---------------- */}
      {tab === 'STATS' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" /> Most runs
            </h3>
            {topBatsmen.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                No batting yet in this tournament.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[380px]">
                  <thead>
                    <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                      <th className="pb-2">Player</th>
                      <th className="pb-2 text-right">Inn</th>
                      <th className="pb-2 text-right">Runs</th>
                      <th className="pb-2 text-right">HS</th>
                      <th className="pb-2 text-right">Avg</th>
                      <th className="pb-2 text-right">SR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-border/40">
                    {topBatsmen.map((b: any, i: number) => (
                      <tr key={b.playerId}>
                        <td className="py-2">
                          <Link href={`/players/${b.playerId}`} className="font-semibold text-white hover:text-cricket-400">
                            {i + 1}. {b.name}
                          </Link>
                          <div className="text-[10px] text-gray-500">{b.teamName}</div>
                        </td>
                        <td className="py-2 text-right text-gray-300">{b.innings}</td>
                        <td className="py-2 text-right font-black text-cricket-400">{b.runs}</td>
                        <td className="py-2 text-right text-gray-300">{b.highest}</td>
                        <td className="py-2 text-right text-gray-400">
                          {b.average === null ? '—' : b.average.toFixed(1)}
                        </td>
                        <td className="py-2 text-right text-gray-400">{b.strikeRate.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-400" /> Most wickets
            </h3>
            {topBowlers.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">
                No bowling yet in this tournament.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] min-w-[380px]">
                  <thead>
                    <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                      <th className="pb-2">Player</th>
                      <th className="pb-2 text-right">O</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Best</th>
                      <th className="pb-2 text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-border/40">
                    {topBowlers.map((b: any, i: number) => (
                      <tr key={b.playerId}>
                        <td className="py-2">
                          <Link href={`/players/${b.playerId}`} className="font-semibold text-white hover:text-cricket-400">
                            {i + 1}. {b.name}
                          </Link>
                          <div className="text-[10px] text-gray-500">{b.teamName}</div>
                        </td>
                        <td className="py-2 text-right text-gray-300">{oversDisplay(b.legalBalls)}</td>
                        <td className="py-2 text-right font-black text-red-400">{b.wickets}</td>
                        <td className="py-2 text-right text-gray-300">{b.best}</td>
                        <td className="py-2 text-right text-gray-400">{b.economy.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- MANAGE ---------------- */}
      {tab === 'MANAGE' && (
        <ManageTab
          tournament={tournament}
          addableTeams={addableTeams}
          busy={busy}
          act={act}
          onDeleteTournament={() =>
            setConfirm({
              title: 'Delete this tournament?',
              message: `"${tournament.name}", its fixtures, scorecards and points table will be permanently removed.`,
              label: 'Delete tournament',
              run: async () => {
                try {
                  await apiCall(`/api/tournaments/${slug}?force=true`, { method: 'DELETE' });
                  toast.success('Tournament deleted');
                  router.push('/tournaments');
                } catch (e: any) {
                  toast.error(e.message);
                  setConfirm(null);
                }
              },
            })
          }
          onRemoveTeam={(team: any) =>
            setConfirm({
              title: `Remove ${team.name}?`,
              message:
                'The team leaves this tournament and its scheduled fixtures here are deleted. The team itself is kept.',
              label: 'Remove team',
              run: async () => act({ action: 'removeTeam', teamId: team.id }, 'Team removed'),
            })
          }
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label || 'Confirm'}
        onConfirm={() => confirm?.run()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function ManageTab({
  tournament,
  addableTeams,
  busy,
  act,
  onDeleteTournament,
  onRemoveTeam,
  onSaved,
}: any) {
  const toast = useToast();
  const [name, setName] = useState(tournament.name);
  const [venue, setVenue] = useState(tournament.venue);
  const [defaultOvers, setDefaultOvers] = useState(tournament.defaultOvers);
  const [description, setDescription] = useState(tournament.description || '');
  const [rules, setRules] = useState(tournament.rules || '');
  const [contactInfo, setContactInfo] = useState(tournament.contactInfo || '');
  const [saving, setSaving] = useState(false);
  const [addTeamId, setAddTeamId] = useState('');
  const [addGroup, setAddGroup] = useState('');
  const [newTeam, setNewTeam] = useState({ name: '', shortName: '', players: [] as string[], groupName: '' });
  const [showNewTeam, setShowNewTeam] = useState(false);

  const groups: string[] = Array.from(
    new Set<string>(tournament.teams.map((t: any) => t.groupName).filter(Boolean))
  ).sort();
  const grouped = tournament.teams.filter((t: any) => t.groupName).length;
  const teamCount = tournament.teams.length;
  // Same preview the create form shows: every team v every other in its group.
  const schedulePreview = (() => {
    if (teamCount < 2) return { ok: false, text: 'Add at least two teams to build a schedule.' };
    if (grouped > 0 && grouped !== teamCount) {
      return { ok: false, text: `${teamCount - grouped} team${teamCount - grouped === 1 ? ' has' : 's have'} no group — assign every team a group, or clear all groups.` };
    }
    const pools = new Map<string, number>();
    for (const t of tournament.teams) pools.set(t.groupName || '', (pools.get(t.groupName || '') || 0) + 1);
    let matches = 0;
    const lonely: string[] = [];
    for (const [g, n] of Array.from(pools.entries())) {
      if (n < 2) lonely.push(g);
      matches += (n * (n - 1)) / 2;
    }
    if (lonely.length) return { ok: false, text: `Group ${lonely.join(', ')} has only one team.` };
    return {
      ok: true,
      text: `${matches} match${matches === 1 ? '' : 'es'}${grouped ? ` across ${pools.size} group${pools.size === 1 ? '' : 's'}` : ''} — every team plays every other team${grouped ? ' in its group' : ''} once.`,
    };
  })();

  async function createTeam() {
    if (!newTeam.name.trim()) return toast.error('Give the team a name');
    const ok = await act(
      { action: 'createTeam', name: newTeam.name.trim(), shortName: newTeam.shortName.trim(), players: newTeam.players, groupName: newTeam.groupName || null },
      `${newTeam.name.trim()} created and added`
    );
    if (!ok) return;
    setNewTeam({ name: '', shortName: '', players: [], groupName: '' });
    setShowNewTeam(false);
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      await apiCall(`/api/tournaments/${tournament.slug}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, venue, defaultOvers, description, rules, contactInfo }),
      });
      toast.success('Tournament settings saved');
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Teams */}
      <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" /> Teams ({tournament.teams.length})
            {groups.length > 0 && (
              <span className="text-[10px] font-semibold text-gray-400">
                {groups.length} group{groups.length === 1 ? '' : 's'}
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowNewTeam((v) => !v)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cricket-600 hover:bg-cricket-500 text-[11px] font-bold text-white"
          >
            <Plus className="w-3.5 h-3.5" /> New team
          </button>
        </div>

        {showNewTeam && (
          <div className="p-3 rounded-xl bg-pitch-dark/60 border border-cricket-800 space-y-3">
            <div className="grid grid-cols-[1fr_88px_auto] gap-2">
              <input
                value={newTeam.name}
                onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                placeholder="Team name"
                autoFocus
                className={`${inputClass} !py-2 text-sm font-semibold`}
              />
              <input
                value={newTeam.shortName}
                onChange={(e) => setNewTeam({ ...newTeam, shortName: e.target.value.toUpperCase().slice(0, 5) })}
                placeholder="Short"
                maxLength={5}
                className={`${inputClass} !py-2 text-xs uppercase`}
              />
              <GroupSelect value={newTeam.groupName} onChange={(g) => setNewTeam({ ...newTeam, groupName: g })} />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-gray-400 mb-1.5">Players ({newTeam.players.length})</div>
              <PlayerListEditor players={newTeam.players} onChange={(players) => setNewTeam({ ...newTeam, players })} />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewTeam(false)}
                className="px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={createTeam}
                disabled={busy || !newTeam.name.trim()}
                className="px-4 py-2 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white disabled:opacity-40"
              >
                Create & add to tournament
              </button>
            </div>
          </div>
        )}

        {tournament.teams.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center">
            No teams yet — create one above or add a registered team below.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tournament.teams.map((tt: any) => (
              <div
                key={tt.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-pitch-dark border border-pitch-border"
              >
                <Link href={`/teams/${tt.team.id}`} className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-100 truncate hover:text-cricket-400">
                    {tt.team.name}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {tt.team.players?.length || 0} players
                  </div>
                </Link>
                <GroupSelect
                  value={tt.groupName || ''}
                  disabled={busy}
                  onChange={(g) =>
                    act({ action: 'setGroup', teamId: tt.teamId, groupName: g || null }, g ? `Moved to Group ${g}` : 'Group cleared')
                  }
                />
                <button
                  onClick={() => onRemoveTeam(tt.team)}
                  aria-label={`Remove ${tt.team.name}`}
                  title="Remove from tournament"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-300 hover:bg-red-950/60 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-pitch-border/60">
          <select
            value={addTeamId}
            onChange={(e) => setAddTeamId(e.target.value)}
            className={inputClass}
          >
            <option value="">Add an existing team…</option>
            {addableTeams.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.players?.length || 0} players)
              </option>
            ))}
          </select>
          <GroupSelect value={addGroup} onChange={setAddGroup} />
          <button
            onClick={() =>
              addTeamId &&
              act({ action: 'addTeam', teamId: addTeamId, groupName: addGroup || null }, 'Team added').then(() => {
                setAddTeamId('');
              })
            }
            disabled={!addTeamId || busy}
            className="px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-40 shrink-0 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
        {addableTeams.length === 0 && (
          <p className="text-[11px] text-gray-500">
            Every registered team is already in this tournament — use “New team” to create another.
          </p>
        )}
      </section>

      {/* Fixtures */}
      <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white">Fixture schedule</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-xs ${schedulePreview.ok ? 'text-gray-300' : 'text-amber-400'}`}>
            {schedulePreview.text}
          </p>
          <button
            onClick={() => act({ action: 'generateFixtures' })}
            disabled={busy || !schedulePreview.ok}
            className="px-4 py-2.5 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white disabled:opacity-40"
          >
            Generate league fixtures
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          Regenerating replaces fixtures that have not started. Matches already in progress or
          finished must be deleted individually first.
        </p>
      </section>

      {/* Settings */}
      <form onSubmit={saveSettings} className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-gray-400" /> Tournament settings
        </h2>

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Venue">
            <input value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Default overs" hint="Applies to fixtures that have not started.">
            <input
              type="number"
              min={1}
              max={50}
              value={defaultOvers}
              onChange={(e) => setDefaultOvers(Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={inputClass}
          />
        </Field>

        <Field label="Rules">
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={3}
            placeholder="Local rules — last man standing, one bounce, boundary sizes…"
            className={inputClass}
          />
        </Field>

        <Field label="Contact">
          <input
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="Organiser phone or email"
            className={inputClass}
          />
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-xs font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      {/* Danger zone */}
      <section className="bg-red-950/20 border border-red-900/60 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-bold text-red-300">Danger zone</h2>
        <p className="text-xs text-gray-400">
          Deleting the tournament removes every fixture and scorecard belonging to it. Teams and
          players are kept.
        </p>
        <button
          onClick={onDeleteTournament}
          className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white flex items-center gap-1.5"
        >
          <Trash2 className="w-4 h-4" /> Delete tournament
        </button>
      </section>
    </div>
  );
}
