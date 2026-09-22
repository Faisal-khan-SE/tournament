import { prisma } from './db';
import { NRRCalculator } from './NRRCalculator';
import {
  POINTS_NO_RESULT,
  POINTS_TIE,
  POINTS_WIN,
  isAllOut,
  squadSizeFor,
} from './matchRules';

/**
 * Rebuilds the whole points table for a tournament from scratch.
 *
 * Always a full rebuild rather than an incremental update, so deleting a match,
 * undoing a ball or abandoning a game can all call this and land on a correct
 * table instead of drifting.
 */
export async function recalculateTournamentTable(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return;

  const defaultOvers = tournament.defaultOvers || 6;

  const teams = await prisma.tournamentTeam.findMany({
    where: { tournamentId },
    select: { teamId: true, groupName: true },
  });

  // Only league games decide the table; knockouts sit outside it.
  const leagueMatches = await prisma.match.findMany({
    where: {
      tournamentId,
      stage: 'LEAGUE',
      status: { in: ['COMPLETED', 'ABANDONED'] },
    },
    include: { innings: true, squadPlayers: true },
  });

  for (const { teamId, groupName } of teams) {
    let played = 0;
    let won = 0;
    let lost = 0;
    let tied = 0;
    let noResult = 0;
    let runsFor = 0;
    let ballsFor = 0;
    let runsAgainst = 0;
    let ballsAgainst = 0;

    const nrrMatches = [];

    for (const m of leagueMatches) {
      if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue;
      played++;

      // Abandoned / no-result games award a point each and are excluded from NRR.
      if (m.status === 'ABANDONED' || m.resultType === 'NO_RESULT' || m.resultType === 'ABANDONED') {
        noResult++;
        continue;
      }

      if (m.winnerId === teamId) won++;
      else if (m.winnerId === null) tied++;
      else lost++;

      const myInnings = m.innings.find((i) => i.battingTeamId === teamId);
      const oppInnings = m.innings.find((i) => i.bowlingTeamId === teamId);
      const matchOvers = m.overs || defaultOvers;

      const oppTeamId = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
      const myAllOut = myInnings
        ? isAllOut(myInnings.totalWickets, squadSizeFor(m.squadPlayers, teamId))
        : false;
      const oppAllOut = oppInnings
        ? isAllOut(oppInnings.totalWickets, squadSizeFor(m.squadPlayers, oppTeamId))
        : false;

      const mRunsFor = myInnings?.totalRuns || 0;
      const mBallsFor = myInnings?.legalBalls || 0;
      const mRunsAgainst = oppInnings?.totalRuns || 0;
      const mBallsAgainst = oppInnings?.legalBalls || 0;

      runsFor += mRunsFor;
      ballsFor += mBallsFor;
      runsAgainst += mRunsAgainst;
      ballsAgainst += mBallsAgainst;

      nrrMatches.push({
        runsScored: mRunsFor,
        legalBallsFaced: mBallsFor,
        allOut: myAllOut,
        allocatedOvers: matchOvers,
        runsConceded: mRunsAgainst,
        legalBallsBowled: mBallsAgainst,
        opponentAllOut: oppAllOut,
      });
    }

    const points = won * POINTS_WIN + tied * POINTS_TIE + noResult * POINTS_NO_RESULT;
    const nrr = NRRCalculator.calculateNRRFromMatches(nrrMatches);

    const payload = {
      played,
      won,
      lost,
      tied,
      noResult,
      points,
      runsFor,
      ballsFor,
      runsAgainst,
      ballsAgainst,
      nrr,
      groupName,
    };

    await prisma.pointsEntry.upsert({
      where: { tournamentId_teamId: { tournamentId, teamId } },
      update: payload,
      create: { tournamentId, teamId, ...payload },
    });
  }

  // Drop stale rows for teams that have since left the tournament.
  await prisma.pointsEntry.deleteMany({
    where: { tournamentId, teamId: { notIn: teams.map((t) => t.teamId) } },
  });

  const sorted = await prisma.pointsEntry.findMany({
    where: { tournamentId },
    include: { team: true },
    orderBy: [{ groupName: 'asc' }, { points: 'desc' }, { nrr: 'desc' }, { won: 'desc' }],
  });

  // Rank restarts at 1 inside each group, so "A1", "B2" read off the table.
  const position = new Map<string | null, number>();
  for (const row of sorted) {
    const next = (position.get(row.groupName) || 0) + 1;
    position.set(row.groupName, next);
    await prisma.pointsEntry.update({ where: { id: row.id }, data: { rank: next } });
  }

  return sorted;
}

