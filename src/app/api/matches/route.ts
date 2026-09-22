import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const tournamentId = searchParams.get('tournamentId');
    const teamId = searchParams.get('teamId');
    const search = searchParams.get('q');
    const limit = Number(searchParams.get('limit') || 200);

    const where: any = {};
    if (status && status !== 'ALL') {
      // "LIVE" in the UI covers the innings break too — the match is in play.
      where.status = status === 'LIVE' ? { in: ['LIVE', 'INNINGS_BREAK'] } : status;
    }
    if (type && type !== 'ALL') where.matchType = type;
    if (tournamentId) where.tournamentId = tournamentId;
    if (teamId) where.OR = [{ homeTeamId: teamId }, { awayTeamId: teamId }];
    if (search) {
      where.AND = [
        {
          OR: [
            { venue: { contains: search } },
            { homeTeam: { name: { contains: search } } },
            { awayTeam: { name: { contains: search } } },
            { tournament: { name: { contains: search } } },
          ],
        },
      ];
    }

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
        winnerTeam: true,
        tournament: true,
        potm: true,
        innings: { orderBy: { inningsNo: 'asc' } },
        squadPlayers: { include: { player: true } },
      },
      orderBy: { date: 'asc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return NextResponse.json({ success: true, matches });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      matchType = 'SINGLE',
      tournamentId,
      stage = 'FRIENDLY',
      homeTeamId,
      awayTeamId,
      venue,
      date = new Date(),
      overs = 6,
      ballType = 'TAPE_BALL',
      teamASquad = [],
      teamBSquad = [],
    } = body;

    if (!homeTeamId || !awayTeamId) return fail('Both teams are required');
    if (homeTeamId === awayTeamId) return fail('A team cannot play against itself');
    if (!venue || !String(venue).trim()) return fail('Venue is required');

    const oversNum = Number(overs);
    if (!Number.isInteger(oversNum) || oversNum < 1 || oversNum > 50) {
      return fail('Overs must be a whole number between 1 and 50');
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return fail('Invalid match date');

    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.findUnique({ where: { id: homeTeamId } }),
      prisma.team.findUnique({ where: { id: awayTeamId } }),
    ]);
    if (!homeTeam) return fail('Home team not found', 404);
    if (!awayTeam) return fail('Away team not found', 404);

    if (matchType === 'TOURNAMENT' && tournamentId) {
      const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
      if (!tournament) return fail('Tournament not found', 404);
    }

    const newMatch = await prisma.match.create({
      data: {
        matchType,
        tournamentId: matchType === 'TOURNAMENT' ? tournamentId : null,
        stage,
        homeTeamId,
        awayTeamId,
        venue: String(venue).trim(),
        date: parsedDate,
        overs: oversNum,
        ballType,
        status: 'SCHEDULED',
      },
    });

    async function getOrCreatePlayer(name: string, role?: string) {
      const cleanName = name.trim();
      let p = await prisma.player.findFirst({ where: { fullName: cleanName } });
      if (!p) {
        p = await prisma.player.create({
          data: { fullName: cleanName, role: role || 'ALL_ROUNDER' },
        });
      }
      return p;
    }

    async function saveSquad(squad: any[], teamId: string) {
      const seen = new Set<string>();
      for (const p of squad) {
        const name = (p.playerName || '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue; // ignore accidental duplicates rather than failing
        seen.add(key);

        const realPlayer = await getOrCreatePlayer(name, p.role);
        await prisma.matchPlayer.create({
          data: {
            matchId: newMatch.id,
            teamId,
            playerName: name,
            playerId: realPlayer.id,
            jerseyNumber: p.jerseyNumber ? Number(p.jerseyNumber) : null,
            role: p.role || 'ALL_ROUNDER',
          },
        });
        await prisma.teamPlayer.upsert({
          where: { teamId_playerId: { teamId, playerId: realPlayer.id } },
          update: {},
          create: { teamId, playerId: realPlayer.id },
        });
      }
    }

    await saveSquad(teamASquad, homeTeamId);
    await saveSquad(teamBSquad, awayTeamId);

    return NextResponse.json({ success: true, match: newMatch });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
