import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildLeaderboards } from '@/lib/tournamentStats';

/** Platform-wide (or per-tournament) leaderboards and headline counts. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tournamentId = searchParams.get('tournamentId') || undefined;

    const { topBatsmen, topBowlers } = await buildLeaderboards(tournamentId);

    const [tournaments, teams, players, matches, completed, live] = await Promise.all([
      prisma.tournament.count(),
      prisma.team.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.match.count({ where: { status: 'COMPLETED' } }),
      prisma.match.count({ where: { status: { in: ['LIVE', 'INNINGS_BREAK'] } } }),
    ]);

    // Best individual performances in a single innings.
    const bestKnocks = await prisma.battingScore.findMany({
      where: { match: tournamentId ? { tournamentId } : {}, runs: { gt: 0 } },
      include: { player: true, match: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: [{ runs: 'desc' }],
      take: 10,
    });

    const bestSpells = await prisma.bowlingFigure.findMany({
      where: { match: tournamentId ? { tournamentId } : {}, wickets: { gt: 0 } },
      include: { player: true, match: { include: { homeTeam: true, awayTeam: true } } },
      orderBy: [{ wickets: 'desc' }, { runs: 'asc' }],
      take: 10,
    });

    return NextResponse.json({
      success: true,
      totals: { tournaments, teams, players, matches, completed, live },
      topBatsmen,
      topBowlers,
      bestKnocks,
      bestSpells,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
