import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CentralMatchEngine } from '@/lib/matchEngine';
import { CommentaryGenerator } from '@/lib/CommentaryGenerator';
import { rebuildMatch, nextDeliverySeq, advanceKnockoutWinners, knockoutStatusForMatch } from '@/lib/scorebook';
import { recalculateTournamentTable } from '@/lib/tournamentStats';
import { isDismissalAllowedOnFreeHit, nextBallIsFreeHit } from '@/lib/matchRules';
import { suggestPlayerOfTheMatch } from '@/lib/potm';

const VALID_EXTRAS = ['NONE', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'];
const VALID_WICKETS = [
  'BOWLED',
  'CAUGHT',
  'RUN_OUT',
  'LBW',
  'STUMPED',
  'HIT_WICKET',
  'RETIRED_HURT',
  'RETIRED_OUT',
  'OBSTRUCTING',
  'OTHER',
];

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Resolves either a MatchPlayer id or a Player id to a real Player id, creating
 * the permanent Player record on first use so match squads typed on the fly
 * still produce career statistics.
 */
async function resolvePlayerId(idOrMatchPlayerId: string): Promise<string> {
  if (!idOrMatchPlayerId) return idOrMatchPlayerId;

  const existingPlayer = await prisma.player.findUnique({ where: { id: idOrMatchPlayerId } });
  if (existingPlayer) return existingPlayer.id;

  const matchPlayer = await prisma.matchPlayer.findUnique({ where: { id: idOrMatchPlayerId } });
  if (matchPlayer) {
    if (matchPlayer.playerId) {
      const linked = await prisma.player.findUnique({ where: { id: matchPlayer.playerId } });
      if (linked) return linked.id;
    }

    let playerObj = await prisma.player.findFirst({ where: { fullName: matchPlayer.playerName } });
    if (!playerObj) {
      playerObj = await prisma.player.create({
        data: { fullName: matchPlayer.playerName, role: matchPlayer.role || 'ALL_ROUNDER' },
      });
    }

    await prisma.matchPlayer.update({
      where: { id: matchPlayer.id },
      data: { playerId: playerObj.id },
    });

    return playerObj.id;
  }

  return idOrMatchPlayerId;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const matchId = (await params).id;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: { include: { players: { include: { player: true } } } },
        awayTeam: { include: { players: { include: { player: true } } } },
        squadPlayers: { include: { player: true } },
        winnerTeam: true,
        potm: true,
        tournament: true,
        innings: {
          include: {
            deliveries: {
              include: { striker: true, bowler: true },
              orderBy: [{ seq: 'desc' }],
            },
          },
          orderBy: { inningsNo: 'asc' },
        },
        battingScores: { include: { player: true }, orderBy: { battingPos: 'asc' } },
        bowlingFigures: { include: { player: true } },
      },
    });

    if (!match) return fail('Match not found', 404);

    // Which team each scored player belongs to, so the UI can split innings
    // cards without re-deriving it from squad rows on every render.
    const teamByPlayerId: Record<string, string> = {};
    match.squadPlayers.forEach((sp) => {
      if (sp.playerId) teamByPlayerId[sp.playerId] = sp.teamId;
    });

    // Rank the performances once the match is over, so the scorer has a
    // suggestion to accept or override rather than a blank dropdown.
    let potmSuggestions = null;
    if (match.status === 'COMPLETED' && match.innings.length > 0) {
      const wickets = await prisma.wicket.findMany({
        where: { matchId },
        select: { fielderId: true, wicketType: true },
      });

      potmSuggestions = suggestPlayerOfTheMatch({
        ballType: match.ballType,
        winnerId: match.winnerId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        innings: match.innings,
        battingScores: match.battingScores,
        bowlingFigures: match.bowlingFigures,
        deliveries: match.innings.flatMap((i) => i.deliveries),
        wickets,
        squadPlayers: match.squadPlayers,
      });
    }

    return NextResponse.json({ success: true, match, teamByPlayerId, potmSuggestions });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const matchId = (await params).id;
    const body = await request.json();
    const { action } = body;

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeTeam: true,
        awayTeam: true,
        squadPlayers: true,
        innings: { orderBy: { inningsNo: 'asc' } },
      },
    });

    if (!match) return fail('Match not found', 404);

    // ------------------------------------------------------------------
    // SQUAD: set the playing XI for a match (needed for tournament fixtures,
    // which are generated without squads).
    // ------------------------------------------------------------------
    if (action === 'setSquad') {
      const { teamId, players } = body as {
        teamId: string;
        players: { playerName: string; playerId?: string; role?: string; jerseyNumber?: number }[];
      };

      if (!teamId || teamId !== match.homeTeamId && teamId !== match.awayTeamId) {
        return fail('Squad team must be one of the two teams in this match');
      }
      if (!Array.isArray(players) || players.length === 0) {
        return fail('A squad needs at least one player');
      }
      if (match.status === 'COMPLETED') {
        return fail('Cannot change squads for a completed match');
      }

      const names = players.map((p) => (p.playerName || '').trim()).filter(Boolean);
      if (names.length !== players.length) return fail('Every squad player needs a name');
      if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
        return fail('Duplicate player names in the squad');
      }

      // A player already used in a delivery cannot be dropped mid-match.
      const usedIds = new Set<string>();
      const deliveries = await prisma.delivery.findMany({
        where: { matchId },
        select: { strikerId: true, nonStrikerId: true, bowlerId: true },
      });
      deliveries.forEach((d) => {
        usedIds.add(d.strikerId);
        usedIds.add(d.nonStrikerId);
        usedIds.add(d.bowlerId);
      });

      const existing = await prisma.matchPlayer.findMany({ where: { matchId, teamId } });
      const keptPlayerIds = new Set<string>();
      for (const p of players) {
        if (p.playerId) keptPlayerIds.add(p.playerId);
      }
      const droppedInUse = existing.filter(
        (e) => e.playerId && usedIds.has(e.playerId) && !keptPlayerIds.has(e.playerId)
      );
      if (droppedInUse.length > 0) {
        return fail(
          `Cannot remove ${droppedInUse.map((d) => d.playerName).join(', ')} — already involved in a delivery`
        );
      }

      await prisma.matchPlayer.deleteMany({ where: { matchId, teamId } });

      for (const p of players) {
        const cleanName = p.playerName.trim();
        let playerRecord = p.playerId
          ? await prisma.player.findUnique({ where: { id: p.playerId } })
          : null;
        if (!playerRecord) {
          playerRecord = await prisma.player.findFirst({ where: { fullName: cleanName } });
        }
        if (!playerRecord) {
          playerRecord = await prisma.player.create({
            data: { fullName: cleanName, role: p.role || 'ALL_ROUNDER' },
          });
        }

        await prisma.matchPlayer.create({
          data: {
            matchId,
            teamId,
            playerName: cleanName,
            playerId: playerRecord.id,
            role: p.role || playerRecord.role || 'ALL_ROUNDER',
            jerseyNumber: p.jerseyNumber ? Number(p.jerseyNumber) : null,
          },
        });

        await prisma.teamPlayer.upsert({
          where: { teamId_playerId: { teamId, playerId: playerRecord.id } },
          update: {},
          create: { teamId, playerId: playerRecord.id },
        });
      }

      const squad = await prisma.matchPlayer.findMany({ where: { matchId }, include: { player: true } });
      return NextResponse.json({ success: true, squad });
    }

    // ------------------------------------------------------------------
    // TOSS
    // ------------------------------------------------------------------
    if (action === 'toss') {
      const { tossWinnerId, tossDecision } = body;

      if (tossWinnerId !== match.homeTeamId && tossWinnerId !== match.awayTeamId) {
        return fail('Toss winner must be one of the two teams');
      }
      if (tossDecision !== 'BAT' && tossDecision !== 'BOWL') {
        return fail('Toss decision must be BAT or BOWL');
      }
      if (match.innings.length > 0) {
        return fail('Toss has already been completed for this match');
      }
      if (match.status === 'COMPLETED' || match.status === 'ABANDONED') {
        return fail('This match is already finished');
      }

      // A later knockout round is seeded with placeholder teams until the
      // feeding matches finish; starting it early would lock the wrong sides in.
      const slot = await knockoutStatusForMatch(matchId);
      if (slot?.pending) {
        const tied = slot.tiedFeeders.length
          ? ` ${slot.tiedFeeders.join(' and ')} finished tied — record a super over or bowl-out result first.`
          : '';
        return fail(`Waiting for the ${slot.waitingOn.join(' and ')} result before this match can start.${tied}`);
      }

      const opponentId = tossWinnerId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      const battingTeamId = tossDecision === 'BAT' ? tossWinnerId : opponentId;
      const bowlingTeamId = tossDecision === 'BAT' ? opponentId : tossWinnerId;

      await prisma.match.update({
        where: { id: matchId },
        data: { tossWinnerId, tossDecision, status: 'LIVE' },
      });

      const firstInnings = await prisma.matchInnings.create({
        data: { matchId, inningsNo: 1, battingTeamId, bowlingTeamId },
      });

      return NextResponse.json({ success: true, message: 'Toss completed', firstInnings });
    }

    // ------------------------------------------------------------------
    // DELIVERY
    // ------------------------------------------------------------------
    if (action === 'delivery') {
      const {
        inningsId,
        strikerId: rawStrikerId,
        nonStrikerId: rawNonStrikerId,
        bowlerId: rawBowlerId,
        runsBat = 0,
        extraType = 'NONE',
        runsExtra = 0,
        isWicket = false,
        wicketType,
        dismissedId: rawDismissedId,
        fielderId: rawFielderId,
      } = body;

      if (!VALID_EXTRAS.includes(extraType)) return fail(`Unknown extra type: ${extraType}`);
      if (!Number.isInteger(runsBat) || runsBat < 0 || runsBat > 7) {
        return fail('Runs off the bat must be between 0 and 7');
      }
      if (!Number.isInteger(runsExtra) || runsExtra < 0 || runsExtra > 7) {
        return fail('Extra runs must be between 0 and 7');
      }
      if (isWicket && wicketType && !VALID_WICKETS.includes(wicketType)) {
        return fail(`Unknown dismissal type: ${wicketType}`);
      }
      if (isWicket && !rawDismissedId) return fail('A wicket needs the dismissed batter');
      if (extraType === 'WIDE' && runsBat > 0) {
        return fail('Runs off the bat cannot be scored from a wide');
      }
      if ((extraType === 'BYE' || extraType === 'LEG_BYE') && runsBat > 0) {
        return fail('Byes and leg byes carry no runs off the bat');
      }
      if (match.status === 'ABANDONED') return fail('This match was abandoned');

      const currentInnings = await prisma.matchInnings.findUnique({ where: { id: inningsId } });
      if (!currentInnings) return fail('Innings not found', 404);
      if (currentInnings.matchId !== matchId) return fail('Innings does not belong to this match');
      if (currentInnings.isCompleted) return fail('This innings is already complete');

      const strikerId = await resolvePlayerId(rawStrikerId);
      const nonStrikerId = await resolvePlayerId(rawNonStrikerId);
      const bowlerId = await resolvePlayerId(rawBowlerId);
      const dismissedId = rawDismissedId ? await resolvePlayerId(rawDismissedId) : null;
      const fielderId = rawFielderId ? await resolvePlayerId(rawFielderId) : null;

      if (!strikerId || !bowlerId) return fail('Striker and bowler are required');
      if (strikerId === bowlerId || nonStrikerId === bowlerId) {
        return fail('A player cannot bat and bowl on the same delivery');
      }

      // The console only offers the right squads, but the API must not trust
      // that: a batter has to belong to the side batting and the bowler to the
      // side bowling. Sides without a registered squad are left unchecked.
      const squadOf = (teamId: string) =>
        new Set(match.squadPlayers.filter((p) => p.teamId === teamId && p.playerId).map((p) => p.playerId));
      const battingSquad = squadOf(currentInnings.battingTeamId);
      const bowlingSquad = squadOf(currentInnings.bowlingTeamId);
      if (battingSquad.size > 0) {
        const outsiders = [strikerId, nonStrikerId].filter((id) => id && !battingSquad.has(id));
        if (outsiders.length > 0) return fail('Striker and non-striker must be from the batting side');
      }
      if (bowlingSquad.size > 0 && !bowlingSquad.has(bowlerId)) {
        return fail('The bowler must be from the fielding side');
      }
      if (fielderId && bowlingSquad.size > 0 && !bowlingSquad.has(fielderId)) {
        return fail('The fielder must be from the fielding side');
      }
      if (dismissedId && dismissedId !== strikerId && dismissedId !== nonStrikerId) {
        return fail('Only the striker or non-striker can be dismissed on a delivery');
      }

      // A batter who is already out cannot come back. (A retired-hurt batter is
      // not out, so they are still allowed to resume.)
      const alreadyOut = await prisma.battingScore.findMany({
        where: {
          matchId,
          isOut: true,
          playerId: { in: [strikerId, nonStrikerId].filter(Boolean) },
        },
        include: { player: true },
      });
      if (alreadyOut.length > 0) {
        return fail(
          `${alreadyOut.map((b) => b.player.fullName).join(' and ')} ${
            alreadyOut.length === 1 ? 'is' : 'are'
          } already out and cannot bat again`
        );
      }

      const [striker, bowler, fielder] = await Promise.all([
        prisma.player.findUnique({ where: { id: strikerId } }),
        prisma.player.findUnique({ where: { id: bowlerId } }),
        fielderId ? prisma.player.findUnique({ where: { id: fielderId } }) : Promise.resolve(null),
      ]);
      if (!striker) return fail('Striker not found');
      if (!bowler) return fail('Bowler not found');

      // A bowler may not bowl two overs in succession. Only enforced at the
      // start of a new over, and only when the side has another bowler to use.
      const atOverStart =
        currentInnings.legalBalls > 0 && currentInnings.legalBalls % 6 === 0;
      if (atOverStart && currentInnings.lastBowlerId === bowlerId) {
        const bowlingSquadSize = match.squadPlayers.filter(
          (p) => p.teamId === currentInnings.bowlingTeamId
        ).length;
        if (bowlingSquadSize !== 1) {
          return fail(`${bowler.fullName} bowled the previous over — a different bowler must bowl this one`);
        }
      }

      const evalRes = CentralMatchEngine.evaluateDelivery({
        strikerId,
        nonStrikerId,
        bowlerId,
        runsBat,
        extraType,
        runsExtra,
        isWicket,
        wicketType,
        dismissedId: dismissedId || undefined,
        fielderId: fielderId || undefined,
      });

      // A no-ball earns the striker a free hit on the following delivery, on
      // which only a run out (or obstruction) can get them out.
      const previousDelivery = await prisma.delivery.findFirst({
        where: { inningsId },
        orderBy: [{ seq: 'desc' }, { timestamp: 'desc' }],
        select: { extraType: true, isLegal: true, isFreeHit: true },
      });
      const isFreeHit = nextBallIsFreeHit(previousDelivery);

      if (isFreeHit && isWicket && !isDismissalAllowedOnFreeHit(wicketType)) {
        return fail(
          `Free hit — ${(wicketType || 'this dismissal').toLowerCase().replace(/_/g, ' ')} does not count. Only a run out or obstructing the field can dismiss the batter.`
        );
      }

      const seq = await nextDeliverySeq(inningsId);
      const overNo = Math.floor(currentInnings.legalBalls / 6);
      // Illegal deliveries are logged against the ball that is about to be
      // re-bowled, so commentary reads "0.1 wide" rather than "0.0 wide".
      const ballNo = (currentInnings.legalBalls % 6) + 1;

      const commentary = CommentaryGenerator.generateCommentary(
        { strikerId, nonStrikerId, bowlerId, runsBat, extraType, runsExtra, isWicket, wicketType },
        striker.fullName,
        bowler.fullName,
        fielder?.fullName,
        isFreeHit
      );

      const delivery = await prisma.delivery.create({
        data: {
          matchId,
          inningsId,
          seq,
          overNo,
          ballNo,
          strikerId,
          nonStrikerId: nonStrikerId || strikerId,
          bowlerId,
          runsBat,
          // Store the raw extras the scorer entered, not the computed total.
          // The wide/no-ball penalty is added by the engine, so persisting the
          // computed value here would double-count it on every rebuild.
          runsExtra,
          runsTotal: evalRes.runsForTeam,
          extraType,
          isLegal: evalRes.isLegal,
          isFreeHit,
          isWicket,
          wicketType,
          dismissedId,
          fielderId,
          commentary,
        },
      });

      const rebuilt = await rebuildMatch(matchId);
      const thisInnings = rebuilt?.inningsSummaries.find((i) => i.id === inningsId);

      return NextResponse.json({
        success: true,
        delivery,
        matchStatus: rebuilt?.status,
        resultSummary: rebuilt?.resultSummary,
        wasFreeHit: isFreeHit,
        nextBallIsFreeHit: nextBallIsFreeHit({
          extraType,
          isLegal: evalRes.isLegal,
          isFreeHit,
        }),
        updatedInnings: {
          totalRuns: thisInnings?.totalRuns ?? 0,
          totalWickets: thisInnings?.totalWickets ?? 0,
          overs: CentralMatchEngine.formatOvers(thisInnings?.legalBalls ?? 0),
          legalBalls: thisInnings?.legalBalls ?? 0,
          isCompleted: thisInnings?.isCompleted ?? false,
          endReason: thisInnings?.endReason ?? null,
          isOverEnd:
            evalRes.isLegal &&
            (thisInnings?.legalBalls ?? 0) % 6 === 0 &&
            (thisInnings?.legalBalls ?? 0) > 0,
        },
      });
    }

    // ------------------------------------------------------------------
    // UNDO — removes the last ball of the match and rebuilds everything.
    // ------------------------------------------------------------------
    if (action === 'undo') {
      if (match.status === 'ABANDONED') {
        return fail('This match was abandoned — reset it to score it again');
      }
      const lastDelivery = await prisma.delivery.findFirst({
        where: { matchId },
        orderBy: [{ seq: 'desc' }, { timestamp: 'desc' }],
      });

      if (!lastDelivery) return fail('There is no ball to undo');

      const owningInnings = await prisma.matchInnings.findUnique({
        where: { id: lastDelivery.inningsId },
      });

      await prisma.delivery.delete({ where: { id: lastDelivery.id } });

      // A manual innings close is undone along with the ball that preceded it.
      if (owningInnings?.endReason === 'MANUAL') {
        await prisma.matchInnings.update({
          where: { id: owningInnings.id },
          data: { endReason: null, isCompleted: false },
        });
      }

      const rebuilt = await rebuildMatch(matchId);
      return NextResponse.json({
        success: true,
        message: 'Last ball removed',
        matchStatus: rebuilt?.status,
      });
    }

    // ------------------------------------------------------------------
    // END INNINGS EARLY (retirement, agreement, rain)
    // ------------------------------------------------------------------
    if (action === 'endInnings') {
      const { inningsId } = body;
      const innings = await prisma.matchInnings.findUnique({ where: { id: inningsId } });
      if (!innings || innings.matchId !== matchId) return fail('Innings not found', 404);
      if (innings.isCompleted) return fail('This innings is already complete');

      await prisma.matchInnings.update({
        where: { id: inningsId },
        data: { endReason: 'MANUAL', isCompleted: true },
      });

      const rebuilt = await rebuildMatch(matchId);
      return NextResponse.json({ success: true, matchStatus: rebuilt?.status });
    }

    // ------------------------------------------------------------------
    // ABANDON / NO RESULT
    // ------------------------------------------------------------------
    if (action === 'abandon') {
      const { reason } = body;
      if (match.status === 'ABANDONED') return fail('This match is already abandoned');
      if (match.status === 'COMPLETED') {
        return fail('A completed match cannot be abandoned — delete or reset it instead');
      }
      await prisma.match.update({
        where: { id: matchId },
        data: {
          status: 'ABANDONED',
          resultType: 'NO_RESULT',
          winnerId: null,
          resultSummary: reason ? `Abandoned — ${reason}` : 'Match abandoned (no result)',
        },
      });
      await prisma.matchInnings.updateMany({
        where: { matchId, isCompleted: false },
        data: { isCompleted: true, endReason: 'ABANDONED' },
      });

      if (match.tournamentId) await recalculateTournamentTable(match.tournamentId);

      return NextResponse.json({ success: true, message: 'Match marked as abandoned' });
    }

    // ------------------------------------------------------------------
    // RESET — wipes scoring and returns the match to SCHEDULED.
    // ------------------------------------------------------------------
    if (action === 'reset') {
      await prisma.wicket.deleteMany({ where: { matchId } });
      await prisma.delivery.deleteMany({ where: { matchId } });
      await prisma.battingScore.deleteMany({ where: { matchId } });
      await prisma.bowlingFigure.deleteMany({ where: { matchId } });
      await prisma.matchInnings.deleteMany({ where: { matchId } });
      await prisma.match.update({
        where: { id: matchId },
        data: {
          status: 'SCHEDULED',
          winnerId: null,
          potmId: null,
          resultSummary: null,
          resultType: 'PENDING',
          tossWinnerId: null,
          tossDecision: null,
        },
      });

      if (match.tournamentId) await recalculateTournamentTable(match.tournamentId);

      return NextResponse.json({ success: true, message: 'Match reset to scheduled' });
    }

    // ------------------------------------------------------------------
    // PLAYER OF THE MATCH
    // ------------------------------------------------------------------
    if (action === 'setPotm') {
      const { playerId } = body;
      if (playerId) {
        const resolved = await resolvePlayerId(playerId);
        const player = await prisma.player.findUnique({ where: { id: resolved } });
        if (!player) return fail('Player not found', 404);
        await prisma.match.update({ where: { id: matchId }, data: { potmId: resolved } });
      } else {
        await prisma.match.update({ where: { id: matchId }, data: { potmId: null } });
      }
      return NextResponse.json({ success: true });
    }

    // ------------------------------------------------------------------
    // TIE-BREAKER — records who went through after a super over or bowl-out.
    // Without this a tied knockout would leave the bracket with no winner.
    // ------------------------------------------------------------------
    if (action === 'setTieBreakWinner') {
      const { winnerId, method } = body;

      if (match.status !== 'COMPLETED') return fail('The match is not finished yet');
      if (match.resultType !== 'TIE' && match.resultType !== 'SUPER_OVER') {
        return fail('Only a tied match can be decided by a tie-breaker');
      }
      if (winnerId && winnerId !== match.homeTeamId && winnerId !== match.awayTeamId) {
        return fail('The winner must be one of the two teams');
      }

      if (!winnerId) {
        // Clearing the tie-breaker returns the match to a plain tie.
        await prisma.match.update({
          where: { id: matchId },
          data: { winnerId: null, resultType: 'TIE', resultSummary: 'Match tied', isSuperOver: false },
        });
      } else {
        const teamName =
          winnerId === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name;
        const how = method === 'BOWL_OUT' ? 'bowl-out' : 'super over';
        await prisma.match.update({
          where: { id: matchId },
          data: {
            winnerId,
            resultType: 'SUPER_OVER',
            resultSummary: `Match tied — ${teamName} won the ${how}`,
            isSuperOver: true,
          },
        });
      }

      if (match.tournamentId) {
        await recalculateTournamentTable(match.tournamentId);
        await advanceKnockoutWinners(match.tournamentId);
      }

      return NextResponse.json({ success: true, message: 'Tie-breaker recorded' });
    }

    return fail(`Unknown action: ${action}`);
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

