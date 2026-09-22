'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, User, Award, Target, Hand } from 'lucide-react';
import { EmptyState, Spinner, apiCall, useToast } from '@/components/ui';
import { oversDisplay } from '@/lib/matchRules';

const ROLE_LABEL: Record<string, string> = {
  BATSMAN: 'Batter',
  BOWLER: 'Bowler',
  ALL_ROUNDER: 'All-rounder',
  WICKETKEEPER: 'Wicketkeeper',
};

function StatGrid({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {items.map((s) => (
        <div key={s.label} className="p-3 bg-pitch-dark border border-pitch-border rounded-xl text-center">
          <div className="text-base font-black text-white">{s.value}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export default function PlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const playerId = params.id as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setData(await apiCall(`/api/players/${playerId}`));
      } catch (e: any) {
        if (e.message?.includes('not found')) setNotFound(true);
        else toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  if (loading) return <Spinner label="Loading player…" />;

  if (notFound || !data) {
    return (
      <div className="max-w-xl mx-auto my-12 px-4">
        <EmptyState
          icon={<User className="w-10 h-10" />}
          title="Player not found"
          message="This player may have been deleted."
          action={
            <Link href="/players" className="px-4 py-2.5 rounded-xl bg-purple-600 text-xs font-bold text-white">
              Back to players
            </Link>
          }
        />
      </div>
    );
  }

  const { player, stats } = data;
  const teamNames = player.teams.map((tp: any) => tp.team.name);

  const battedIn = player.battingScores
    .filter((b: any) => b.balls > 0 || b.runs > 0 || b.isOut)
    .sort((a: any, b: any) => new Date(b.match.date).getTime() - new Date(a.match.date).getTime());
  const bowledIn = player.bowlingFigures
    .filter((b: any) => b.legalBalls > 0)
    .sort((a: any, b: any) => new Date(b.match.date).getTime() - new Date(a.match.date).getTime());

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <button
        onClick={() => router.push('/players')}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
      >
        <ArrowLeft className="w-4 h-4" /> All players
      </button>

      <div className="bg-gradient-to-r from-pitch-card via-pitch-dark to-pitch-card border border-pitch-border rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-pitch-dark border border-purple-900 flex items-center justify-center text-purple-400 font-black shrink-0">
            {player.jerseyNumber ? `#${player.jerseyNumber}` : player.fullName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white truncate">{player.fullName}</h1>
            <p className="text-xs text-cricket-400 font-semibold uppercase mt-0.5">
              {ROLE_LABEL[player.role] || player.role}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {player.battingStyle} • {player.bowlingStyle}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {teamNames.length ? teamNames.join(', ') : 'Free agent'}
            </p>
          </div>
        </div>

        {stats.potm > 0 && (
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-950 border border-amber-800 text-xs font-bold text-amber-300">
            <Award className="w-3.5 h-3.5" />
            {stats.potm} player-of-the-match award{stats.potm === 1 ? '' : 's'}
          </div>
        )}
      </div>

      {/* Batting */}
      <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-cricket-400" /> Batting career
        </h2>
        <StatGrid
          items={[
            { label: 'Matches', value: stats.batting.matches },
            { label: 'Innings', value: stats.batting.innings },
            { label: 'Runs', value: stats.batting.runs },
            { label: 'Balls', value: stats.batting.balls },
            { label: 'Highest', value: stats.batting.highestScore },
            { label: 'Average', value: stats.batting.notOuts === stats.batting.innings ? '—' : stats.batting.average.toFixed(2) },
            { label: 'Strike rate', value: stats.batting.strikeRate.toFixed(2) },
            { label: 'Not outs', value: stats.batting.notOuts },
            { label: 'Fours', value: stats.batting.fours },
            { label: 'Sixes', value: stats.batting.sixes },
            { label: 'Fifties', value: stats.batting.fifties },
            { label: 'Hundreds', value: stats.batting.hundreds },
          ]}
        />

        {battedIn.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] min-w-[420px]">
              <thead>
                <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                  <th className="pb-2">Match</th>
                  <th className="pb-2 text-right">R</th>
                  <th className="pb-2 text-right">B</th>
                  <th className="pb-2 text-right">4s</th>
                  <th className="pb-2 text-right">6s</th>
                  <th className="pb-2 text-right">SR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border/40">
                {battedIn.map((b: any) => (
                  <tr key={b.id}>
                    <td className="py-2">
                      <Link href={`/match/${b.matchId}`} className="text-gray-200 hover:text-cricket-400">
                        {b.match.homeTeam.shortName} v {b.match.awayTeam.shortName}
                      </Link>
                    </td>
                    <td className="py-2 text-right font-bold text-cricket-400">
                      {b.runs}
                      {!b.isOut && '*'}
                    </td>
                    <td className="py-2 text-right text-gray-300">{b.balls}</td>
                    <td className="py-2 text-right text-blue-300">{b.fours}</td>
                    <td className="py-2 text-right text-purple-300">{b.sixes}</td>
                    <td className="py-2 text-right text-gray-400">
                      {b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Bowling */}
      <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Target className="w-4 h-4 text-red-400" /> Bowling career
        </h2>
        <StatGrid
          items={[
            { label: 'Innings', value: stats.bowling.matches },
            { label: 'Overs', value: stats.bowling.overs },
            { label: 'Runs', value: stats.bowling.runs },
            { label: 'Wickets', value: stats.bowling.wickets },
            { label: 'Best', value: stats.bowling.bestBowling },
            { label: 'Economy', value: stats.bowling.economy.toFixed(2) },
            { label: 'Average', value: stats.bowling.wickets > 0 ? stats.bowling.average.toFixed(2) : '—' },
            { label: 'Wides', value: stats.bowling.wides },
          ]}
        />

        {bowledIn.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] min-w-[380px]">
              <thead>
                <tr className="border-b border-pitch-border text-gray-400 uppercase font-semibold">
                  <th className="pb-2">Match</th>
                  <th className="pb-2 text-right">O</th>
                  <th className="pb-2 text-right">R</th>
                  <th className="pb-2 text-right">W</th>
                  <th className="pb-2 text-right">Econ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pitch-border/40">
                {bowledIn.map((b: any) => (
                  <tr key={b.id}>
                    <td className="py-2">
                      <Link href={`/match/${b.matchId}`} className="text-gray-200 hover:text-cricket-400">
                        {b.match.homeTeam.shortName} v {b.match.awayTeam.shortName}
                      </Link>
                    </td>
                    <td className="py-2 text-right text-gray-300">{oversDisplay(b.legalBalls)}</td>
                    <td className="py-2 text-right text-gray-300">{b.runs}</td>
                    <td className="py-2 text-right font-bold text-red-400">{b.wickets}</td>
                    <td className="py-2 text-right text-gray-400">
                      {b.legalBalls > 0 ? (b.runs / (b.legalBalls / 6)).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Fielding */}
      <section className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Hand className="w-4 h-4 text-blue-400" /> Fielding
        </h2>
        <StatGrid
          items={[
            { label: 'Catches', value: stats.fielding.catches },
            { label: 'Run outs', value: stats.fielding.runOuts },
            { label: 'Stumpings', value: stats.fielding.stumpings },
          ]}
        />
      </section>

      {stats.batting.innings === 0 && stats.bowling.matches === 0 && (
        <EmptyState
          title="No match data yet"
          message={`${player.fullName} has not played a scored match. Statistics appear here after their first innings.`}
        />
      )}
    </div>
  );
}
