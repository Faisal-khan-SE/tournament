import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { FixtureGenerator } from '@/lib/FixtureGenerator';
import { cleanGroupName, createTeamWithPlayers, fixturePools } from '@/lib/tournamentTeams';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'tournament'}-${Date.now().toString(36)}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q');

    const tournaments = await prisma.tournament.findMany({
      where: search ? { OR: [{ name: { contains: search } }, { venue: { contains: search } }] } : undefined,
      include: {
        teams: { include: { team: true } },
        matches: { select: { id: true, status: true, stage: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withProgress = tournaments.map((t) => {
      const league = t.matches.filter((m) => m.stage === 'LEAGUE');
      const done = t.matches.filter((m) => m.status === 'COMPLETED' || m.status === 'ABANDONED');
      const live = t.matches.filter((m) => m.status === 'LIVE' || m.status === 'INNINGS_BREAK');
      return {
        ...t,
        progress: {
          total: t.matches.length,
          league: league.length,
          completed: done.length,
          live: live.length,
        },
      };
    });

    return NextResponse.json({ success: true, tournaments: withProgress });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      venue,
      startDate = new Date(),
      endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ballType = 'TAPE_BALL',
      defaultOvers = 6,
      format = 'LEAGUE_AND_KNOCKOUT',
      rules,
      contactInfo,
      teamIds = [],
      // Richer form: [{ teamId } | { name, shortName?, players? }] each with an
      // optional groupName. `teamIds` is kept for older callers.
      teams = [],
      matchesPerTeam,
      // Fixtures are generated on request from the tournament page, so the
      // organiser can still shuffle teams and groups after creating it.
      generateFixtures = false,
    } = body;

    const cleanName = (name || '').trim();
    const cleanVenue = (venue || '').trim();

    if (!cleanName) return fail('Tournament name is required');
    if (!cleanVenue) return fail('Venue is required');

    const overs = Number(defaultOvers);
    if (!Number.isInteger(overs) || overs < 1 || overs > 50) {
      return fail('Overs must be a whole number between 1 and 50');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime())) return fail('Invalid start date');
    if (Number.isNaN(end.getTime())) return fail('Invalid end date');
    if (end < start) return fail('End date cannot be before the start date');

    // Resolve the team list before touching the database, so a bad entry
    // fails the whole request instead of leaving a half-built tournament.
    type Entry = { teamId?: string; name?: string; shortName?: string; players?: string[]; groupName: string | null };
    const entries: Entry[] = [];
    try {
      for (const id of teamIds as string[]) entries.push({ teamId: id, groupName: null });
      for (const t of teams as any[]) {
        entries.push({
          teamId: t.teamId || undefined,
          name: t.name,
          shortName: t.shortName,
          players: Array.isArray(t.players) ? t.players : [],
          groupName: cleanGroupName(t.groupName),
        });
      }
    } catch (e: any) {
      return fail(e.message);
    }

    const existingIds = entries.filter((e) => e.teamId).map((e) => e.teamId!);
    if (new Set(existingIds).size !== existingIds.length) return fail('A team is listed twice');
    if (existingIds.length > 0) {
      const found = await prisma.team.findMany({ where: { id: { in: existingIds } } });
      if (found.length !== existingIds.length) return fail('One or more selected teams no longer exist');
    }
    const newNames = entries.filter((e) => !e.teamId).map((e) => (e.name || '').trim().toLowerCase());
    if (newNames.some((n) => !n)) return fail('Every new team needs a name');
    if (new Set(newNames).size !== newNames.length) return fail('Two new teams have the same name');

    if (matchesPerTeam !== undefined) {
      const perTeam = Number(matchesPerTeam);
      if (!Number.isInteger(perTeam) || perTeam < 1) return fail('Matches per team must be at least 1');
      if (entries.length >= 2 && generateFixtures) {
        const schedule = FixtureGenerator.validate(entries.length, perTeam);
        if (!schedule.ok) return fail(schedule.reason!);
      }
    }

    const tournament = await prisma.tournament.create({
      data: {
        name: cleanName,
        slug: slugify(cleanName),
        description: description || null,
        venue: cleanVenue,
        startDate: start,
        endDate: end,
        ballType,
        defaultOvers: overs,
        numberOfTeams: entries.length,
        format,
        rules: rules || null,
        contactInfo: contactInfo || null,
      },
    });

    const members: { teamId: string; groupName: string | null }[] = [];
    try {
      for (const entry of entries) {
        const teamId = entry.teamId || (await createTeamWithPlayers(entry)).id;
        members.push({ teamId, groupName: entry.groupName });
        await prisma.tournamentTeam.create({
          data: { tournamentId: tournament.id, teamId, groupName: entry.groupName },
        });
        await prisma.pointsEntry.create({
          data: { tournamentId: tournament.id, teamId, groupName: entry.groupName },
        });
      }
    } catch (e: any) {
      // Roll back so the organiser can fix the form and resubmit.
      await prisma.tournament.delete({ where: { id: tournament.id } });
      return fail(e.message);
    }

    let fixtureCount = 0;
    if (generateFixtures && members.length >= 2) {
      let pools;
      try {
        pools = fixturePools(members);
      } catch (e: any) {
        await prisma.tournament.delete({ where: { id: tournament.id } });
        return fail(e.message);
      }
      let matchNo = 0;
      for (const pool of pools) {
        const fixtures =
          matchesPerTeam !== undefined && pool.groupName === null
            ? FixtureGenerator.generateLeagueFixtures(pool.teamIds, Number(matchesPerTeam))
            : FixtureGenerator.generateRoundRobin(pool.teamIds);
        for (const f of fixtures) {
          matchNo += 1;
          await prisma.match.create({
            data: {
              matchType: 'TOURNAMENT',
              tournamentId: tournament.id,
              stage: 'LEAGUE',
              groupName: pool.groupName,
              matchNo,
              homeTeamId: f.homeTeamId,
              awayTeamId: f.awayTeamId,
              venue: cleanVenue,
              date: new Date(start.getTime() + (matchNo - 1) * 2 * 60 * 60 * 1000),
              overs,
              ballType,
              status: 'SCHEDULED',
            },
          });
        }
      }
      fixtureCount = matchNo;
    }

    return NextResponse.json({ success: true, tournament, fixtureCount });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
