// Regression checks for the review fixes: balanced fixtures for every team
// count, placeholder knockout rounds that cannot start early, server-side
// squad validation on deliveries, abandon/undo guards and the admin session.
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

async function makeTeams(n) {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const t = await api('/api/teams', { method: 'POST', body: { name: `Hard ${rid} ${i}`, shortName: `H${i}` } });
    ids.push(t.team.id);
  }
  return ids;
}

/** Games per team in a tournament's league fixtures. */
function appearances(det) {
  const c = {};
  for (const m of det.tournament.matches.filter(m => m.stage === 'LEAGUE')) {
    c[m.homeTeamId] = (c[m.homeTeamId] || 0) + 1;
    c[m.awayTeamId] = (c[m.awayTeamId] || 0) + 1;
  }
  return c;
}

async function main() {
  const teamIds = await makeTeams(6);
  const slugs = [];

  // ---------------------------------------------------------------- fixtures
  console.log('\n=== FIXTURES ARE BALANCED FOR EVERY TEAM COUNT ===');
  for (const [n, per] of [[4, 1], [6, 1], [6, 3], [5, 2], [4, 3]]) {
    const t = await api('/api/tournaments', { method: 'POST', body: {
      name: `Fx ${rid} ${n}x${per}`, venue: 'V', defaultOvers: 2, teamIds: teamIds.slice(0, n), matchesPerTeam: per, generateFixtures: true } });
    check(`${n} teams x ${per} per team generates`, t.success, JSON.stringify(t).slice(0, 150));
    if (!t.success) continue;
    slugs.push(t.tournament.slug);
    const det = await api(`/api/tournaments/${t.tournament.slug}`);
    const c = appearances(det);
    const balanced = teamIds.slice(0, n).every(id => c[id] === per);
    check(`${n} teams x ${per}: every team plays exactly ${per}`, balanced, JSON.stringify(c));
    const league = det.tournament.matches.filter(m => m.stage === 'LEAGUE');
    check(`${n} teams x ${per}: ${n * per / 2} fixtures`, league.length === n * per / 2, `${league.length}`);
    const pairs = new Set(league.map(m => [m.homeTeamId, m.awayTeamId].sort().join('|')));
    check(`${n} teams x ${per}: no repeated pairing`, pairs.size === league.length);
  }

  const odd = await api('/api/tournaments', { method: 'POST', body: {
    name: `Fx ${rid} 5x1`, venue: 'V', teamIds: teamIds.slice(0, 5), matchesPerTeam: 1, generateFixtures: true } });
  check('5 teams x 1 per team is rejected (cannot balance)', !odd.success && /even number/i.test(odd.error || ''), JSON.stringify(odd).slice(0, 150));

  const regen = await api(`/api/tournaments/${slugs[0]}`, { method: 'POST', body: { action: 'generateFixtures', matchesPerTeam: 9, force: true } });
  check('regenerating with an impossible count is rejected', !regen.success, JSON.stringify(regen).slice(0, 150));

  // --------------------------------------------------------------- knockouts
  console.log('\n=== PLACEHOLDER KNOCKOUTS CANNOT START EARLY ===');
  const ko = await api('/api/tournaments', { method: 'POST', body: {
    name: `Ko ${rid}`, venue: 'V', defaultOvers: 2, teamIds: teamIds.slice(0, 4), matchesPerTeam: 1, generateFixtures: true } });
  slugs.push(ko.tournament.slug);
  const gen = await api(`/api/tournaments/${ko.tournament.slug}`, { method: 'POST', body: { action: 'generateKnockouts', force: true } });
  check('semi-final bracket generated', gen.success, JSON.stringify(gen).slice(0, 150));

  let det = await api(`/api/tournaments/${ko.tournament.slug}`);
  const bracket = det.tournament.knockoutMatches;
  const finalSlot = bracket.find(k => k.stage === 'FINAL');
  const sf1 = bracket.find(k => k.stage === 'SF1');
  check('final is flagged as a placeholder', finalSlot?.slot?.pending === true, JSON.stringify(finalSlot?.slot));
  check('final is waiting on both semi-finals', finalSlot?.slot?.waitingOn?.join() === 'SF1,SF2', JSON.stringify(finalSlot?.slot));
  check('semi-final is not a placeholder', sf1?.slot?.pending === false, JSON.stringify(sf1?.slot));

  const earlyToss = await api(`/api/matches/${finalSlot.match.id}`, { method: 'POST', body: {
    action: 'toss', tossWinnerId: finalSlot.match.homeTeamId, tossDecision: 'BAT' } });
  check('toss on the placeholder final is refused', !earlyToss.success && /waiting/i.test(earlyToss.error || ''), JSON.stringify(earlyToss).slice(0, 150));

  const sfToss = await api(`/api/matches/${sf1.match.id}`, { method: 'POST', body: {
    action: 'toss', tossWinnerId: sf1.match.homeTeamId, tossDecision: 'BAT' } });
  check('toss on a seeded semi-final works', sfToss.success, JSON.stringify(sfToss).slice(0, 150));

  // ------------------------------------------------------ delivery validation
  console.log('\n=== DELIVERIES ARE CHECKED AGAINST THE SQUADS ===');
  const squad = (p) => ['1', '2', '3'].map(n => ({ playerName: `${p}${n}-${rid}`, role: 'ALL_ROUNDER' }));
  const m = await api('/api/matches', { method: 'POST', body: {
    matchType: 'SINGLE', homeTeamId: teamIds[4], awayTeamId: teamIds[5], venue: 'V', overs: 2,
    teamASquad: squad('HA'), teamBSquad: squad('HB') } });
  check('single match created', m.success, JSON.stringify(m).slice(0, 150));
  const matchId = m.match.id;
  await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: teamIds[4], tossDecision: 'BAT' } });
  let state = await api(`/api/matches/${matchId}`);
  const inningsId = state.match.innings[0].id;
  const home = state.match.squadPlayers.filter(s => s.teamId === teamIds[4]).map(s => s.playerId);
  const away = state.match.squadPlayers.filter(s => s.teamId === teamIds[5]).map(s => s.playerId);
  const ball = (b) => api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'delivery', inningsId, ...b } });

  let r = await ball({ strikerId: home[0], nonStrikerId: home[1], bowlerId: home[2], runsBat: 1 });
  check('bowler from the batting side is refused', !r.success && /fielding side/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
  r = await ball({ strikerId: away[0], nonStrikerId: away[1], bowlerId: home[0], runsBat: 1 });
  check('batters from the fielding side are refused', !r.success && /batting side/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
  r = await ball({ strikerId: home[0], nonStrikerId: home[1], bowlerId: home[1], runsBat: 1 });
  check('non-striker cannot also bowl', !r.success, JSON.stringify(r).slice(0, 150));
  r = await ball({ strikerId: home[0], nonStrikerId: home[1], bowlerId: away[0], runsBat: 1, isWicket: true, wicketType: 'CAUGHT', dismissedId: home[0], fielderId: home[2] });
  check('fielder from the batting side is refused', !r.success && /fielder/i.test(r.error || ''), JSON.stringify(r).slice(0, 150));
  r = await ball({ strikerId: home[0], nonStrikerId: home[1], bowlerId: away[0], runsBat: 4 });
  check('a valid delivery is accepted', r.success, JSON.stringify(r).slice(0, 150));

  // ------------------------------------------------------- abandon / undo
  console.log('\n=== ABANDON AND UNDO GUARDS ===');
  const ab1 = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'abandon', reason: 'rain' } });
  check('abandoning a live match works', ab1.success, JSON.stringify(ab1).slice(0, 150));
  const ab2 = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'abandon' } });
  check('abandoning twice is refused', !ab2.success, JSON.stringify(ab2).slice(0, 150));
  const undo = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'undo' } });
  check('undo on an abandoned match is refused', !undo.success, JSON.stringify(undo).slice(0, 150));
  state = await api(`/api/matches/${matchId}`);
  check('match stays abandoned', state.match.status === 'ABANDONED', state.match.status);

  // ---------------------------------------------------------------- session
  console.log('\n=== ADMIN SESSION ===');
  const session = await api('/api/auth/session');
  if (session.enabled) {
    const anon = await fetch(BASE + '/api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', shortName: 'x' }) });
    check('anonymous write gets 401', anon.status === 401, `${anon.status}`);
    const read = await fetch(BASE + '/api/teams');
    check('anonymous read still works', read.status === 200, `${read.status}`);
    const page = await fetch(BASE + '/admin', { redirect: 'manual' });
    check('admin page redirects to login', page.status === 307 && /\/login/.test(page.headers.get('location') || ''), `${page.status}`);
    const bad = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { password: 'wrong-' + rid } });
    check('wrong password is rejected', bad.status === 401);
  } else {
    check('auth disabled — site runs open (set ADMIN_PASSWORD to enable)', session.loggedIn === true);
  }

  // ---------------------------------------------------------------- cleanup
  await api(`/api/matches/${matchId}`, { method: 'DELETE' });
  for (const s of slugs) await api(`/api/tournaments/${s}?force=true`, { method: 'DELETE' });
  for (const id of teamIds) await api(`/api/teams/${id}?force=true`, { method: 'DELETE' });
  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) console.log('Failures:\n  ' + failures.join('\n  '));
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
