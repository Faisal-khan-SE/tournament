import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q');

    const teams = await prisma.team.findMany({
      where: search
        ? { OR: [{ name: { contains: search } }, { shortName: { contains: search } }] }
        : undefined,
      include: {
        players: { include: { player: true } },
        tournaments: { include: { tournament: true } },
        _count: { select: { homeMatches: true, awayMatches: true, wonMatches: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ success: true, teams });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, shortName, manager, contact, homeVenue, playerIds = [] } = body;

    const cleanName = (name || '').trim();
    const cleanShort = (shortName || '').trim().toUpperCase();

    if (!cleanName) return fail('Team name is required');
    if (!cleanShort) return fail('Short name is required');
    if (cleanShort.length > 5) return fail('Short name must be 5 characters or fewer');

    // Team names are the handle people use everywhere in the UI, so keep them
    // unique rather than ending up with three "Team Alpha"s in a dropdown.
    const existing = await prisma.team.findFirst({ where: { name: cleanName } });
    if (existing) return fail(`A team named "${cleanName}" already exists`);

    const team = await prisma.team.create({
      data: {
        name: cleanName,
        shortName: cleanShort,
        manager: manager?.trim() || null,
        contact: contact?.trim() || null,
        homeVenue: homeVenue?.trim() || null,
      },
    });

    for (const playerId of playerIds) {
      await prisma.teamPlayer.upsert({
        where: { teamId_playerId: { teamId: team.id, playerId } },
        update: {},
        create: { teamId: team.id, playerId },
      });
    }

    const withPlayers = await prisma.team.findUnique({
      where: { id: team.id },
      include: { players: { include: { player: true } } },
    });

    return NextResponse.json({ success: true, team: withPlayers });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
