import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const team = await prisma.team.findUnique({
      where: { id: (await params).id },
      include: {
        players: { include: { player: true } },
        tournaments: { include: { tournament: true } },
        pointsEntries: { include: { tournament: true } },
      },
    });
    if (!team) return fail('Team not found', 404);

    const matches = await prisma.match.findMany({
      where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
      include: { homeTeam: true, awayTeam: true, tournament: true, innings: true },
      orderBy: { date: 'desc' },
    });

    const completed = matches.filter((m) => m.status === 'COMPLETED');
    const record = {
      played: completed.length,
      won: completed.filter((m) => m.winnerId === team.id).length,
      lost: completed.filter((m) => m.winnerId && m.winnerId !== team.id).length,
      tied: completed.filter((m) => !m.winnerId).length,
      abandoned: matches.filter((m) => m.status === 'ABANDONED').length,
      scheduled: matches.filter((m) => m.status === 'SCHEDULED').length,
    };

    return NextResponse.json({ success: true, team, matches, record });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const team = await prisma.team.findUnique({ where: { id: (await params).id } });
    if (!team) return fail('Team not found', 404);

    // Squad membership actions
    if (body.action === 'addPlayer') {
      const { playerId, fullName, role } = body;
      let player = playerId ? await prisma.player.findUnique({ where: { id: playerId } }) : null;

      if (!player && fullName?.trim()) {
        const clean = fullName.trim();
        player = await prisma.player.findFirst({ where: { fullName: clean } });
        if (!player) {
          player = await prisma.player.create({
            data: { fullName: clean, role: role || 'ALL_ROUNDER' },
          });
        }
      }
      if (!player) return fail('Provide an existing player or a name to create one');

      await prisma.teamPlayer.upsert({
        where: { teamId_playerId: { teamId: team.id, playerId: player.id } },
        update: {},
        create: { teamId: team.id, playerId: player.id },
      });

      const updated = await prisma.team.findUnique({
        where: { id: team.id },
        include: { players: { include: { player: true } } },
      });
      return NextResponse.json({ success: true, team: updated });
    }

    if (body.action === 'removePlayer') {
      const { playerId } = body;
      if (!playerId) return fail('playerId is required');

      // Keep the roster honest: a player who has already played for this team
      // in a live or finished match stays on the list.
      const usedInMatch = await prisma.matchPlayer.findFirst({
        where: {
          playerId,
          teamId: team.id,
          match: { status: { in: ['LIVE', 'INNINGS_BREAK', 'COMPLETED'] } },
        },
        include: { match: true },
      });
      if (usedInMatch) {
        return fail('This player has already played a match for the team and cannot be removed');
      }

      await prisma.teamPlayer.deleteMany({ where: { teamId: team.id, playerId } });
      const updated = await prisma.team.findUnique({
        where: { id: team.id },
        include: { players: { include: { player: true } } },
      });
      return NextResponse.json({ success: true, team: updated });
    }

    // Plain field edits
    const data: any = {};
    if (body.name !== undefined) {
      const clean = String(body.name).trim();
      if (!clean) return fail('Team name cannot be empty');
      const clash = await prisma.team.findFirst({
        where: { name: clean, NOT: { id: team.id } },
      });
      if (clash) return fail(`A team named "${clean}" already exists`);
      data.name = clean;
    }
    if (body.shortName !== undefined) {
      const clean = String(body.shortName).trim().toUpperCase();
      if (!clean) return fail('Short name cannot be empty');
      if (clean.length > 5) return fail('Short name must be 5 characters or fewer');
      data.shortName = clean;
    }
    if (body.manager !== undefined) data.manager = String(body.manager).trim() || null;
    if (body.contact !== undefined) data.contact = String(body.contact).trim() || null;
    if (body.homeVenue !== undefined) data.homeVenue = String(body.homeVenue).trim() || null;
    if (body.captainId !== undefined) data.captainId = body.captainId || null;
    if (body.viceCaptainId !== undefined) data.viceCaptainId = body.viceCaptainId || null;

    if (Object.keys(data).length === 0) return fail('Nothing to update');

    const updated = await prisma.team.update({ where: { id: team.id }, data });
    return NextResponse.json({ success: true, team: updated });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const team = await prisma.team.findUnique({
      where: { id: (await params).id },
      include: {
        _count: { select: { homeMatches: true, awayMatches: true, tournaments: true } },
      },
    });
    if (!team) return fail('Team not found', 404);

    const matchCount = team._count.homeMatches + team._count.awayMatches;

    // Match rows point at teams without a cascade, so deleting a team that is
    // still in a fixture would break those matches. Ask before taking them.
    if (matchCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error: `"${team.name}" appears in ${matchCount} match${matchCount === 1 ? '' : 'es'}. Deleting the team deletes those matches too.`,
          matchCount,
          tournamentCount: team._count.tournaments,
        },
        { status: 409 }
      );
    }

    const affectedTournamentIds = (
      await prisma.match.findMany({
        where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }], tournamentId: { not: null } },
        select: { tournamentId: true },
        distinct: ['tournamentId'],
      })
    ).map((m) => m.tournamentId!) as string[];

    await prisma.match.deleteMany({
      where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
    });
    await prisma.team.delete({ where: { id: team.id } });

    const { recalculateTournamentTable } = await import('@/lib/tournamentStats');
    for (const tid of affectedTournamentIds) {
      await recalculateTournamentTable(tid);
    }

    return NextResponse.json({ success: true, message: `Team "${team.name}" deleted` });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
