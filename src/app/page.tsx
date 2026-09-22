import Link from 'next/link';
import { prisma } from '@/lib/db';
import { Trophy, Dices, Radio, Users, Shield, ArrowRight, ListOrdered, BarChart3, CalendarDays } from 'lucide-react';
import MatchCard from '@/components/MatchCard';
import { EmptyState, StatusBadge } from '@/components/ui';

export const revalidate = 0; // Always render fresh live scores.

export default async function HomeDashboard() {
  const [tournaments, matches, teamCount, playerCount] = await Promise.all([
    prisma.tournament.findMany({
      take: 4,
      orderBy: { createdAt: 'desc' },
      include: { teams: true, matches: { select: { status: true } } },
    }),
    prisma.match.findMany({
      include: { homeTeam: true, awayTeam: true, tournament: true, innings: true },
      orderBy: { date: 'asc' },
    }),
    prisma.team.count(),
    prisma.player.count(),
  ]);

  const liveMatches = matches.filter((m) => m.status === 'LIVE' || m.status === 'INNINGS_BREAK');
  const upcomingMatches = matches
    .filter((m) => m.status === 'SCHEDULED' || m.status === 'TOSS')
    .slice(0, 4);
  const recentMatches = matches
    .filter((m) => m.status === 'COMPLETED' || m.status === 'ABANDONED')
    .slice(-4)
    .reverse();

  const nothingYet = matches.length === 0 && tournaments.length === 0 && teamCount === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-pitch-card via-cricket-950 to-pitch-card border border-pitch-border p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 max-w-2xl">
          <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-cricket-900/80 border border-cricket-700 text-cricket-300 uppercase tracking-wider">
            Tape-Ball Cricket Platform
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-white mt-3 tracking-tight">
            Run your tournament. Score every ball.
          </h1>
          <p className="text-sm text-gray-300 mt-2 leading-relaxed">
            Ball-by-ball scoring built for a phone at the ground, with automatic points tables,
            Net Run Rate, knockout brackets and player statistics.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/tournaments/create"
              className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-cricket-600 hover:bg-cricket-500 text-white font-bold text-sm transition shadow-lg shadow-cricket-900/50 touch-btn"
            >
              <Trophy className="w-5 h-5" />
              <span>Create tournament</span>
            </Link>
            <Link
              href="/match/create"
              className="flex items-center space-x-2 px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm transition shadow-lg shadow-amber-900/50 touch-btn"
            >
              <Dices className="w-5 h-5" />
              <span>Quick single match</span>
            </Link>
          </div>
        </div>
      </section>

      {nothingYet && (
        <EmptyState
          icon={<Trophy className="w-10 h-10" />}
          title="Nothing set up yet"
          message="Start with a quick single match — it creates the teams and players for you as you type them in. Or set up a full tournament with fixtures and a points table."
          action={
            <div className="flex flex-wrap gap-2 justify-center">
              <Link
                href="/match/create"
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white"
              >
                Create a single match
              </Link>
              <Link
                href="/teams"
                className="px-4 py-2.5 rounded-xl bg-pitch-dark border border-pitch-border text-xs font-bold text-gray-200"
              >
                Add teams first
              </Link>
            </div>
          }
        />
      )}

      {/* Live now */}
      {liveMatches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center space-x-2">
            <Radio className="w-5 h-5 text-red-500 live-pulse" />
            <h2 className="text-lg sm:text-xl font-bold text-white">Live now</h2>
            <span className="text-xs text-gray-400">({liveMatches.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveMatches.map((m) => (
              <MatchCard key={m.id} match={m as any} />
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* Tournaments */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-cricket-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white">Tournaments</h2>
              </div>
              <Link href="/tournaments" className="text-xs text-cricket-400 hover:underline font-semibold">
                View all →
              </Link>
            </div>

            {tournaments.length === 0 ? (
              <EmptyState
                title="No tournaments yet"
                message="A tournament generates its fixtures, points table and knockout bracket automatically once you pick the teams."
                action={
                  <Link
                    href="/tournaments/create"
                    className="px-4 py-2.5 rounded-xl bg-cricket-600 text-xs font-bold text-white"
                  >
                    Create your first tournament
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {tournaments.map((t) => {
                  const done = t.matches.filter(
                    (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED'
                  ).length;
                  const pct = t.matches.length ? Math.round((done / t.matches.length) * 100) : 0;
                  return (
                    <Link
                      key={t.id}
                      href={`/tournaments/${t.slug}`}
                      className="p-4 sm:p-5 rounded-2xl bg-pitch-card hover:bg-pitch-dark border border-pitch-border transition block group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-bold text-white group-hover:text-cricket-400 transition truncate">
                            {t.name}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {t.venue} • {t.teams.length} teams • {t.defaultOvers} overs
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-white transition shrink-0" />
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1.5">
                          <span>
                            {done} of {t.matches.length} matches played
                          </span>
                          <span className="font-semibold text-cricket-400">{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-pitch-dark overflow-hidden">
                          <div
                            className="h-full bg-cricket-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Upcoming */}
          {upcomingMatches.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CalendarDays className="w-5 h-5 text-amber-400" />
                  <h2 className="text-lg sm:text-xl font-bold text-white">Upcoming matches</h2>
                </div>
                <Link href="/matches" className="text-xs text-cricket-400 hover:underline font-semibold">
                  View all →
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingMatches.map((m) => (
                  <MatchCard key={m.id} match={m as any} />
                ))}
              </div>
            </section>
          )}

          {/* Results */}
          {recentMatches.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-cricket-400" />
                <h2 className="text-lg sm:text-xl font-bold text-white">Recent results</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentMatches.map((m) => (
                  <MatchCard key={m.id} match={m as any} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white border-b border-pitch-border pb-3">
              Browse
            </h3>

            {[
              { href: '/matches', icon: ListOrdered, color: 'text-amber-400', label: 'All matches', value: matches.length },
              { href: '/teams', icon: Shield, color: 'text-blue-400', label: 'Teams', value: teamCount },
              { href: '/players', icon: Users, color: 'text-purple-400', label: 'Players', value: playerCount },
              { href: '/stats', icon: BarChart3, color: 'text-emerald-400', label: 'Statistics', value: null },
              { href: '/admin', icon: Trophy, color: 'text-cricket-400', label: 'Admin panel', value: null },
            ].map(({ href, icon: Icon, color, label, value }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between p-3 rounded-xl bg-pitch-dark hover:bg-pitch-border/50 border border-pitch-border transition"
              >
                <span className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-sm font-semibold text-gray-200">{label}</span>
                </span>
                {value !== null ? (
                  <span className="text-sm font-bold text-cricket-400">{value}</span>
                ) : (
                  <ArrowRight className="w-4 h-4 text-gray-500" />
                )}
              </Link>
            ))}
          </div>

          <div className="bg-pitch-card border border-pitch-border rounded-2xl p-5 text-xs text-gray-400 space-y-2">
            <h3 className="text-sm font-bold text-white">Tape-ball rules in use</h3>
            <p>• Squads of 5 or fewer play last-man-standing — every batter must be out.</p>
            <p>• Larger squads are all out one wicket short, as in the full game.</p>
            <p>• Wides and no-balls cost a run and are re-bowled; byes are not charged to the bowler.</p>
            <p>• A win is 2 points, a tie or abandoned match 1 point, and ties are split on Net Run Rate.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
