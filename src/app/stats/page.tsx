'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Award, Download, Zap } from 'lucide-react';
import { EmptyState, Spinner, apiCall, inputClass, useToast } from '@/components/ui';
import { oversDisplay } from '@/lib/matchRules';

export default function StatsPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [scope, setScope] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const q = scope ? `?tournamentId=${scope}` : '';
      const [s, t] = await Promise.all([apiCall(`/api/stats${q}`), apiCall('/api/tournaments')]);
      setData(s);
      setTournaments(t.tournaments);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label="Loading statistics…" />;
  if (!data) return null;

  const hasData = data.topBatsmen.length > 0 || data.topBowlers.length > 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-pitch-border pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-400" />
            Statistics
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Career records across every match, or filtered to one tournament.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="Filter by tournament"
            className={`${inputClass} sm:w-56`}
          >
            <option value="">All matches</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <a
            href={`/api/export?type=players${scope ? `&tournamentId=${scope}` : ''}`}
            className="px-3 py-2.5 rounded-xl bg-pitch-card border border-pitch-border text-xs font-bold text-gray-200 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </a>
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={<BarChart3 className="w-10 h-10" />}
          title="No statistics yet"
          message="Statistics build up automatically as matches are scored. Play a match and the leaderboards fill in."
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
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Batting */}
            <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> Most runs
              </h2>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-left text-[11px] min-w-[420px]">
                  <thead>
                    <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                      <th className="pb-2">Player</th>
                      <th className="pb-2 text-right">Inn</th>
                      <th className="pb-2 text-right">Runs</th>
                      <th className="pb-2 text-right">HS</th>
                      <th className="pb-2 text-right">Avg</th>
                      <th className="pb-2 text-right">SR</th>
                      <th className="pb-2 text-right">4s/6s</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-border/40">
                    {data.topBatsmen.slice(0, 20).map((b: any, i: number) => (
                      <tr key={b.playerId} className="hover:bg-pitch-dark/40">
                        <td className="py-2 pr-2">
                          <Link
                            href={`/players/${b.playerId}`}
                            className="font-semibold text-white hover:text-cricket-400"
                          >
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
                        <td className="py-2 text-right text-gray-400">
                          {b.fours}/{b.sixes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Bowling */}
            <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-400" /> Most wickets
              </h2>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-left text-[11px] min-w-[400px]">
                  <thead>
                    <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                      <th className="pb-2">Player</th>
                      <th className="pb-2 text-right">O</th>
                      <th className="pb-2 text-right">R</th>
                      <th className="pb-2 text-right">W</th>
                      <th className="pb-2 text-right">Best</th>
                      <th className="pb-2 text-right">Econ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pitch-border/40">
                    {data.topBowlers.slice(0, 20).map((b: any, i: number) => (
                      <tr key={b.playerId} className="hover:bg-pitch-dark/40">
                        <td className="py-2 pr-2">
                          <Link
                            href={`/players/${b.playerId}`}
                            className="font-semibold text-white hover:text-cricket-400"
                          >
                            {i + 1}. {b.name}
                          </Link>
                          <div className="text-[10px] text-gray-500">{b.teamName}</div>
                        </td>
                        <td className="py-2 text-right text-gray-300">{oversDisplay(b.legalBalls)}</td>
                        <td className="py-2 text-right text-gray-300">{b.runs}</td>
                        <td className="py-2 text-right font-black text-red-400">{b.wickets}</td>
                        <td className="py-2 text-right text-gray-300">{b.best}</td>
                        <td className="py-2 text-right text-gray-400">{b.economy.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Single-innings records */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" /> Best individual innings
              </h2>
              {data.bestKnocks.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nothing recorded yet.</p>
              ) : (
                <div className="divide-y divide-pitch-border/40 text-xs">
                  {data.bestKnocks.map((b: any, i: number) => (
                    <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/players/${b.playerId}`}
                          className="font-bold text-white hover:text-cricket-400"
                        >
                          {i + 1}. {b.player.fullName}
                        </Link>
                        <Link
                          href={`/match/${b.matchId}`}
                          className="block text-[10px] text-gray-500 hover:text-gray-300 truncate"
                        >
                          {b.match.homeTeam.shortName} v {b.match.awayTeam.shortName}
                        </Link>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-cricket-400">
                          {b.runs}
                          {!b.isOut && '*'}
                        </span>
                        <span className="block text-[10px] text-gray-400">({b.balls} balls)</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-red-400" /> Best bowling figures
              </h2>
              {data.bestSpells.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nothing recorded yet.</p>
              ) : (
                <div className="divide-y divide-pitch-border/40 text-xs">
                  {data.bestSpells.map((b: any, i: number) => (
                    <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/players/${b.playerId}`}
                          className="font-bold text-white hover:text-cricket-400"
                        >
                          {i + 1}. {b.player.fullName}
                        </Link>
                        <Link
                          href={`/match/${b.matchId}`}
                          className="block text-[10px] text-gray-500 hover:text-gray-300 truncate"
                        >
                          {b.match.homeTeam.shortName} v {b.match.awayTeam.shortName}
                        </Link>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-red-400">
                          {b.wickets}/{b.runs}
                        </span>
                        <span className="block text-[10px] text-gray-400">
                          ({oversDisplay(b.legalBalls)} ov)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
