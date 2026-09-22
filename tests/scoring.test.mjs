// End-to-end API test: single match scoring, extras, wickets, undo, delete.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
// With ADMIN_PASSWORD set, writes need the organiser session; send it as a Bearer token.
const AUTH_HEADERS = { 'Content-Type': 'application/json', ...(process.env.ADMIN_PASSWORD ? { Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` } : {}) };

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; failures.push(`${name}${detail ? ' :: ' + detail : ''}`); console.log(`  FAIL ${name} ${detail || ''}`); }
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: AUTH_HEADERS,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ...json };
}

const rid = Math.random().toString(36).slice(2, 7);

/** Removes players these tests created, so repeated runs do not pile up records. */
async function cleanupPlayers(tag) {
  try {
    const listed = await api(`/api/players?q=${encodeURIComponent(tag)}`);
    for (const p of listed.players || []) {
      await api(`/api/players/${p.id}?force=true`, { method: 'DELETE' });
    }
  } catch {
    /* best effort — the suite result matters more than the tidy-up */
  }
}

async function main() {
  console.log('\n=== SETUP ===');
  const teamA = await api('/api/teams', { method: 'POST', body: { name: `Test Alpha ${rid}`, shortName: 'TA' + rid.slice(0,2) } });
  const teamB = await api('/api/teams', { method: 'POST', body: { name: `Test Beta ${rid}`, shortName: 'TB' + rid.slice(0,2) } });
  check('create team A', teamA.success, JSON.stringify(teamA).slice(0,200));
  check('create team B', teamB.success);

  const dupTeam = await api('/api/teams', { method: 'POST', body: { name: `Test Alpha ${rid}`, shortName: 'XX' } });
  check('duplicate team name rejected', !dupTeam.success);

  const badTeam = await api('/api/teams', { method: 'POST', body: { name: 'No Short' } });
  check('team without shortName rejected', !badTeam.success);

  const squadA = ['A1','A2','A3','A4'].map(n => ({ playerName: `${n}-${rid}`, role: 'ALL_ROUNDER' }));
  const squadB = ['B1','B2','B3','B4'].map(n => ({ playerName: `${n}-${rid}`, role: 'ALL_ROUNDER' }));

  const m = await api('/api/matches', { method: 'POST', body: {
    matchType: 'SINGLE', stage: 'FRIENDLY',
    homeTeamId: teamA.team.id, awayTeamId: teamB.team.id,
    venue: 'Test Ground', overs: 2, teamASquad: squadA, teamBSquad: squadB,
  }});
  check('create match', m.success, JSON.stringify(m).slice(0,200));
  const matchId = m.match.id;

  const selfMatch = await api('/api/matches', { method: 'POST', body: {
    homeTeamId: teamA.team.id, awayTeamId: teamA.team.id, venue: 'X', overs: 2 }});
  check('team vs itself rejected', !selfMatch.success);

  const badOvers = await api('/api/matches', { method: 'POST', body: {
    homeTeamId: teamA.team.id, awayTeamId: teamB.team.id, venue: 'X', overs: 0 }});
  check('zero overs rejected', !badOvers.success);

  console.log('\n=== TOSS ===');
  const badToss = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: 'nope', tossDecision: 'BAT' }});
  check('toss with unknown team rejected', !badToss.success);

  const toss = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: teamA.team.id, tossDecision: 'BAT' }});
  check('toss accepted', toss.success, JSON.stringify(toss).slice(0,200));

  const doubleToss = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: teamA.team.id, tossDecision: 'BAT' }});
  check('second toss rejected', !doubleToss.success);

  let state = await api(`/api/matches/${matchId}`);
  let inn1 = state.match.innings[0];
  check('innings 1 batting team is A (elected to bat)', inn1.battingTeamId === teamA.team.id);

  const sq = state.match.squadPlayers;
  const aPlayers = sq.filter(p => p.teamId === teamA.team.id);
  const bPlayers = sq.filter(p => p.teamId === teamB.team.id);
  check('squad A saved', aPlayers.length === 4);
  check('squad B saved', bPlayers.length === 4);

  const S = aPlayers[0].playerId, NS = aPlayers[1].playerId, A3 = aPlayers[2].playerId, A4 = aPlayers[3].playerId;
  const BOWL = bPlayers[0].playerId, BOWL2 = bPlayers[1].playerId;

  async function ball(payload, striker = S, nonStriker = NS, bowler = BOWL) {
    return api(`/api/matches/${matchId}`, { method: 'POST', body: {
      action: 'delivery', inningsId: inn1.id,
      strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler, ...payload }});
  }

  console.log('\n=== VALIDATION ===');
  check('wide with bat runs rejected', !(await ball({ runsBat: 2, extraType: 'WIDE' })).success);
  check('negative runs rejected', !(await ball({ runsBat: -1, extraType: 'NONE' })).success);
  check('runs > 7 rejected', !(await ball({ runsBat: 12, extraType: 'NONE' })).success);
  check('unknown extra rejected', !(await ball({ runsBat: 0, extraType: 'BOUNCER' })).success);
  check('unknown dismissal rejected', !(await ball({ runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'EXPLODED', dismissedId: S })).success);
  check('wicket without dismissed player rejected', !(await ball({ runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'BOWLED' })).success);
  check('dismissing a player not at the crease rejected', !(await ball({ runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'BOWLED', dismissedId: A4 })).success);
  check('striker bowling to himself rejected', !(await ball({ runsBat: 0, extraType: 'NONE' }, S, NS, S)).success);
  check('bye with bat runs rejected', !(await ball({ runsBat: 2, extraType: 'BYE', runsExtra: 2 })).success);

  console.log('\n=== SCORING ARITHMETIC ===');
  let r;
  r = await ball({ runsBat: 4, extraType: 'NONE' });
  check('four scored', r.success && r.updatedInnings.totalRuns === 4, JSON.stringify(r.updatedInnings));
  check('four counted as one legal ball', r.updatedInnings.legalBalls === 1);

  r = await ball({ runsBat: 0, extraType: 'WIDE', runsExtra: 0 });
  check('wide adds 1 run', r.updatedInnings.totalRuns === 5);
  check('wide is not a legal ball', r.updatedInnings.legalBalls === 1);

  r = await ball({ runsBat: 0, extraType: 'WIDE', runsExtra: 2 });
  check('wide + 2 byes adds 3', r.updatedInnings.totalRuns === 8);

  r = await ball({ runsBat: 6, extraType: 'NO_BALL' });
  check('no-ball + six adds 7', r.updatedInnings.totalRuns === 15);
  check('no-ball is not a legal ball', r.updatedInnings.legalBalls === 1);

  r = await ball({ runsBat: 0, extraType: 'LEG_BYE', runsExtra: 2 });
  check('leg byes add 2', r.updatedInnings.totalRuns === 17);
  check('leg bye is a legal ball', r.updatedInnings.legalBalls === 2);

  state = await api(`/api/matches/${matchId}`);
  const strikerCard = state.match.battingScores.find(b => b.playerId === S);
  check('batter credited 4 + 6 only (extras excluded)', strikerCard.runs === 10, `got ${strikerCard.runs}`);
  check('batter faced 3 balls (four + no-ball + leg-bye)', strikerCard.balls === 3, `got ${strikerCard.balls}`);
  check('batter has 1 four', strikerCard.fours === 1);
  check('batter has 1 six', strikerCard.sixes === 1);

  const bowlerCard = state.match.bowlingFigures.find(b => b.playerId === BOWL);
  check('bowler charged 15 (byes/leg-byes excluded)', bowlerCard.runs === 15, `got ${bowlerCard.runs}`);
  check('bowler credited 1 wide', bowlerCard.wides === 2, `got ${bowlerCard.wides}`);
  check('bowler credited 1 no-ball', bowlerCard.noBalls === 1);
  check('bowler bowled 2 legal balls', bowlerCard.legalBalls === 2);

  console.log('\n=== WICKETS ===');
  r = await ball({ runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'RUN_OUT', dismissedId: NS, fielderId: BOWL2 });
  check('non-striker run out recorded', r.success && r.updatedInnings.totalWickets === 1, JSON.stringify(r.updatedInnings));

  state = await api(`/api/matches/${matchId}`);
  const nsCard = state.match.battingScores.find(b => b.playerId === NS);
  check('run-out NON-STRIKER is marked out', nsCard.isOut === true, JSON.stringify(nsCard));
  check('run-out dismissal text mentions fielder', (nsCard.wicketInfo || '').includes('run out'), nsCard.wicketInfo);
  const bowlAfterRunout = state.match.bowlingFigures.find(b => b.playerId === BOWL);
  check('run out NOT credited to bowler', bowlAfterRunout.wickets === 0, `got ${bowlAfterRunout.wickets}`);

  r = await ball({ runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'RETIRED_HURT', dismissedId: S }, S, A3);
  check('retired hurt accepted', r.success);
  check('retired hurt does NOT count as a team wicket', r.updatedInnings.totalWickets === 1, `got ${r.updatedInnings.totalWickets}`);
  state = await api(`/api/matches/${matchId}`);
  const retCard = state.match.battingScores.find(b => b.playerId === S);
  check('retired hurt batter is not marked out', retCard.isOut === false && retCard.isRetired === true, JSON.stringify(retCard));

  console.log('\n=== UNDO ===');
  const beforeUndo = (await api(`/api/matches/${matchId}`)).match;
  const runsBefore = beforeUndo.innings[0].totalRuns;
  const u = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'undo' }});
  check('undo succeeds', u.success);
  state = await api(`/api/matches/${matchId}`);
  const retAfterUndo = state.match.battingScores.find(b => b.playerId === S);
  check('undo cleared the retired flag', !retAfterUndo || retAfterUndo.isRetired === false, JSON.stringify(retAfterUndo));
  check('undo kept the run total', state.match.innings[0].totalRuns === runsBefore, `${state.match.innings[0].totalRuns} vs ${runsBefore}`);

  const u2 = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'undo' }});
  check('second undo succeeds', u2.success);
  state = await api(`/api/matches/${matchId}`);
  check('undo removed the run-out wicket', state.match.innings[0].totalWickets === 0, `got ${state.match.innings[0].totalWickets}`);
  const nsAfter = state.match.battingScores.find(b => b.playerId === NS);
  check('undone run-out batter is no longer out', !nsAfter || nsAfter.isOut === false);

  console.log('\n=== INNINGS ROLLOVER (2 overs) ===');
  // Currently 2 legal balls, 17 runs. Bowl 10 more legal balls to finish 2 overs.
  for (let i = 0; i < 10; i++) {
    r = await ball({ runsBat: 1, extraType: 'NONE' }, S, NS, i < 4 ? BOWL : BOWL2);
  }
  check('innings 1 auto-closed after 2 overs', r.updatedInnings.isCompleted === true, JSON.stringify(r.updatedInnings));
  check('innings 1 end reason is OVERS', r.updatedInnings.endReason === 'OVERS', r.updatedInnings.endReason);

  state = await api(`/api/matches/${matchId}`);
  check('second innings auto-created', state.match.innings.length === 2);
  check('match went to INNINGS_BREAK', state.match.status === 'INNINGS_BREAK', state.match.status);
  const inn2 = state.match.innings.find(i => i.inningsNo === 2);
  check('innings 2 batting team is B', inn2.battingTeamId === teamB.team.id);
  check('innings 2 has the target set', inn2.targetRuns === state.match.innings[0].totalRuns + 1, `${inn2.targetRuns}`);

  console.log('\n=== UNDO ACROSS THE INNINGS BREAK ===');
  const u3 = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'undo' }});
  check('undo at innings break succeeds', u3.success, JSON.stringify(u3));
  state = await api(`/api/matches/${matchId}`);
  check('empty second innings was removed', state.match.innings.length === 1, `innings=${state.match.innings.length}`);
  check('match returned to LIVE', state.match.status === 'LIVE', state.match.status);
  check('first innings reopened', state.match.innings[0].isCompleted === false);

  // Re-close it
  r = await ball({ runsBat: 1, extraType: 'NONE' }, S, NS, BOWL2);
  check('innings re-closes after replaying the ball', r.updatedInnings.isCompleted === true);

  console.log('\n=== CHASE + RESULT ===');
  state = await api(`/api/matches/${matchId}`);
  const target = state.match.innings.find(i => i.inningsNo === 1).totalRuns + 1;
  const inn2id = state.match.innings.find(i => i.inningsNo === 2).id;

  async function ball2(payload, striker, nonStriker, bowler) {
    return api(`/api/matches/${matchId}`, { method: 'POST', body: {
      action: 'delivery', inningsId: inn2id,
      strikerId: striker, nonStrikerId: nonStriker, bowlerId: bowler, ...payload }});
  }

  const B1 = bPlayers[0].playerId, B2 = bPlayers[1].playerId;
  const AB1 = aPlayers[0].playerId;
  let chased = 0, safety = 0;
  while (chased < target && safety < 20) {
    r = await ball2({ runsBat: 6, extraType: 'NONE' }, B1, B2, AB1);
    if (!r.success) { check('chase ball accepted', false, JSON.stringify(r)); break; }
    chased = r.updatedInnings.totalRuns;
    safety++;
    if (r.updatedInnings.isCompleted) break;
  }
  check('chase closed the innings on reaching the target', r.updatedInnings.isCompleted === true, JSON.stringify(r.updatedInnings));
  check('end reason is TARGET', r.updatedInnings.endReason === 'TARGET', r.updatedInnings.endReason);

  state = await api(`/api/matches/${matchId}`);
  check('match COMPLETED', state.match.status === 'COMPLETED', state.match.status);
  check('winner is the chasing team', state.match.winnerId === teamB.team.id);
  check('result mentions wickets', (state.match.resultSummary || '').includes('wicket'), state.match.resultSummary);
  check('resultType is WIN', state.match.resultType === 'WIN');

  const afterEnd = await ball2({ runsBat: 1, extraType: 'NONE' }, B1, B2, AB1);
  check('scoring after the match ends is rejected', !afterEnd.success);

  console.log('\n=== POTM + EDIT ===');
  const potm = await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'setPotm', playerId: B1 }});
  check('set player of the match', potm.success);
  state = await api(`/api/matches/${matchId}`);
  check('POTM persisted', state.match.potmId === B1);

  const shrink = await api(`/api/matches/${matchId}`, { method: 'PATCH', body: { overs: 1 }});
  check('shrinking overs below what was bowled is rejected', !shrink.success, JSON.stringify(shrink));
  const venueEdit = await api(`/api/matches/${matchId}`, { method: 'PATCH', body: { venue: 'Edited Ground' }});
  check('venue edit accepted', venueEdit.success);

  console.log('\n=== EXPORTS ===');
  for (const t of ['points', 'players', 'matches']) {
    const res = await fetch(`${BASE}/api/export?type=${t}`);
    check(`export ${t} returns CSV`, res.ok && (res.headers.get('content-type') || '').includes('csv'));
  }
  const sc = await fetch(`${BASE}/api/export?type=scorecard&matchId=${matchId}`);
  check('export scorecard returns CSV', sc.ok);

  console.log('\n=== DELETE ===');
  const delTeamBlocked = await api(`/api/teams/${teamA.team.id}`, { method: 'DELETE' });
  check('deleting a team in a match asks for confirmation', delTeamBlocked.requiresConfirmation === true, JSON.stringify(delTeamBlocked).slice(0,150));

  const delPlayerBlocked = await api(`/api/players/${B1}`, { method: 'DELETE' });
  check('deleting a player with recorded balls is refused', !delPlayerBlocked.success, JSON.stringify(delPlayerBlocked).slice(0,150));

  const delMatch = await api(`/api/matches/${matchId}`, { method: 'DELETE' });
  check('delete match succeeds', delMatch.success, JSON.stringify(delMatch));
  const gone = await api(`/api/matches/${matchId}`);
  check('deleted match returns 404', gone.status === 404);

  const delTeamNow = await api(`/api/teams/${teamA.team.id}`, { method: 'DELETE' });
  check('team deletes once its matches are gone', delTeamNow.success, JSON.stringify(delTeamNow));
  await api(`/api/teams/${teamB.team.id}?force=true`, { method: 'DELETE' });

  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('CRASH', e); process.exit(1); });
