import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { StatsCalculator } from '@/lib/statsCalculator';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

/** Player profile with full career batting, bowling and fielding statistics. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const player = await prisma.player.findUnique({
      where: { id: (await params).id },
      include: {
        teams: { include: { team: true } },
        battingScores: {
          include: { match: { include: { homeTeam: true, awayTeam: true, tournament: true } } },
        },
        bowlingFigures: {
          include: { match: { include: { homeTeam: true, awayTeam: true, tournament: true } } },
        },
        potmAwards: { include: { homeTeam: true, awayTeam: true } },
      },
    });
    if (!player) return fail('Player not found', 404);

    // Only count innings that actually happened, not squad rows with no action.
    const battedIn = player.battingScores.filter((b) => b.balls > 0 || b.runs > 0 || b.isOut);
    const bowledIn = player.bowlingFigures.filter((b) => b.legalBalls > 0 || b.runs > 0);

    const batting = StatsCalculator.calculateBattingStats(battedIn);
    const bowling = StatsCalculator.calculateBowlingStats(bowledIn);

    const [catches, runOuts, stumpings] = await Promise.all([
      prisma.wicket.count({ where: { fielderId: player.id, wicketType: 'CAUGHT' } }),
      prisma.wicket.count({ where: { fielderId: player.id, wicketType: 'RUN_OUT' } }),
      prisma.wicket.count({ where: { fielderId: player.id, wicketType: 'STUMPED' } }),
    ]);

    const matchIds = new Set([
      ...player.battingScores.map((b) => b.matchId),
      ...player.bowlingFigures.map((b) => b.matchId),
    ]);

    return NextResponse.json({
      success: true,
      player,
      stats: {
        batting: { ...batting, matches: matchIds.size },
        bowling: { ...bowling, matches: bowledIn.length },
        fielding: { catches, runOuts, stumpings },
        potm: player.potmAwards.length,
      },
    });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const player = await prisma.player.findUnique({ where: { id: (await params).id } });
    if (!player) return fail('Player not found', 404);

    const data: any = {};
    if (body.fullName !== undefined) {
      const clean = String(body.fullName).trim();
      if (!clean) return fail('Player name cannot be empty');
      const clash = await prisma.player.findFirst({
        where: { fullName: clean, NOT: { id: player.id } },
      });
      if (clash) return fail(`A player named "${clean}" already exists`);
      data.fullName = clean;
    }
    if (body.jerseyNumber !== undefined) {
      if (body.jerseyNumber === null || body.jerseyNumber === '') {
        data.jerseyNumber = null;
      } else {
        const num = Number(body.jerseyNumber);
        if (!Number.isInteger(num) || num < 0 || num > 999) {
          return fail('Jersey number must be a whole number between 0 and 999');
        }
        data.jerseyNumber = num;
      }
    }
    if (body.role !== undefined) data.role = body.role;
    if (body.battingStyle !== undefined) data.battingStyle = body.battingStyle;
    if (body.bowlingStyle !== undefined) data.bowlingStyle = body.bowlingStyle;

    if (Object.keys(data).length === 0) return fail('Nothing to update');

    const updated = await prisma.player.update({ where: { id: player.id }, data });

    // Squad rows carry a denormalised name for free-form entry; keep them in step.
    if (data.fullName) {
      await prisma.matchPlayer.updateMany({
        where: { playerId: player.id },
        data: { playerName: data.fullName },
      });
    }

    return NextResponse.json({ success: true, player: updated });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const player = await prisma.player.findUnique({
      where: { id: (await params).id },
      include: { _count: { select: { battingScores: true, bowlingFigures: true } } },
    });
    if (!player) return fail('Player not found', 404);

    // Deliveries reference the player without a cascade, so a player with a
    // scoring history cannot be removed without destroying match records.
    const deliveryCount = await prisma.delivery.count({
      where: { OR: [{ strikerId: player.id }, { bowlerId: player.id }] },
    });

    if (deliveryCount > 0) {
      return fail(
        `"${player.fullName}" has ${deliveryCount} recorded ball${deliveryCount === 1 ? '' : 's'} in the scorebook and cannot be deleted. Delete those matches first if this record is wrong.`,
        409
      );
    }

    const cardCount = player._count.battingScores + player._count.bowlingFigures;
    if (cardCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error: `"${player.fullName}" appears on ${cardCount} scorecard${cardCount === 1 ? '' : 's'}. Delete anyway?`,
        },
        { status: 409 }
      );
    }

    await prisma.player.delete({ where: { id: player.id } });
    return NextResponse.json({ success: true, message: `Player "${player.fullName}" deleted` });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
