// Tournament set-up the organiser's way: teams and players typed straight into
// the form, groups, fixtures only on request (full round-robin inside each
// group), group standings and cross-group knockout seeding.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
// With ADMIN_PASSWORD set, writes need the organiser session; send it as a Bearer token.
const AUTH_HEADERS = { 'Content-Type': 'application/json', ...(process.env.ADMIN_PASSWORD ? { Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` } : {}) };
let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' :: ' + detail : ''}`); console.log(`  FAIL ${name} ${detail || ''}`); }
}
async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: AUTH_HEADERS, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ...json };
}

const rid = Math.random().toString(36).slice(2, 7);

async function cleanupPlayers(tag) {
  try {
    const listed = await api(`/api/players?q=${encodeURIComponent(tag)}`);
    for (const p of listed.players || []) {
      await api(`/api/players/${p.id}?force=true`, { method: 'DELETE' });
    }
  } catch { /* best effort */ }
}

const players = (prefix) => [1, 2, 3].map((n) => `${prefix}${n} ${rid}`);
const league = (det) => det.tournament.matches.filter((m) => m.stage === 'LEAGUE');

/** Plays a whole 1-over-a-side match so `winnerTeamId` wins by a clear margin. */
async function playMatch(matchId, winnerTeamId) {
  let st = await api(`/api/matches/${matchId}`);
  // Tournament fixtures start without squads; field each team's full roster.
  for (const team of [st.match.homeTeam, st.match.awayTeam]) {
    await api(`/api/matches/${matchId}`, { method: 'POST', body: {
      action: 'setSquad', teamId: team.id,
      players: team.players.map((tp) => ({ playerName: tp.player.fullName, playerId: tp.player.id })) } });
  }
  st = await api(`/api/matches/${matchId}`);
  const m = st.match;
  const loserId = m.homeTeamId === winnerTeamId ? m.awayTeamId : m.homeTeamId;
  const squad = (teamId) => m.squadPlayers.filter((s) => s.teamId === teamId).map((s) => s.playerId);
  await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: winnerTeamId, tossDecision: 'BAT' } });
  let state = await api(`/api/matches/${matchId}`);
  let inningsId = state.match.innings[0].id;
  const w = squad(winnerTeamId), l = squad(loserId);
  for (let i = 0; i < 6; i++) {
    await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'delivery', inningsId, strikerId: w[0], nonStrikerId: w[1], bowlerId: l[0], runsBat: 6 } });
  }
  state = await api(`/api/matches/${matchId}`);
  inningsId = state.match.innings[1].id;
  for (let i = 0; i < 6; i++) {
    await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'delivery', inningsId, strikerId: l[0], nonStrikerId: l[1], bowlerId: w[0], runsBat: 0 } });
  }
  state = await api(`/api/matches/${matchId}`);
  return state.match;
}