export interface AggregatedBatting {
  playerId: string;
  name: string;
  teamName: string;
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  notOuts: number;
  highest: number;
  average: number | null;
  strikeRate: number;
  fifties: number;
  hundreds: number;
}

export interface AggregatedBowling {
  playerId: string;
  name: string;
  teamName: string;
  matches: number;
  legalBalls: number;
  runs: number;
  wickets: number;
  best: string;
  economy: number;
  average: number | null;
}

/**
 * Tournament-wide leaderboards, aggregated per player across every match.
 * `tournamentId` omitted aggregates across the whole platform (career stats).
 */
export async function buildLeaderboards(tournamentId?: string) {
  const matchFilter = tournamentId ? { tournamentId } : {};

  const battingRows = await prisma.battingScore.findMany({
    where: { match: matchFilter },
    include: {
      player: true,
      match: { include: { squadPlayers: true, homeTeam: true, awayTeam: true } },
    },
  });

  const bowlingRows = await prisma.bowlingFigure.findMany({
    where: { match: matchFilter },
    include: {
      player: true,
      match: { include: { squadPlayers: true, homeTeam: true, awayTeam: true } },
    },
  });

  const teamNameFor = (row: any): string => {
    const sp = row.match.squadPlayers.find((s: any) => s.playerId === row.playerId);
    if (!sp) return '—';
    if (sp.teamId === row.match.homeTeamId) return row.match.homeTeam.name;
    if (sp.teamId === row.match.awayTeamId) return row.match.awayTeam.name;
    return '—';
  };

  const batting = new Map<string, AggregatedBatting>();
  for (const row of battingRows) {
    // A player listed in a squad who never faced a ball isn't an innings.
    if (row.balls === 0 && row.runs === 0 && !row.isOut) continue;
    const entry =
      batting.get(row.playerId) ||
      ({
        playerId: row.playerId,
        name: row.player.fullName,
        teamName: teamNameFor(row),
        innings: 0,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        notOuts: 0,
        highest: 0,
        average: null,
        strikeRate: 0,
        fifties: 0,
        hundreds: 0,
      } as AggregatedBatting);

    entry.innings += 1;
    entry.runs += row.runs;
    entry.balls += row.balls;
    entry.fours += row.fours;
    entry.sixes += row.sixes;
    if (!row.isOut) entry.notOuts += 1;
    if (row.runs > entry.highest) entry.highest = row.runs;
    if (row.runs >= 100) entry.hundreds += 1;
    else if (row.runs >= 50) entry.fifties += 1;
    batting.set(row.playerId, entry);
  }

  for (const entry of Array.from(batting.values())) {
    const outs = entry.innings - entry.notOuts;
    entry.average = outs > 0 ? Math.round((entry.runs / outs) * 100) / 100 : null;
    entry.strikeRate = entry.balls > 0 ? Math.round((entry.runs / entry.balls) * 10000) / 100 : 0;
  }

  const bowling = new Map<string, AggregatedBowling & { bestW: number; bestR: number }>();
  for (const row of bowlingRows) {
    if (row.legalBalls === 0 && row.runs === 0) continue;
    const entry =
      bowling.get(row.playerId) ||
      ({
        playerId: row.playerId,
        name: row.player.fullName,
        teamName: teamNameFor(row),
        matches: 0,
        legalBalls: 0,
        runs: 0,
        wickets: 0,
        best: '—',
        economy: 0,
        average: null,
        bestW: -1,
        bestR: 0,
      } as AggregatedBowling & { bestW: number; bestR: number });

    entry.matches += 1;
    entry.legalBalls += row.legalBalls;
    entry.runs += row.runs;
    entry.wickets += row.wickets;
    if (row.wickets > entry.bestW || (row.wickets === entry.bestW && row.runs < entry.bestR)) {
      entry.bestW = row.wickets;
      entry.bestR = row.runs;
    }
    bowling.set(row.playerId, entry);
  }

  for (const entry of Array.from(bowling.values())) {
    const oversDec = entry.legalBalls / 6;
    entry.economy = oversDec > 0 ? Math.round((entry.runs / oversDec) * 100) / 100 : 0;
    entry.average = entry.wickets > 0 ? Math.round((entry.runs / entry.wickets) * 100) / 100 : null;
    entry.best = entry.bestW >= 0 ? `${entry.bestW}/${entry.bestR}` : '—';
  }

  const topBatsmen = Array.from(batting.values()).sort(
    (a, b) => b.runs - a.runs || b.strikeRate - a.strikeRate
  );
  const topBowlers = Array.from(bowling.values())
    .map(({ bestW, bestR, ...rest }) => rest)
    .sort((a, b) => b.wickets - a.wickets || a.economy - b.economy);

  return { topBatsmen, topBowlers };
}
