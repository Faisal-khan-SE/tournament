import { prisma } from './db';
import { CentralMatchEngine } from './matchEngine';
import {
  KNOCKOUT_FEEDS,
  countsAsTeamWicket,
  creditsBowler,
  dismissalText,
  isAllOut,
  maxWicketsForSquad,
  squadSizeFor,
} from './matchRules';
import { recalculateTournamentTable } from './tournamentStats';

/**
 * The ball-by-ball log is the single source of truth for a match.
 *
 * Every derived figure — innings totals, batting cards, bowling cards, wickets,
 * innings completion, the result — is recomputed from that log by
 * `rebuildMatch`. Scoring a ball and undoing a ball both just change the log
 * and re-run this, so the two paths cannot drift apart (which is how the
 * previous incremental updates ended up disagreeing after an undo).
 */

export interface RebuildResult {
  status: string;
  winnerId: string | null;
  resultSummary: string | null;
  resultType: string;
  inningsSummaries: {
    id: string;
    inningsNo: number;
    totalRuns: number;
    totalWickets: number;
    legalBalls: number;
    isCompleted: boolean;
    endReason: string | null;
  }[];
}

export async function rebuildMatch(matchId: string): Promise<RebuildResult | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      squadPlayers: true,
      innings: { orderBy: { inningsNo: 'asc' } },
    },
  });
  if (!match) return null;

  const deliveries = await prisma.delivery.findMany({
    where: { matchId },
    orderBy: [{ seq: 'asc' }, { timestamp: 'asc' }],
  });

  const byInnings = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const list = byInnings.get(d.inningsId) || [];
    list.push(d);
    byInnings.set(d.inningsId, list);
  }

  // ---- Accumulators rebuilt from zero every time ----
  const batting = new Map<
    string,
    { runs: number; balls: number; fours: number; sixes: number; isOut: boolean; wicketInfo: string | null; battingPos: number; isRetired: boolean }
  >();
  const bowling = new Map<
    string,
    { legalBalls: number; runs: number; wickets: number; wides: number; noBalls: number }
  >();
  const wicketRows: {
    deliveryId: string;
    dismissedId: string;
    bowlerId: string;
    fielderId: string | null;
    wicketType: string;
  }[] = [];

  const playerNames = new Map<string, string>();
  const allPlayerIds = new Set<string>();
  deliveries.forEach((d) => {
    allPlayerIds.add(d.strikerId);
    allPlayerIds.add(d.bowlerId);
    if (d.nonStrikerId) allPlayerIds.add(d.nonStrikerId);
    if (d.dismissedId) allPlayerIds.add(d.dismissedId);
    if (d.fielderId) allPlayerIds.add(d.fielderId);
  });
  if (allPlayerIds.size > 0) {
    const players = await prisma.player.findMany({
      where: { id: { in: Array.from(allPlayerIds) } },
      select: { id: true, fullName: true },
    });
    players.forEach((p) => playerNames.set(p.id, p.fullName));
  }

  let battingOrderCounter = 0;

  const touchBatter = (playerId: string) => {
    let entry = batting.get(playerId);
    if (!entry) {
      battingOrderCounter += 1;
      entry = {
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        isOut: false,
        wicketInfo: null,
        battingPos: battingOrderCounter,
        isRetired: false,
      };
      batting.set(playerId, entry);
    }
    return entry;
  };

  const touchBowler = (playerId: string) => {
    let entry = bowling.get(playerId);
    if (!entry) {
      entry = { legalBalls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 };
      bowling.set(playerId, entry);
    }
    return entry;
  };

  const inningsSummaries: RebuildResult['inningsSummaries'] = [];
  const inningsUpdates: { id: string; data: any }[] = [];

  let previousInningsRuns: number | null = null;

  for (const innings of match.innings) {
    const list = byInnings.get(innings.id) || [];
    const squadSize = squadSizeFor(match.squadPlayers, innings.battingTeamId);
    // Each side's card numbers its batters from 1.
    battingOrderCounter = 0;

    let totalRuns = 0;
    let totalWickets = 0;
    let legalBalls = 0;
    let lastBowlerId: string | null = null;

    for (const d of list) {
      const evalRes = CentralMatchEngine.evaluateDelivery({
        strikerId: d.strikerId,
        nonStrikerId: d.nonStrikerId,
        bowlerId: d.bowlerId,
        runsBat: d.runsBat,
        extraType: d.extraType as any,
        runsExtra: d.runsExtra,
        isWicket: d.isWicket,
        wicketType: d.wicketType as any,
      });

      totalRuns += evalRes.runsForTeam;
      if (evalRes.isLegal) {
        legalBalls += 1;
        if (legalBalls % 6 === 0) lastBowlerId = d.bowlerId;
      }

      // Striker's card. A no-ball is faced but not a legal ball.
      const striker = touchBatter(d.strikerId);
      // Facing a ball means a retired-hurt batter has resumed, so the card goes
      // back to reading "not out" rather than keeping the retirement note.
      if (striker.isRetired) {
        striker.isRetired = false;
        striker.wicketInfo = null;
      }
      striker.runs += evalRes.runsForBatsman;
      if (evalRes.isLegal || d.extraType === 'NO_BALL') striker.balls += 1;
      if (d.extraType !== 'WIDE') {
        if (d.runsBat === 4) striker.fours += 1;
        if (d.runsBat === 6) striker.sixes += 1;
      }
      // Register the non-striker so the card shows batters who are yet to score.
      if (d.nonStrikerId && d.nonStrikerId !== d.strikerId) touchBatter(d.nonStrikerId);

      // Bowler's card.
      const bowler = touchBowler(d.bowlerId);
      if (evalRes.isLegal) bowler.legalBalls += 1;
      // Byes and leg byes are not charged to the bowler.
      if (d.extraType === 'BYE' || d.extraType === 'LEG_BYE') {
        bowler.runs += 0;
      } else {
        bowler.runs += evalRes.runsForTeam;
      }
      if (d.extraType === 'WIDE') bowler.wides += 1;
      if (d.extraType === 'NO_BALL') bowler.noBalls += 1;

      if (d.isWicket && d.dismissedId) {
        const dismissed = touchBatter(d.dismissedId);
        const isRetiredHurt = d.wicketType === 'RETIRED_HURT';
        dismissed.isRetired = isRetiredHurt;
        dismissed.isOut = !isRetiredHurt;
        dismissed.wicketInfo = dismissalText(
          d.wicketType,
          playerNames.get(d.bowlerId),
          d.fielderId ? playerNames.get(d.fielderId) : null
        );

        if (countsAsTeamWicket(d.wicketType)) totalWickets += 1;
        if (creditsBowler(d.wicketType)) bowler.wickets += 1;

        wicketRows.push({
          deliveryId: d.id,
          dismissedId: d.dismissedId,
          bowlerId: d.bowlerId,
          fielderId: d.fielderId,
          wicketType: d.wicketType || 'BOWLED',
        });
      }
    }

    const target = innings.inningsNo === 2 && previousInningsRuns !== null ? previousInningsRuns + 1 : null;

    const oversFinished = legalBalls >= match.overs * 6;
    const allOut = isAllOut(totalWickets, squadSize);
    const targetReached = target !== null && totalRuns >= target;
    const manualEnd = innings.endReason === 'MANUAL' || innings.endReason === 'ABANDONED';

    let endReason: string | null = null;
    if (targetReached) endReason = 'TARGET';
    else if (allOut) endReason = 'ALL_OUT';
    else if (oversFinished) endReason = 'OVERS';
    else if (manualEnd) endReason = innings.endReason;

    const isCompleted = Boolean(endReason);

    inningsUpdates.push({
      id: innings.id,
      data: {
        totalRuns,
        totalWickets,
        legalBalls,
        totalOvers: parseFloat(CentralMatchEngine.formatOvers(legalBalls)),
        lastBowlerId,
        targetRuns: target,
        endReason,
        isCompleted,
      },
    });

    inningsSummaries.push({
      id: innings.id,
      inningsNo: innings.inningsNo,
      totalRuns,
      totalWickets,
      legalBalls,
      isCompleted,
      endReason,
    });

    previousInningsRuns = totalRuns;
  }

  // ---- Persist derived tables ----
  await prisma.$transaction([
    prisma.wicket.deleteMany({ where: { matchId } }),
    prisma.battingScore.deleteMany({ where: { matchId } }),
    prisma.bowlingFigure.deleteMany({ where: { matchId } }),
  ]);

  if (wicketRows.length > 0) {
    await prisma.wicket.createMany({
      data: wicketRows.map((w) => ({ ...w, matchId })),
    });
  }

  if (batting.size > 0) {
    await prisma.battingScore.createMany({
      data: Array.from(batting.entries()).map(([playerId, b]) => ({
        matchId,
        playerId,
        runs: b.runs,
        balls: b.balls,
        fours: b.fours,
        sixes: b.sixes,
        isOut: b.isOut,
        wicketInfo: b.wicketInfo,
        battingPos: b.battingPos,
        isRetired: b.isRetired,
      })),
    });
  }

  if (bowling.size > 0) {
    await prisma.bowlingFigure.createMany({
      data: Array.from(bowling.entries()).map(([playerId, b]) => ({
        matchId,
        playerId,
        legalBalls: b.legalBalls,
        overs: parseFloat(CentralMatchEngine.formatOvers(b.legalBalls)),
        runs: b.runs,
        wickets: b.wickets,
        wides: b.wides,
        noBalls: b.noBalls,
      })),
    });
  }

  for (const upd of inningsUpdates) {
    await prisma.matchInnings.update({ where: { id: upd.id }, data: upd.data });
  }

  // ---- Innings flow: open the second innings, or close one that was undone ----
  const first = inningsSummaries.find((i) => i.inningsNo === 1);
  const second = inningsSummaries.find((i) => i.inningsNo === 2);
  const firstInningsRecord = match.innings.find((i) => i.inningsNo === 1);
  const secondInningsRecord = match.innings.find((i) => i.inningsNo === 2);

  if (first?.isCompleted && !secondInningsRecord && firstInningsRecord) {
    const created = await prisma.matchInnings.create({
      data: {
        matchId,
        inningsNo: 2,
        battingTeamId: firstInningsRecord.bowlingTeamId,
        bowlingTeamId: firstInningsRecord.battingTeamId,
        targetRuns: first.totalRuns + 1,
      },
    });
    inningsSummaries.push({
      id: created.id,
      inningsNo: 2,
      totalRuns: 0,
      totalWickets: 0,
      legalBalls: 0,
      isCompleted: false,
      endReason: null,
    });
  }

  // Undoing back into the first innings must remove the empty second innings,
  // otherwise the console keeps pointing at an innings that should not exist.
  if (first && !first.isCompleted && secondInningsRecord) {
    const secondBalls = (byInnings.get(secondInningsRecord.id) || []).length;
    if (secondBalls === 0) {
      await prisma.matchInnings.delete({ where: { id: secondInningsRecord.id } });
      const idx = inningsSummaries.findIndex((i) => i.inningsNo === 2);
      if (idx >= 0) inningsSummaries.splice(idx, 1);
    }
  }

  // ---- Match status & result ----
  let status = match.status;
  let winnerId: string | null = match.winnerId;
  let resultSummary: string | null = match.resultSummary;
  let resultType = match.resultType;

  if (match.status === 'ABANDONED') {
    // Abandonment is a manual decision; a rebuild must not silently revive it.
    return {
      status,
      winnerId,
      resultSummary,
      resultType,
      inningsSummaries,
    };
  }

  const secondNow = inningsSummaries.find((i) => i.inningsNo === 2);

  if (inningsSummaries.length === 0) {
    status = match.status === 'SCHEDULED' ? 'SCHEDULED' : match.status;
    winnerId = null;
    resultSummary = null;
    resultType = 'PENDING';
  } else if (first && !first.isCompleted) {
    status = 'LIVE';
    winnerId = null;
    resultSummary = null;
    resultType = 'PENDING';
  } else if (secondNow && !secondNow.isCompleted) {
    status = secondNow.legalBalls === 0 ? 'INNINGS_BREAK' : 'LIVE';
    winnerId = null;
    resultSummary = null;
    resultType = 'PENDING';
  } else if (first?.isCompleted && secondNow?.isCompleted) {
    const secondRecord = match.innings.find((i) => i.inningsNo === 2);
    const firstRecord = match.innings.find((i) => i.inningsNo === 1);
    const teamName = (id: string) => (id === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name);

    status = 'COMPLETED';

    if (first.totalRuns > secondNow.totalRuns) {
      winnerId = firstRecord?.battingTeamId || null;
      const margin = first.totalRuns - secondNow.totalRuns;
      resultSummary = `${teamName(winnerId!)} won by ${margin} run${margin === 1 ? '' : 's'}`;
      resultType = 'WIN';
    } else if (secondNow.totalRuns > first.totalRuns) {
      winnerId = secondRecord?.battingTeamId || null;
      const chaseSquad = squadSizeFor(match.squadPlayers, winnerId || '');
      const wicketsLeft = Math.max(0, maxWicketsForSquad(chaseSquad) - secondNow.totalWickets);
      const ballsLeft = match.overs * 6 - secondNow.legalBalls;
      const ballText = ballsLeft > 0 ? ` (${ballsLeft} ball${ballsLeft === 1 ? '' : 's'} left)` : '';
      resultSummary = `${teamName(winnerId!)} won by ${wicketsLeft} wicket${wicketsLeft === 1 ? '' : 's'}${ballText}`;
      resultType = 'WIN';
    } else {
      winnerId = null;
      resultSummary = 'Match tied';
      resultType = 'TIE';
    }
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status, winnerId, resultSummary, resultType },
  });

  if (match.tournamentId) {
    await recalculateTournamentTable(match.tournamentId);
    await advanceKnockoutWinners(match.tournamentId);
  }

  return { status, winnerId, resultSummary, resultType, inningsSummaries };
}