async function main() {
  console.log('\n=== CREATE WITH TYPED-IN TEAMS, PLAYERS AND GROUPS ===');
  const t = await api('/api/tournaments', { method: 'POST', body: {
    name: `Group Cup ${rid}`, venue: 'V', defaultOvers: 1,
    teams: [
      { name: `Lions ${rid}`, players: players('L'), groupName: 'A' },
      { name: `Tigers ${rid}`, shortName: 'TGR', players: players('T'), groupName: 'A' },
      { name: `Eagles ${rid}`, players: players('E'), groupName: 'B' },
      { name: `Hawks ${rid}`, players: players('H'), groupName: 'B' },
    ],
  } });
  check('tournament created from typed-in teams', t.success, JSON.stringify(t).slice(0, 200));
  const slug = t.tournament.slug;

  let det = await api(`/api/tournaments/${slug}`);
  check('four teams registered', det.tournament.teams.length === 4);
  check('teams carry their groups', det.tournament.teams.filter((x) => x.groupName === 'A').length === 2 && det.tournament.teams.filter((x) => x.groupName === 'B').length === 2);
  const lions = det.tournament.teams.find((x) => x.team.name === `Lions ${rid}`);
  const tigers = det.tournament.teams.find((x) => x.team.name === `Tigers ${rid}`);
  check('players were created for a typed-in team', lions.team.players.length === 3, `${lions.team.players.length}`);
  const initials = `Lions ${rid}`.split(' ').map((w) => w[0]).join('').toUpperCase();
  check('short name defaults to the initials', lions.team.shortName === initials, `${lions.team.shortName} v ${initials}`);
  check('a typed short name is kept', tigers.team.shortName === 'TGR', tigers.team.shortName);
  check('no fixtures until the organiser asks', league(det).length === 0, `${league(det).length}`);
  check('points table rows carry the group', det.tournament.pointsTable.every((p) => p.groupName));

  console.log('\n=== VALIDATION ===');
  const dupNew = await api('/api/tournaments', { method: 'POST', body: {
    name: `Dup ${rid}`, venue: 'V', teams: [{ name: `Same ${rid}` }, { name: `same ${rid}` }] } });
  check('two new teams with one name are rejected', !dupNew.success, JSON.stringify(dupNew).slice(0, 150));
  const clash = await api('/api/tournaments', { method: 'POST', body: {
    name: `Clash ${rid}`, venue: 'V', teams: [{ name: `Lions ${rid}` }, { name: `New ${rid}` }] } });
  check('a typed-in team that already exists is rejected with a hint', !clash.success && /existing team/i.test(clash.error || ''), JSON.stringify(clash).slice(0, 150));
  const badGroup = await api('/api/tournaments', { method: 'POST', body: {
    name: `BadG ${rid}`, venue: 'V', teams: [{ name: `X ${rid}`, groupName: 'Z9' }, { name: `Y ${rid}` }] } });
  check('an unknown group label is rejected', !badGroup.success, JSON.stringify(badGroup).slice(0, 150));
  const leftovers = await api(`/api/tournaments?q=${encodeURIComponent(rid)}`);
  check('a failed create leaves no half-built tournament', (leftovers.tournaments || []).length === 1, `${(leftovers.tournaments || []).length}`);

  console.log('\n=== MANAGE: CREATE TEAM INLINE, MOVE GROUPS, REMOVE ===');
  const created = await api(`/api/tournaments/${slug}`, { method: 'POST', body: {
    action: 'createTeam', name: `Wolves ${rid}`, players: players('W'), groupName: 'B' } });
  check('a team can be created from the manage tab', created.success, JSON.stringify(created).slice(0, 150));
  det = await api(`/api/tournaments/${slug}`);
  check('five teams now', det.tournament.teams.length === 5);
  const wolves = det.tournament.teams.find((x) => x.team.name === `Wolves ${rid}`);

  const half = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'setGroup', teamId: wolves.teamId, groupName: null } });
  check('a team can be taken out of its group', half.success);
  const mixed = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateFixtures' } });
  check('fixtures refuse a half-grouped tournament', !mixed.success && /no group/i.test(mixed.error || ''), JSON.stringify(mixed).slice(0, 150));

  const moved = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'setGroup', teamId: wolves.teamId, groupName: 'c' } });
  check('group labels are normalised (c -> C)', moved.success && /Group C/.test(moved.message || ''), JSON.stringify(moved).slice(0, 150));
  const lonely = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateFixtures' } });
  check('a group with one team is refused', !lonely.success && /only one team/i.test(lonely.error || ''), JSON.stringify(lonely).slice(0, 150));

  const removed = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'removeTeam', teamId: wolves.teamId, force: true } });
  check('a team can be removed from the tournament', removed.success, JSON.stringify(removed).slice(0, 150));
  det = await api(`/api/tournaments/${slug}`);
  check('back to four teams', det.tournament.teams.length === 4);

  console.log('\n=== FIXTURES: EVERY TEAM v EVERY OTHER IN ITS GROUP ===');
  const gen = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateFixtures' } });
  check('fixtures generated on request', gen.success && /2 groups/.test(gen.message || ''), JSON.stringify(gen).slice(0, 150));
  det = await api(`/api/tournaments/${slug}`);
  const fixtures = league(det);
  check('two groups of two give two matches', fixtures.length === 2, `${fixtures.length}`);
  check('every fixture is tagged with its group', fixtures.every((m) => m.groupName === 'A' || m.groupName === 'B'));
  const crossGroup = fixtures.filter((m) => {
    const g = (id) => det.tournament.teams.find((x) => x.teamId === id).groupName;
    return g(m.homeTeamId) !== g(m.awayTeamId);
  });
  check('no fixture crosses groups', crossGroup.length === 0);

  // Bigger group: 3 teams must give 3 matches (round robin), not 2.
  const eagles = det.tournament.teams.find((x) => x.team.name === `Eagles ${rid}`);
  const hawks = det.tournament.teams.find((x) => x.team.name === `Hawks ${rid}`);
  const extra = await api(`/api/tournaments/${slug}`, { method: 'POST', body: {
    action: 'createTeam', name: `Bears ${rid}`, players: players('B'), groupName: 'B' } });
  check('third team added to group B', extra.success);
  const regen = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateFixtures', force: true } });
  check('fixtures regenerated', regen.success, JSON.stringify(regen).slice(0, 150));
  det = await api(`/api/tournaments/${slug}`);
  const groupB = league(det).filter((m) => m.groupName === 'B');
  check('three teams in a group play three matches', groupB.length === 3, `${groupB.length}`);
  check('group A still has its single match', league(det).filter((m) => m.groupName === 'A').length === 1);

  console.log('\n=== GROUP STANDINGS AND CROSS-GROUP KNOCKOUTS ===');
  const bears = det.tournament.teams.find((x) => x.team.name === `Bears ${rid}`);
  // Group A: Lions beat Tigers. Group B: Eagles beat both, Hawks beat Bears.
  const groupA = league(det).find((m) => m.groupName === 'A');
  await playMatch(groupA.id, lions.teamId);
  for (const m of groupB) {
    const ids = [m.homeTeamId, m.awayTeamId];
    const winner = ids.includes(eagles.teamId) ? eagles.teamId : hawks.teamId;
    await playMatch(m.id, winner);
  }
  det = await api(`/api/tournaments/${slug}`);
  const table = det.tournament.pointsTable;
  const rankOf = (teamId) => table.find((p) => p.teamId === teamId).rank;
  check('rank restarts inside each group', rankOf(lions.teamId) === 1 && rankOf(eagles.teamId) === 1, `Lions ${rankOf(lions.teamId)}, Eagles ${rankOf(eagles.teamId)}`);
  check('runners-up are rank 2 in their group', rankOf(tigers.teamId) === 2 && rankOf(hawks.teamId) === 2, `Tigers ${rankOf(tigers.teamId)}, Hawks ${rankOf(hawks.teamId)}`);
  check('bears are third in group B', rankOf(bears.teamId) === 3);
  check('league complete', det.progress.leagueComplete);

  const ko = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateKnockouts' } });
  check('knockouts seeded from the group standings', ko.success && /group standings/.test(ko.message || ''), JSON.stringify(ko).slice(0, 150));
  det = await api(`/api/tournaments/${slug}`);
  const sf1 = det.tournament.knockoutMatches.find((k) => k.stage === 'SF1').match;
  const sf2 = det.tournament.knockoutMatches.find((k) => k.stage === 'SF2').match;
  check('SF1 is A1 v B2 (Lions v Hawks)', sf1.homeTeamId === lions.teamId && sf1.awayTeamId === hawks.teamId, `${sf1.homeTeam.name} v ${sf1.awayTeam.name}`);
  check('SF2 is B1 v A2 (Eagles v Tigers)', sf2.homeTeamId === eagles.teamId && sf2.awayTeamId === tigers.teamId, `${sf2.homeTeam.name} v ${sf2.awayTeam.name}`);

  const csv = await fetch(`${BASE}/api/export?type=points&tournamentId=${det.tournament.id}`).then((r) => r.text());
  check('points CSV has a Group column', csv.split('\n')[0].includes('Group'), csv.split('\n')[0]);

  console.log('\n=== SINGLE LEAGUE WITHOUT GROUPS ===');
  const plain = await api('/api/tournaments', { method: 'POST', body: {
    name: `Plain ${rid}`, venue: 'V', defaultOvers: 1,
    teams: [{ name: `P1 ${rid}` }, { name: `P2 ${rid}` }, { name: `P3 ${rid}` }, { name: `P4 ${rid}` }] } });
  check('ungrouped tournament created', plain.success, JSON.stringify(plain).slice(0, 150));
  const plainGen = await api(`/api/tournaments/${plain.tournament.slug}`, { method: 'POST', body: { action: 'generateFixtures' } });
  check('ungrouped fixtures generate', plainGen.success, JSON.stringify(plainGen).slice(0, 150));
  const plainDet = await api(`/api/tournaments/${plain.tournament.slug}`);
  check('four teams play a full round robin (6 matches)', league(plainDet).length === 6, `${league(plainDet).length}`);
  check('ungrouped fixtures have no group tag', league(plainDet).every((m) => !m.groupName));

  // ---------------------------------------------------------------- cleanup
  for (const s of [slug, plain.tournament.slug]) await api(`/api/tournaments/${s}?force=true`, { method: 'DELETE' });
  const teams = await api(`/api/teams?q=${encodeURIComponent(rid)}`);
  for (const team of teams.teams || []) await api(`/api/teams/${team.id}?force=true`, { method: 'DELETE' });
  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => { console.error('CRASH', e); process.exit(1); });
