import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q');
    const teamId = searchParams.get('teamId');
    const role = searchParams.get('role');

    const where: any = {};
    if (search) where.fullName = { contains: search };
    if (role && role !== 'ALL') where.role = role;
    if (teamId) where.teams = { some: { teamId } };

    const players = await prisma.player.findMany({
      where,
      include: {
        teams: { include: { team: true } },
        _count: { select: { battingScores: true, bowlingFigures: true } },
      },
      orderBy: { fullName: 'asc' },
    });

    return NextResponse.json({ success: true, players });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, jerseyNumber, role = 'ALL_ROUNDER', battingStyle, bowlingStyle, teamId } = body;

    const clean = (fullName || '').trim();
    if (!clean) return fail('Player name is required');

    // Names double as the identity used when squads are typed in free-form,
    // so a duplicate name would silently merge two people's statistics.
    const existing = await prisma.player.findFirst({ where: { fullName: clean } });
    if (existing) {
      return fail(`A player named "${clean}" already exists. Use a distinguishing name (e.g. "Zain K").`);
    }

    if (jerseyNumber !== undefined && jerseyNumber !== null && jerseyNumber !== '') {
      const num = Number(jerseyNumber);
      if (!Number.isInteger(num) || num < 0 || num > 999) {
        return fail('Jersey number must be a whole number between 0 and 999');
      }
    }

    const player = await prisma.player.create({
      data: {
        fullName: clean,
        jerseyNumber: jerseyNumber ? Number(jerseyNumber) : null,
        role,
        battingStyle: battingStyle || 'Right-hand bat',
        bowlingStyle: bowlingStyle || 'Right-arm medium',
      },
    });

    if (teamId) {
      await prisma.teamPlayer.upsert({
        where: { teamId_playerId: { teamId, playerId: player.id } },
        update: {},
        create: { teamId, playerId: player.id },
      });
    }

    return NextResponse.json({ success: true, player });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