/** Edit match details (venue, date, overs, ball type, notes). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const matchId = (await params).id;
    const body = await request.json();
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { innings: true },
    });
    if (!match) return fail('Match not found', 404);

    const data: any = {};
    if (body.venue !== undefined) {
      if (!String(body.venue).trim()) return fail('Venue cannot be empty');
      data.venue = String(body.venue).trim();
    }
    if (body.date !== undefined) {
      const parsed = new Date(body.date);
      if (Number.isNaN(parsed.getTime())) return fail('Invalid match date');
      data.date = parsed;
    }
    if (body.overs !== undefined) {
      const overs = Number(body.overs);
      if (!Number.isInteger(overs) || overs < 1 || overs > 50) {
        return fail('Overs must be a whole number between 1 and 50');
      }
      // Shrinking the format below what has already been bowled would strand
      // the innings in an impossible state.
      const maxBowled = Math.max(0, ...match.innings.map((i) => i.legalBalls));
      if (overs * 6 < maxBowled) {
        return fail(`At least ${Math.ceil(maxBowled / 6)} overs have already been bowled`);
      }
      data.overs = overs;
    }
    if (body.ballType !== undefined) data.ballType = body.ballType;
    if (body.notes !== undefined) data.notes = body.notes;

    if (Object.keys(data).length === 0) return fail('Nothing to update');

    const updated = await prisma.match.update({ where: { id: matchId }, data });

    // Changing the format can complete or reopen an innings.
    if (data.overs !== undefined && match.innings.length > 0) {
      await rebuildMatch(matchId);
    }

    return NextResponse.json({ success: true, match: updated });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

/** Delete a match and every record that hangs off it. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const matchId = (await params).id;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: { knockoutLink: true },
    });
    if (!match) return fail('Match not found', 404);

    const tournamentId = match.tournamentId;

    // Deliveries, innings, cards, squads and the knockout link all cascade.
    await prisma.match.delete({ where: { id: matchId } });

    if (tournamentId) await recalculateTournamentTable(tournamentId);

    return NextResponse.json({ success: true, message: 'Match deleted' });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
