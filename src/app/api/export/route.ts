import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildLeaderboards } from '@/lib/tournamentStats';
import { NRRCalculator } from '@/lib/NRRCalculator';
import { oversDisplay, dismissalText } from '@/lib/matchRules';

/** Wraps a CSV cell, escaping embedded quotes. */
function cell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function csvResponse(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map(cell).join(',')).join('\n');
  // BOM so Excel opens UTF-8 names correctly.
  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const tournamentId = searchParams.get('tournamentId');
    const matchId = searchParams.get('matchId');
    const stamp = new Date().toISOString().slice(0, 10);

    if (type === 'points') {
      const standings = await prisma.pointsEntry.findMany({
        where: tournamentId ? { tournamentId } : undefined,
        include: { team: true, tournament: true },
        orderBy: [{ tournamentId: 'asc' }, { groupName: 'asc' }, { points: 'desc' }, { nrr: 'desc' }],
      });

      const rows = [
        ['Tournament', 'Group', 'Pos', 'Team', 'Played', 'Won', 'Lost', 'Tied', 'No Result', 'Points', 'NRR'],
        ...standings.map((s) => [
          s.tournament.name,
          s.groupName || '',
          String(s.rank || ''),
          s.team.name,
          String(s.played),
          String(s.won),
          String(s.lost),
          String(s.tied),
          String(s.noResult),
          String(s.points),
          NRRCalculator.formatNRR(s.nrr),
        ]),
      ];
      return csvResponse(rows, `points-table-${stamp}.csv`);
    }

    if (type === 'players') {
      const { topBatsmen, topBowlers } = await buildLeaderboards(tournamentId || undefined);
      const bowlingByPlayer = new Map(topBowlers.map((b) => [b.playerId, b]));
      const seen = new Set<string>();

      const rows: string[][] = [
        [
          'Player', 'Team', 'Innings', 'Runs', 'Balls', '4s', '6s', 'Highest', 'Not Outs',
          'Bat Avg', 'Strike Rate', '50s', '100s',
          'Overs', 'Runs Conceded', 'Wickets', 'Best', 'Economy', 'Bowl Avg',
        ],
      ];

      for (const b of topBatsmen) {
        const bowl = bowlingByPlayer.get(b.playerId);
        seen.add(b.playerId);
        rows.push([
          b.name, b.teamName, String(b.innings), String(b.runs), String(b.balls),
          String(b.fours), String(b.sixes), String(b.highest), String(b.notOuts),
          b.average === null ? '—' : b.average.toFixed(2), b.strikeRate.toFixed(2),
          String(b.fifties), String(b.hundreds),
          bowl ? oversDisplay(bowl.legalBalls) : '0.0',
          bowl ? String(bowl.runs) : '0',
          bowl ? String(bowl.wickets) : '0',
          bowl ? bowl.best : '—',
          bowl ? bowl.economy.toFixed(2) : '0.00',
          bowl?.average == null ? '—' : bowl.average.toFixed(2),
        ]);
      }

      // Bowlers who never batted still belong in the export.
      for (const bowl of topBowlers) {
        if (seen.has(bowl.playerId)) continue;
        rows.push([
          bowl.name, bowl.teamName, '0', '0', '0', '0', '0', '0', '0', '—', '0.00', '0', '0',
          oversDisplay(bowl.legalBalls), String(bowl.runs), String(bowl.wickets), bowl.best,
          bowl.economy.toFixed(2), bowl.average == null ? '—' : bowl.average.toFixed(2),
        ]);
      }

      return csvResponse(rows, `player-statistics-${stamp}.csv`);
    }

    if (type === 'matches') {
      const matches = await prisma.match.findMany({
        where: tournamentId ? { tournamentId } : undefined,
        include: { homeTeam: true, awayTeam: true, tournament: true, potm: true, innings: true },
        orderBy: { date: 'asc' },
      });

      const rows = [
        ['Date', 'Tournament', 'Stage', 'Home', 'Away', 'Venue', 'Overs', 'Status',
         '1st Innings', '2nd Innings', 'Result', 'Player of the Match'],
        ...matches.map((m) => {
          const i1 = m.innings.find((i) => i.inningsNo === 1);
          const i2 = m.innings.find((i) => i.inningsNo === 2);
          const score = (i: typeof i1) =>
            i ? `${i.totalRuns}/${i.totalWickets} (${oversDisplay(i.legalBalls)})` : '—';
          return [
            m.date.toISOString().slice(0, 10),
            m.tournament?.name || 'Single Match',
            m.stage || '—',
            m.homeTeam.name,
            m.awayTeam.name,
            m.venue,
            String(m.overs),
            m.status,
            score(i1),
            score(i2),
            m.resultSummary || '—',
            m.potm?.fullName || '—',
          ];
        }),
      ];
      return csvResponse(rows, `matches-${stamp}.csv`);
    }

    if (type === 'scorecard') {
      if (!matchId) {
        return NextResponse.json({ success: false, error: 'matchId is required' }, { status: 400 });
      }
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          homeTeam: true,
          awayTeam: true,
          squadPlayers: true,
          innings: { orderBy: { inningsNo: 'asc' } },
          battingScores: { include: { player: true }, orderBy: { battingPos: 'asc' } },
          bowlingFigures: { include: { player: true } },
        },
      });
      if (!match) {
        return NextResponse.json({ success: false, error: 'Match not found' }, { status: 404 });
      }

      const teamOf = (playerId: string) =>
        match.squadPlayers.find((sp) => sp.playerId === playerId)?.teamId;

      const rows: string[][] = [
        [`${match.homeTeam.name} vs ${match.awayTeam.name}`],
        [match.venue, match.date.toISOString().slice(0, 10), `${match.overs} overs`, match.status],
        [match.resultSummary || ''],
        [],
      ];

      for (const inn of match.innings) {
        const battingTeam =
          inn.battingTeamId === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name;
        rows.push([
          `Innings ${inn.inningsNo} — ${battingTeam}`,
          `${inn.totalRuns}/${inn.totalWickets}`,
          `${oversDisplay(inn.legalBalls)} ov`,
        ]);
        rows.push(['Batter', 'Dismissal', 'R', 'B', '4s', '6s', 'SR']);
        match.battingScores
          .filter((b) => teamOf(b.playerId) === inn.battingTeamId)
          .forEach((b) => {
            rows.push([
              b.player.fullName,
              b.isOut ? b.wicketInfo || 'out' : b.isRetired ? 'retired hurt' : 'not out',
              String(b.runs), String(b.balls), String(b.fours), String(b.sixes),
              b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(2) : '0.00',
            ]);
          });

        rows.push([]);
        rows.push(['Bowler', 'O', 'R', 'W', 'Econ', 'WD', 'NB']);
        match.bowlingFigures
          .filter((bw) => teamOf(bw.playerId) === inn.bowlingTeamId)
          .forEach((bw) => {
            rows.push([
              bw.player.fullName,
              oversDisplay(bw.legalBalls),
              String(bw.runs),
              String(bw.wickets),
              bw.legalBalls > 0 ? (bw.runs / (bw.legalBalls / 6)).toFixed(2) : '0.00',
              String(bw.wides), String(bw.noBalls),
            ]);
          });
        rows.push([]);
      }

      return csvResponse(rows, `scorecard-${matchId.slice(0, 8)}-${stamp}.csv`);
    }

    return NextResponse.json(
      { success: false, error: 'Export type must be one of: points, players, matches, scorecard' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
