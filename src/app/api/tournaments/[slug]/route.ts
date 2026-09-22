import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { KnockoutEngine } from '@/lib/KnockoutEngine';
import { FixtureGenerator } from '@/lib/FixtureGenerator';
import { recalculateTournamentTable, buildLeaderboards } from '@/lib/tournamentStats';
import { advanceKnockoutWinners, knockoutSlotStatus } from '@/lib/scorebook';
import { cleanGroupName, createTeamWithPlayers, fixturePools } from '@/lib/tournamentTeams';

function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

const KNOCKOUT_ORDER = ['QF1', 'QF2', 'QF3', 'QF4', 'SF1', 'SF2', 'FINAL'];

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const tournament = await prisma.tournament.findUnique({
      where: { slug },
      include: {
        teams: { include: { team: { include: { players: true } } } },
        matches: {
          include: { homeTeam: true, awayTeam: true, winnerTeam: true, potm: true, innings: true },
          orderBy: [{ date: 'asc' }],
        },
        pointsTable: {
          include: { team: true },
          orderBy: [{ groupName: 'asc' }, { points: 'desc' }, { nrr: 'desc' }, { won: 'desc' }],
        },
        knockoutMatches: {
          include: {
            match: {
              include: { homeTeam: true, awayTeam: true, winnerTeam: true, innings: true },
            },
          },
        },
      },
    });

    if (!tournament) return fail('Tournament not found', 404);

    const { topBatsmen, topBowlers } = await buildLeaderboards(tournament.id);

    const leagueMatches = tournament.matches.filter((m) => m.stage === 'LEAGUE');
    const leagueComplete =
      leagueMatches.length > 0 &&
      leagueMatches.every((m) => m.status === 'COMPLETED' || m.status === 'ABANDONED');

    // Tell the bracket which slots are still placeholders, so it can show
    // "Winner of SF1" instead of the seeded stand-in team.
    const knockoutByStage = new Map(tournament.knockoutMatches.map((k) => [k.stage, k.match]));
    const knockoutMatches = tournament.knockoutMatches.map((k) => ({
      ...k,
      slot: knockoutSlotStatus(k.stage, knockoutByStage),
    }));

    const finalMatch = tournament.knockoutMatches.find((k) => k.stage === 'FINAL');
    const champion =
      finalMatch?.match.status === 'COMPLETED' ? finalMatch.match.winnerTeam : null;

    return NextResponse.json({
      success: true,
      tournament: { ...tournament, knockoutMatches },
      topBatsmen: topBatsmen.slice(0, 15),
      topBowlers: topBowlers.slice(0, 15),
      progress: {
        leagueTotal: leagueMatches.length,
        leaguePlayed: leagueMatches.filter(
          (m) => m.status === 'COMPLETED' || m.status === 'ABANDONED'
        ).length,
        leagueComplete,
        hasKnockouts: tournament.knockoutMatches.length > 0,
        champion,
      },
    });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await request.json();
    const { action } = body;

    const tournament = await prisma.tournament.findUnique({
      where: { slug },
      include: {
        teams: true,
        matches: true,
        pointsTable: {
          include: { team: true },
          orderBy: [{ points: 'desc' }, { nrr: 'desc' }, { won: 'desc' }],
        },
        knockoutMatches: { include: { match: true } },
      },
    });

    if (!tournament) return fail('Tournament not found', 404);

    // ------------------------------------------------------------------
    // KNOCKOUT BRACKET
    // ------------------------------------------------------------------
    if (action === 'generateKnockouts') {
      const { force = false } = body;

      if (tournament.knockoutMatches.length > 0) {
        if (!force) {
          return NextResponse.json(
            {
              success: false,
              requiresConfirmation: true,
              error:
                'A knockout bracket already exists. Regenerating deletes the current bracket and any scores in it.',
            },
            { status: 409 }
          );
        }
        // Regenerating wipes the old bracket so seeds cannot be duplicated.
        const oldMatchIds = tournament.knockoutMatches.map((k) => k.matchId);
        await prisma.match.deleteMany({ where: { id: { in: oldMatchIds } } });
      }

      await recalculateTournamentTable(tournament.id);
      const standings = await prisma.pointsEntry.findMany({
        where: { tournamentId: tournament.id },
        orderBy: [{ points: 'desc' }, { nrr: 'desc' }, { won: 'desc' }],
      });

      const qualified = standings.map((p) => p.teamId);
      if (qualified.length < 4) {
        return fail('At least 4 teams are needed to build a knockout bracket');
      }

      // With two or four groups, cross the group winners and runners-up
      // (A1 v B2, B1 v A2 …) instead of ranking everyone in one list.
      const groupOrder = Array.from(
        new Set(standings.map((p) => p.groupName).filter((g): g is string => Boolean(g)))
      ).sort();
      const topOf = (group: string, n: number) =>
        standings.filter((p) => p.groupName === group).slice(0, n).map((p) => p.teamId);
      const groupSeeding = (() => {
        if (groupOrder.length !== 2 && groupOrder.length !== 4) return null;
        if (groupOrder.some((g) => topOf(g, 2).length < 2)) return null;
        const [a, b, c, d] = groupOrder.map((g) => topOf(g, 2));
        if (groupOrder.length === 2) {
          return {
            useQuarters: false,
            pairings: [
              { stage: 'SF1' as const, homeTeamId: a[0], awayTeamId: b[1] },
              { stage: 'SF2' as const, homeTeamId: b[0], awayTeamId: a[1] },
            ],
          };
        }
        return {
          useQuarters: true,
          pairings: [
            { stage: 'QF1' as const, homeTeamId: a[0], awayTeamId: b[1] },
            { stage: 'QF2' as const, homeTeamId: c[0], awayTeamId: d[1] },
            { stage: 'QF3' as const, homeTeamId: b[0], awayTeamId: a[1] },
            { stage: 'QF4' as const, homeTeamId: d[0], awayTeamId: c[1] },
          ],
        };
      })();

      const leagueMatches = tournament.matches.filter((m) => m.stage === 'LEAGUE');
      const pending = leagueMatches.filter(
        (m) => m.status !== 'COMPLETED' && m.status !== 'ABANDONED'
      );
      if (pending.length > 0 && !force) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            error: `${pending.length} league match${pending.length === 1 ? ' is' : 'es are'} still unplayed. Seeding now uses the current standings.`,
          },
          { status: 409 }
        );
      }

      const useQuarters = groupSeeding ? groupSeeding.useQuarters : qualified.length >= 8;
      const pairings = groupSeeding
        ? groupSeeding.pairings
        : useQuarters
        ? KnockoutEngine.generateQuarterFinals(qualified.slice(0, 8))
        : KnockoutEngine.generateSemiFinalsFrom4Teams(qualified.slice(0, 4));

      // Placeholder rounds so the bracket is visible end-to-end from day one;
      // `advanceKnockoutWinners` fills the teams in as results come through.
      const placeholders: string[] = useQuarters ? ['SF1', 'SF2', 'FINAL'] : ['FINAL'];

      const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      let offset = 0;

      const createKnockout = async (stage: string, homeTeamId: string, awayTeamId: string) => {
        const created = await prisma.match.create({
          data: {
            matchType: 'TOURNAMENT',
            tournamentId: tournament.id,
            stage,
            homeTeamId,
            awayTeamId,
            venue: tournament.venue,
            date: new Date(baseDate.getTime() + offset * 3 * 60 * 60 * 1000),
            overs: tournament.defaultOvers,
            ballType: tournament.ballType,
            status: 'SCHEDULED',
          },
        });
        offset += 1;
        await prisma.knockoutMatch.create({
          data: { tournamentId: tournament.id, matchId: created.id, stage },
        });
      };

      for (const pairing of pairings) {
        if (!pairing.homeTeamId || !pairing.awayTeamId) continue;
        await createKnockout(pairing.stage, pairing.homeTeamId, pairing.awayTeamId);
      }

      // Later rounds start seeded with the top two so the fixture is valid;
      // they are overwritten the moment the feeding matches finish.
      for (const stage of placeholders) {
        await createKnockout(stage, qualified[0], qualified[1]);
      }

      await advanceKnockoutWinners(tournament.id);

      return NextResponse.json({
        success: true,
        message: `${useQuarters ? 'Quarter-final' : 'Semi-final'} bracket generated${
          groupSeeding ? ' from the group standings' : ''
        }`,
      });
    }

    if (action === 'resetKnockouts') {
      const ids = tournament.knockoutMatches.map((k) => k.matchId);
      if (ids.length === 0) return fail('There is no knockout bracket to remove');
      await prisma.match.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ success: true, message: 'Knockout bracket removed' });
    }

    if (action === 'advanceKnockouts') {
      await advanceKnockoutWinners(tournament.id);
      return NextResponse.json({ success: true, message: 'Bracket updated with the latest results' });
    }

    // ------------------------------------------------------------------
    // TEAMS
    // ------------------------------------------------------------------
    const joinTournament = async (teamId: string, groupName: string | null) => {
      await prisma.tournamentTeam.create({ data: { tournamentId: tournament.id, teamId, groupName } });
      await prisma.pointsEntry.upsert({
        where: { tournamentId_teamId: { tournamentId: tournament.id, teamId } },
        update: { groupName },
        create: { tournamentId: tournament.id, teamId, groupName },
      });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { numberOfTeams: tournament.teams.length + 1 },
      });
      await recalculateTournamentTable(tournament.id);
    };

    if (action === 'addTeam') {
      const { teamId } = body;
      if (!teamId) return fail('teamId is required');
      const team = await prisma.team.findUnique({ where: { id: teamId } });
      if (!team) return fail('Team not found', 404);

      const already = tournament.teams.some((t) => t.teamId === teamId);
      if (already) return fail(`${team.name} is already in this tournament`);

      let groupName: string | null;
      try {
        groupName = cleanGroupName(body.groupName);
      } catch (e: any) {
        return fail(e.message);
      }
      await joinTournament(teamId, groupName);

      return NextResponse.json({ success: true, message: `${team.name} added` });
    }

    // A brand-new team typed straight into the tournament: name, players, group.
    if (action === 'createTeam') {
      let groupName: string | null;
      let team;
      try {
        groupName = cleanGroupName(body.groupName);
        team = await createTeamWithPlayers({
          name: body.name,
          shortName: body.shortName,
          players: Array.isArray(body.players) ? body.players : [],
        });
      } catch (e: any) {
        return fail(e.message);
      }
      await joinTournament(team.id, groupName);
      return NextResponse.json({ success: true, message: `${team.name} created and added`, team });
    }

    // Move a team between groups (or out of all groups). Only while its
    // fixtures have not started, since the schedule is built per group.
    if (action === 'setGroup') {
      const { teamId } = body;
      const membership = tournament.teams.find((t) => t.teamId === teamId);
      if (!membership) return fail('That team is not in this tournament', 404);

      let groupName: string | null;
      try {
        groupName = cleanGroupName(body.groupName);
      } catch (e: any) {
        return fail(e.message);
      }

      const started = await prisma.match.count({
        where: {
          tournamentId: tournament.id,
          stage: 'LEAGUE',
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          status: { not: 'SCHEDULED' },
        },
      });
      if (started > 0) return fail('This team has already played league matches and cannot change group');

      await prisma.tournamentTeam.update({ where: { id: membership.id }, data: { groupName } });
      await prisma.pointsEntry.updateMany({
        where: { tournamentId: tournament.id, teamId },
        data: { groupName },
      });
      await recalculateTournamentTable(tournament.id);
      return NextResponse.json({ success: true, message: groupName ? `Moved to Group ${groupName}` : 'Group cleared' });
    }

    if (action === 'removeTeam') {
      const { teamId, force = false } = body;
      if (!teamId) return fail('teamId is required');

      const playedMatches = await prisma.match.count({
        where: {
          tournamentId: tournament.id,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
          status: { in: ['LIVE', 'INNINGS_BREAK', 'COMPLETED'] },
        },
      });
      if (playedMatches > 0) {
        return fail('This team has already played in the tournament and cannot be removed');
      }

      const scheduled = await prisma.match.count({
        where: {
          tournamentId: tournament.id,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      });
      if (scheduled > 0 && !force) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            error: `This team has ${scheduled} scheduled fixture${scheduled === 1 ? '' : 's'} which will be deleted.`,
          },
          { status: 409 }
        );
      }

      await prisma.match.deleteMany({
        where: {
          tournamentId: tournament.id,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
      });
      await prisma.tournamentTeam.deleteMany({ where: { tournamentId: tournament.id, teamId } });
      await prisma.pointsEntry.deleteMany({ where: { tournamentId: tournament.id, teamId } });
      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { numberOfTeams: Math.max(0, tournament.teams.length - 1) },
      });
      await recalculateTournamentTable(tournament.id);

      return NextResponse.json({ success: true, message: 'Team removed from tournament' });
    }

    // ------------------------------------------------------------------
    // FIXTURES
    // ------------------------------------------------------------------
    if (action === 'generateFixtures') {
      const { matchesPerTeam, force = false } = body;
      const teamIds = tournament.teams.map((t) => t.teamId);
      if (teamIds.length < 2) return fail('At least 2 teams are needed to generate fixtures');

      // Every team plays every other team in its group. Without groups the
      // whole field is one pool; `matchesPerTeam` can shorten that pool only.
      let pools;
      try {
        pools = fixturePools(tournament.teams.map((t) => ({ teamId: t.teamId, groupName: t.groupName })));
      } catch (e: any) {
        return fail(e.message);
      }
      const usePerTeam = matchesPerTeam !== undefined && pools.length === 1 && pools[0].groupName === null;
      if (usePerTeam) {
        const schedule = FixtureGenerator.validate(teamIds.length, Number(matchesPerTeam));
        if (!schedule.ok) return fail(schedule.reason!);
      }
      const lonely = pools.find((p) => p.teamIds.length < 2);
      if (lonely) return fail(`Group ${lonely.groupName} has only one team — add another or move it`);

      const existingLeague = tournament.matches.filter((m) => m.stage === 'LEAGUE');
      const playedLeague = existingLeague.filter((m) => m.status !== 'SCHEDULED');

      if (playedLeague.length > 0) {
        return fail(
          `${playedLeague.length} league match${playedLeague.length === 1 ? ' has' : 'es have'} already started. Delete them individually before regenerating.`
        );
      }
      if (existingLeague.length > 0 && !force) {
        return NextResponse.json(
          {
            success: false,
            requiresConfirmation: true,
            error: `${existingLeague.length} scheduled league fixture${existingLeague.length === 1 ? '' : 's'} will be replaced.`,
          },
          { status: 409 }
        );
      }

      await prisma.match.deleteMany({
        where: { tournamentId: tournament.id, stage: 'LEAGUE' },
      });

      const start = new Date(tournament.startDate);
      let matchNo = 0;

      for (const pool of pools) {
        const fixtures = usePerTeam
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
              venue: tournament.venue,
              date: new Date(start.getTime() + (matchNo - 1) * 2 * 60 * 60 * 1000),
              overs: tournament.defaultOvers,
              ballType: tournament.ballType,
              status: 'SCHEDULED',
            },
          });
        }
      }

      await recalculateTournamentTable(tournament.id);
      const groupNote = pools[0].groupName ? ` across ${pools.length} group${pools.length === 1 ? '' : 's'}` : '';
      return NextResponse.json({
        success: true,
        message: `${matchNo} league fixture${matchNo === 1 ? '' : 's'} generated${groupNote}`,
      });
    }

    if (action === 'addFixture') {
      const { homeTeamId, awayTeamId, venue, date, overs, stage = 'LEAGUE' } = body;
      if (!homeTeamId || !awayTeamId) return fail('Both teams are required');
      if (homeTeamId === awayTeamId) return fail('A team cannot play against itself');

      const teamIds = tournament.teams.map((t) => t.teamId);
      if (!teamIds.includes(homeTeamId) || !teamIds.includes(awayTeamId)) {
        return fail('Both teams must be part of this tournament');
      }

      const groupOfHome = tournament.teams.find((t) => t.teamId === homeTeamId)?.groupName || null;
      const groupOfAway = tournament.teams.find((t) => t.teamId === awayTeamId)?.groupName || null;

      const created = await prisma.match.create({
        data: {
          matchType: 'TOURNAMENT',
          tournamentId: tournament.id,
          stage,
          groupName: stage === 'LEAGUE' && groupOfHome && groupOfHome === groupOfAway ? groupOfHome : null,
          homeTeamId,
          awayTeamId,
          venue: (venue || tournament.venue).trim(),
          date: date ? new Date(date) : new Date(),
          overs: Number(overs) || tournament.defaultOvers,
          ballType: tournament.ballType,
          status: 'SCHEDULED',
        },
      });

      if (stage !== 'LEAGUE' && KNOCKOUT_ORDER.includes(stage)) {
        await prisma.knockoutMatch.create({
          data: { tournamentId: tournament.id, matchId: created.id, stage },
        });
      }

      return NextResponse.json({ success: true, match: created });
    }

    if (action === 'recalculate') {
      await recalculateTournamentTable(tournament.id);
      await advanceKnockoutWinners(tournament.id);
      return NextResponse.json({ success: true, message: 'Standings recalculated' });
    }

    return fail(`Unknown action: ${action}`);
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await request.json();
    const tournament = await prisma.tournament.findUnique({ where: { slug: (await params).slug } });
    if (!tournament) return fail('Tournament not found', 404);

    const data: any = {};
    if (body.name !== undefined) {
      const clean = String(body.name).trim();
      if (!clean) return fail('Tournament name cannot be empty');
      data.name = clean;
    }
    if (body.venue !== undefined) {
      const clean = String(body.venue).trim();
      if (!clean) return fail('Venue cannot be empty');
      data.venue = clean;
    }
    if (body.description !== undefined) data.description = body.description;
    if (body.rules !== undefined) data.rules = body.rules;
    if (body.contactInfo !== undefined) data.contactInfo = body.contactInfo;
    if (body.ballType !== undefined) data.ballType = body.ballType;
    if (body.format !== undefined) data.format = body.format;
    if (body.defaultOvers !== undefined) {
      const overs = Number(body.defaultOvers);
      if (!Number.isInteger(overs) || overs < 1 || overs > 50) {
        return fail('Overs must be a whole number between 1 and 50');
      }
      data.defaultOvers = overs;
    }
    if (body.startDate !== undefined) {
      const d = new Date(body.startDate);
      if (Number.isNaN(d.getTime())) return fail('Invalid start date');
      data.startDate = d;
    }
    if (body.endDate !== undefined) {
      const d = new Date(body.endDate);
      if (Number.isNaN(d.getTime())) return fail('Invalid end date');
      data.endDate = d;
    }

    const start = data.startDate || tournament.startDate;
    const end = data.endDate || tournament.endDate;
    if (end < start) return fail('End date cannot be before the start date');

    if (Object.keys(data).length === 0) return fail('Nothing to update');

    const updated = await prisma.tournament.update({ where: { id: tournament.id }, data });

    // Only fixtures that have not begun inherit a new default over count.
    if (data.defaultOvers !== undefined) {
      await prisma.match.updateMany({
        where: { tournamentId: tournament.id, status: 'SCHEDULED' },
        data: { overs: data.defaultOvers },
      });
    }

    return NextResponse.json({ success: true, tournament: updated });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const tournament = await prisma.tournament.findUnique({
      where: { slug: (await params).slug },
      include: { _count: { select: { matches: true } } },
    });
    if (!tournament) return fail('Tournament not found', 404);

    const playedCount = await prisma.match.count({
      where: { tournamentId: tournament.id, status: { not: 'SCHEDULED' } },
    });

    if (playedCount > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          requiresConfirmation: true,
          error: `"${tournament.name}" has ${playedCount} played match${playedCount === 1 ? '' : 'es'}. Deleting removes all of their scorecards permanently.`,
          playedCount,
          matchCount: tournament._count.matches,
        },
        { status: 409 }
      );
    }

    // Matches cascade from the tournament, taking innings, deliveries and cards.
    await prisma.match.deleteMany({ where: { tournamentId: tournament.id } });
    await prisma.tournament.delete({ where: { id: tournament.id } });

    return NextResponse.json({ success: true, message: `Tournament "${tournament.name}" deleted` });
  } catch (error: any) {
    return fail(error.message, 500);
  }
}