export interface KnockoutSlotStatus {
  /** True while a feeder stage still has to produce a winner. */
  pending: boolean;
  /** Feeder stages that have not produced a winner yet. */
  waitingOn: string[];
  /** Feeder stages that finished tied and need a tie-breaker recorded. */
  tiedFeeders: string[];
}

/**
 * Whether a knockout slot's teams are settled or still placeholders.
 *
 * A stage is a placeholder while any feeder stage that exists in the bracket
 * has not been completed with a winner. Feeders missing from the bracket (a
 * four-team bracket has no quarter-finals) are simply not feeders.
 */
export function knockoutSlotStatus(
  stage: string,
  byStage: Map<string, { status: string; winnerId: string | null }>
): KnockoutSlotStatus {
  const sources = KNOCKOUT_FEEDS[stage] || [];
  const waitingOn: string[] = [];
  const tiedFeeders: string[] = [];
  for (const src of sources) {
    const feeder = byStage.get(src);
    if (!feeder) continue;
    if (feeder.status === 'COMPLETED' && feeder.winnerId) continue;
    waitingOn.push(src);
    if (feeder.status === 'COMPLETED' && !feeder.winnerId) tiedFeeders.push(src);
  }
  return { pending: waitingOn.length > 0, waitingOn, tiedFeeders };
}

