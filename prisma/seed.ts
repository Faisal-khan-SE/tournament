import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Resets the database and loads a small starter set of teams and players.
 *
 * WARNING: this deletes everything first. It is meant for a fresh install or a
 * clean demo, not for a database with real matches in it.
 */

const TEAMS = [
  {
    name: 'Shahodi Strikers',
    short: 'SST',
    manager: 'Shahodi Club',
    players: [
      { name: 'Faisal', role: 'BATSMAN', bat: 'Right-hand bat', bowl: 'Right-arm medium' },
      { name: 'Zain', role: 'ALL_ROUNDER', bat: 'Left-hand bat', bowl: 'Right-arm off-spin' },
      { name: 'Faraz', role: 'BOWLER', bat: 'Right-hand bat', bowl: 'Right-arm fast' },
      { name: 'Sohail', role: 'WICKETKEEPER', bat: 'Right-hand bat', bowl: 'Does not bowl' },
      { name: 'Adnan', role: 'ALL_ROUNDER', bat: 'Right-hand bat', bowl: 'Right-arm leg-spin' },
      { name: 'Bilal', role: 'BATSMAN', bat: 'Left-hand bat', bowl: 'Right-arm medium' },
    ],
  },
  {
    name: 'Rawalpindi Riders',
    short: 'RPR',
    manager: 'Riders Club',
    players: [
      { name: 'Hasnain', role: 'BATSMAN', bat: 'Right-hand bat', bowl: 'Right-arm medium' },
      { name: 'Shahid', role: 'ALL_ROUNDER', bat: 'Right-hand bat', bowl: 'Left-arm spin' },
      { name: 'Zahid', role: 'BOWLER', bat: 'Right-hand bat', bowl: 'Left-arm fast' },
      { name: 'Mudassir', role: 'WICKETKEEPER', bat: 'Left-hand bat', bowl: 'Does not bowl' },
      { name: 'Kamran', role: 'ALL_ROUNDER', bat: 'Right-hand bat', bowl: 'Right-arm off-spin' },
      { name: 'Naveed', role: 'BATSMAN', bat: 'Right-hand bat', bowl: 'Right-arm medium' },
    ],
  },
];

async function main() {
  console.log('Resetting the database…');

  // Order matters: children before parents, since several relations do not cascade.
  await prisma.wicket.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.matchInnings.deleteMany();
  await prisma.battingScore.deleteMany();
  await prisma.bowlingFigure.deleteMany();
  await prisma.matchPlayer.deleteMany();
  await prisma.knockoutMatch.deleteMany();
  await prisma.pointsEntry.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.teamPlayer.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.player.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  let jersey = 1;

  for (const t of TEAMS) {
    const team = await prisma.team.create({
      data: {
        name: t.name,
        shortName: t.short,
        manager: t.manager,
        homeVenue: 'Shahodi Cricket Ground',
      },
    });

    for (const p of t.players) {
      const player = await prisma.player.create({
        data: {
          fullName: p.name,
          jerseyNumber: jersey++,
          role: p.role,
          battingStyle: p.bat,
          bowlingStyle: p.bowl,
        },
      });
      await prisma.teamPlayer.create({ data: { teamId: team.id, playerId: player.id } });
    }

    console.log(`  ${t.name} — ${t.players.length} players`);
  }

  const teams = await prisma.team.count();
  const players = await prisma.player.count();
  console.log(`\nDone. ${teams} teams and ${players} players ready.`);
  console.log('Open the app and create a single match or a tournament to start scoring.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
