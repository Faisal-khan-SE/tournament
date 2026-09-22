import { prisma } from './db';

export { GROUP_NAMES, cleanGroupName } from './groups';

export interface NewTeamInput {
  name?: string;
  shortName?: string;
  players?: string[];
}

/**
 * Creates a team from the organiser's typed-in name and player list.
 *
 * Players are matched by name so a player who already exists in the directory
 * keeps their career statistics rather than being duplicated.
 */
export async function createTeamWithPlayers(input: NewTeamInput) {
  const cleanName = (input.name || '').trim();
  if (!cleanName) throw new Error('Team name is required');

  // Short name defaults to the initials ("Shahodi Strikers" -> "SS").
  const typedShort = (input.shortName || '').trim().toUpperCase().slice(0, 5);
  const initials = cleanName
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 5);
  const finalShort = typedShort || initials || cleanName.slice(0, 3).toUpperCase();

  const clash = await prisma.team.findFirst({ where: { name: cleanName } });
  if (clash) throw new Error(`A team named "${cleanName}" already exists — add it as an existing team instead`);

  const names = (input.players || []).map((n) => String(n || '').trim()).filter(Boolean);
  const seen = new Set<string>();
  for (const n of names) {
    const key = n.toLowerCase();
    if (seen.has(key)) throw new Error(`"${n}" is listed twice in ${cleanName}`);
    seen.add(key);
  }

  const team = await prisma.team.create({ data: { name: cleanName, shortName: finalShort } });

  for (const fullName of names) {
    let player = await prisma.player.findFirst({ where: { fullName } });
    if (!player) player = await prisma.player.create({ data: { fullName } });
    await prisma.teamPlayer.upsert({
      where: { teamId_playerId: { teamId: team.id, playerId: player.id } },
      update: {},
      create: { teamId: team.id, playerId: player.id },
    });
  }

  return team;
}

/**
 * Splits a tournament's teams into fixture pools.
 *
 * Either every team has a group or none does; a half-assigned tournament is
 * refused so nobody is silently left out of the schedule.
 */
export function fixturePools(
  teams: { teamId: string; groupName: string | null }[]
): { groupName: string | null; teamIds: string[] }[] {
  const grouped = teams.filter((t) => t.groupName);
  if (grouped.length === 0) return [{ groupName: null, teamIds: teams.map((t) => t.teamId) }];
  if (grouped.length !== teams.length) {
    const missing = teams.length - grouped.length;
    throw new Error(
      `${missing} team${missing === 1 ? ' has' : 's have'} no group. Put every team in a group, or clear all groups to play a single league.`
    );
  }
  const pools = new Map<string, string[]>();
  for (const t of grouped) {
    const list = pools.get(t.groupName!) || [];
    list.push(t.teamId);
    pools.set(t.groupName!, list);
  }
  return Array.from(pools.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([groupName, teamIds]) => ({ groupName, teamIds }));
}