/** Slot status for one match, or null when the match is not a knockout. */
export async function knockoutStatusForMatch(matchId: string): Promise<KnockoutSlotStatus | null> {
  const link = await prisma.knockoutMatch.findUnique({ where: { matchId } });
  if (!link) return null;
  const knockouts = await prisma.knockoutMatch.findMany({
    where: { tournamentId: link.tournamentId },
    include: { match: { select: { status: true, winnerId: true } } },
  });
  const byStage = new Map(knockouts.map((k) => [k.stage, k.match]));
  return knockoutSlotStatus(link.stage, byStage);
}

/**
 * Feeds knockout winners into the next round.
 *
 * QF1/QF2 winners meet in SF1, QF3/QF4 in SF2, and the semi-final winners meet
 * in the final. Placeholder slots are filled in as results land, so the bracket
 * fills itself instead of needing to be regenerated by hand.
 */
export async function advanceKnockoutWinners(tournamentId: string) {
  const knockouts = await prisma.knockoutMatch.findMany({
    where: { tournamentId },
    include: { match: true },
  });
  if (knockouts.length === 0) return;

  const byStage = new Map(knockouts.map((k) => [k.stage, k]));
  const winnerOf = (stage: string): string | null => {
    const k = byStage.get(stage);
    if (!k) return null;
    if (k.match.status !== 'COMPLETED') return null;
    return k.match.winnerId;
  };

  const feeds = Object.entries(KNOCKOUT_FEEDS).map(([target, sources]) => ({ target, sources }));

  for (const feed of feeds) {
    const target = byStage.get(feed.target);
    if (!target) continue;
    // Never rewrite a knockout that has already started.
    if (target.match.status !== 'SCHEDULED') continue;

    const home = winnerOf(feed.sources[0]);
    const away = winnerOf(feed.sources[1]);
    if (!home || !away || home === away) continue;
    if (target.match.homeTeamId === home && target.match.awayTeamId === away) continue;

    await prisma.match.update({
      where: { id: target.matchId },
      data: { homeTeamId: home, awayTeamId: away },
    });
    // Squads were picked for placeholder teams; clear them for the real ones.
    await prisma.matchPlayer.deleteMany({ where: { matchId: target.matchId } });
  }
}

/** Next sequence number for a delivery within an innings. */
export async function nextDeliverySeq(inningsId: string): Promise<number> {
  const last = await prisma.delivery.findFirst({
    where: { inningsId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });
  return (last?.seq || 0) + 1;
}
