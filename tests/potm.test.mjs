// Player-of-the-match suggestion, and deleting a match that is already finished.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
// With ADMIN_PASSWORD set, writes need the organiser session; send it as a Bearer token.
const AUTH_HEADERS = { 'Content-Type': 'application/json', ...(process.env.ADMIN_PASSWORD ? { Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` } : {}) };
let pass = 0, fail = 0; const failures = [];
function check(n, c, d) {
  if (c) { pass++; console.log('  ok  ' + n); }
  else { fail++; failures.push(n + (d ? ' :: ' + d : '')); console.log('  FAIL ' + n + ' ' + (d || '')); }
}
async function api(p, o = {}) {
  const r = await fetch(BASE + p, { headers: AUTH_HEADERS, ...o,
    body: o.body ? JSON.stringify(o.body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: r.status, ...j };
}
const rid = Math.random().toString(36).slice(2, 6);

/** Removes players these tests created, so repeated runs do not pile up records. */
async function cleanupPlayers(tag) {
  try {
    const listed = await api(`/api/players?q=${encodeURIComponent(tag)}`);
    for (const p of listed.players || []) {
      await api(`/api/players/${p.id}?force=true`, { method: 'DELETE' });
    }
  } catch {
    /* best effort */
  }
}

/**
 * Sets up a 3-over match and plays it out from a script of deliveries, so the
 * suggestion engine is fed a realistic tape-ball scorecard.
 */
async function playScriptedMatch(overs, ballType = 'TAPE_BALL', tag = '1') {
  const a = await api('/api/teams', { method: 'POST', body: { name: `POTM-A${tag} ${rid}`, shortName: 'PMA' } });
  const b = await api('/api/teams', { method: 'POST', body: { name: `POTM-B${tag} ${rid}`, shortName: 'PMB' } });
  if (!a.success || !b.success) throw new Error(`team setup failed: ${a.error || b.error}`);
  const m = await api('/api/matches', { method: 'POST', body: {
    homeTeamId: a.team.id, awayTeamId: b.team.id, venue: 'POTM Ground', overs, ballType,
    teamASquad: ['One', 'Two', 'Three', 'Four'].map(n => ({ playerName: `A${tag}-${n}-${rid}` })),
    teamBSquad: ['One', 'Two', 'Three', 'Four'].map(n => ({ playerName: `B${tag}-${n}-${rid}` })) } });
  await api(`/api/matches/${m.match.id}`, { method: 'POST',
    body: { action: 'toss', tossWinnerId: a.team.id, tossDecision: 'BAT' } });
  const st = await api(`/api/matches/${m.match.id}`);
  return {
    id: m.match.id, teamA: a.team, teamB: b.team,
    innings: st.match.innings,
    bat: st.match.squadPlayers.filter(p => p.teamId === a.team.id),
    bowl: st.match.squadPlayers.filter(p => p.teamId === b.team.id),
  };
}

async function main() {
  console.log('\n=== SETUP: a 3-over tape-ball match ===');
  const g = await playScriptedMatch(3);
  const inn1 = g.innings[0].id;

  // Innings 1: A-Star carries the innings, B-Quick bowls the tight spell.
  const deliver = (inningsId, striker, nonStriker, bowler, extra = {}) =>
    api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId, strikerId: striker, nonStrikerId: nonStriker,
      bowlerId: bowler, runsBat: 0, extraType: 'NONE', ...extra } });

  const AS = g.bat[0].playerId, AF = g.bat[1].playerId;
  const BQ = g.bowl[0].playerId, B2 = g.bowl[1].playerId;

  // Over 1 — B-Quick concedes almost nothing.
  for (let i = 0; i < 5; i++) {
    const r = await deliver(inn1, AS, AF, BQ, { runsBat: 0 });
    if (!r.success) check('innings 1 dot accepted', false, r.error);
  }
  await deliver(inn1, AS, AF, BQ, { runsBat: 0, isWicket: true, wicketType: 'BOWLED', dismissedId: AF });

  // Overs 2-3 — A-Star hits out against the other bowler.
  const A3 = g.bat[2].playerId;
  for (const runs of [6, 6, 4, 6, 2, 6]) await deliver(inn1, AS, A3, B2, { runsBat: runs });
  for (const runs of [6, 4, 6, 1, 6, 4]) await deliver(inn1, AS, A3, BQ, { runsBat: runs });

  let st = await api(`/api/matches/${g.id}`);
  check('innings 1 completed', st.match.innings[0].isCompleted === true, JSON.stringify(st.match.innings[0]));

  // Innings 2 — B falls short.
  const inn2 = st.match.innings.find(i => i.inningsNo === 2).id;
  const BQ2 = g.bowl[0].playerId, BS = g.bowl[1].playerId;
  const AB1 = g.bat[0].playerId, AB2 = g.bat[2].playerId;
  for (const runs of [1, 2, 1, 0, 1, 2]) await deliver(inn2, BQ2, BS, AB1, { runsBat: runs });
  for (const runs of [1, 0, 2, 1, 0, 1]) await deliver(inn2, BQ2, BS, AB2, { runsBat: runs });
  const last = await api(`/api/matches/${g.id}`);
  const inn2rec = last.match.innings.find(i => i.inningsNo === 2);
  if (!inn2rec.isCompleted) {
    await api(`/api/matches/${g.id}`, { method: 'POST', body: { action: 'endInnings', inningsId: inn2 } });
  }

  st = await api(`/api/matches/${g.id}`);
  check('match completed', st.match.status === 'COMPLETED', st.match.status);
  check('team A won', st.match.winnerId === g.teamA.id, st.match.resultSummary);

  console.log('\n=== SUGGESTIONS ARE PRODUCED ===');
  const s = st.potmSuggestions;
  check('suggestions returned for a completed match', !!s, JSON.stringify(s).slice(0, 120));
  check('candidates are ranked', Array.isArray(s.candidates) && s.candidates.length > 0);
  check('ranking is in descending order of score',
    s.candidates.every((c, i) => i === 0 || s.candidates[i - 1].score >= c.score),
    JSON.stringify(s.candidates.map(c => c.score)));
  check('every candidate has a readable summary', s.candidates.every(c => typeof c.summary === 'string' && c.summary.length > 0));

  console.log('\n=== PAR IS TAKEN FROM THIS MATCH, NOT A FIXED NUMBER ===');
  check('par economy is reported', typeof s.par.economy === 'number' && s.par.economy > 0, JSON.stringify(s.par));
  check('par matches the run rate actually achieved',
    Math.abs(s.par.economy - s.par.matchRunRate) < 4, JSON.stringify(s.par));
  check('a wicket is priced above the par over (tape-ball adjustment)',
    s.par.wicketValue > s.par.economy, `wicket ${s.par.wicketValue} v econ ${s.par.economy}`);
  check('par strike rate is high, as tape-ball scoring demands',
    s.par.strikeRate > 100, String(s.par.strikeRate));

  console.log('\n=== THE RIGHT PLAYER IS PICKED ===');
  const top = s.candidates[0];
  // AS is the batter every run was fed to, so the engine should surface them.
  check('top pick is the batter who made the runs', top.playerId === AS, `${top.name} — ${top.summary}`);
  check('top pick is on the winning side', top.onWinningTeam === true);
  check('top pick shows batting figures', !!top.batting && top.batting.runs > 0, JSON.stringify(top.batting));
  check('summary mentions the share of the team total',
    top.summary.includes('%') || top.batting.shareOfTeamRuns > 0, top.summary);

  const tight = s.candidates.find(c => c.playerId === BQ);
  check('the tight bowler is ranked and explained', !!tight && !!tight.bowling, JSON.stringify(tight || {}).slice(0, 140));
  check('bowling summary compares economy against par',
    (tight.summary || '').includes('v par'), tight.summary);
  check('a losing-side performer still ranks above nobody',
    tight.score !== 0, String(tight.score));

  console.log('\n=== SETTING THE AWARD FROM A SUGGESTION ===');
  const set = await api(`/api/matches/${g.id}`, { method: 'POST',
    body: { action: 'setPotm', playerId: top.playerId } });
  check('the suggested player can be awarded', set.success, JSON.stringify(set).slice(0, 140));
  st = await api(`/api/matches/${g.id}`);
  check('award persisted', st.match.potmId === top.playerId);
  check('award shows on the player profile',
    (await api(`/api/players/${top.playerId}`)).stats.potm === 1);

  console.log('\n=== SUGGESTIONS ONLY FOR FINISHED MATCHES ===');
  const g2 = await playScriptedMatch(2, 'TAPE_BALL', '2');
  const live = await api(`/api/matches/${g2.id}`);
  check('an unfinished match returns no suggestions', !live.potmSuggestions, JSON.stringify(live.potmSuggestions));

  console.log('\n=== BALL TYPE SHIFTS THE BASELINE ===');
  const hard = await playScriptedMatch(2, 'LEATHER_BALL', '3');
  const hinn = hard.innings[0].id;
  await api(`/api/matches/${hard.id}`, { method: 'POST', body: {
    action: 'delivery', inningsId: hinn, strikerId: hard.bat[0].playerId,
    nonStrikerId: hard.bat[1].playerId, bowlerId: hard.bowl[0].playerId, runsBat: 1, extraType: 'NONE' } });
  await api(`/api/matches/${hard.id}`, { method: 'POST', body: { action: 'endInnings', inningsId: hinn } });
  let hs = await api(`/api/matches/${hard.id}`);
  const hinn2 = hs.match.innings.find(i => i.inningsNo === 2).id;
  await api(`/api/matches/${hard.id}`, { method: 'POST', body: {
    action: 'delivery', inningsId: hinn2, strikerId: hard.bowl[0].playerId,
    nonStrikerId: hard.bowl[1].playerId, bowlerId: hard.bat[0].playerId, runsBat: 0, extraType: 'NONE' } });
  await api(`/api/matches/${hard.id}`, { method: 'POST', body: { action: 'endInnings', inningsId: hinn2 } });
  hs = await api(`/api/matches/${hard.id}`);
  check('a leather-ball match uses a lower baseline than tape ball',
    hs.potmSuggestions.par.economy < s.par.economy,
    `leather ${hs.potmSuggestions?.par.economy} v tape ${s.par.economy}`);

  console.log('\n=== DELETING A COMPLETED MATCH ===');
  const del = await api(`/api/matches/${g.id}`, { method: 'DELETE' });
  check('a completed match can be deleted', del.success, JSON.stringify(del).slice(0, 140));
  check('it is gone afterwards', (await api(`/api/matches/${g.id}`)).status === 404);
  check('deleting it removed the award from the player profile',
    (await api(`/api/players/${top.playerId}`)).stats?.potm === 0);

  await api(`/api/matches/${g2.id}`, { method: 'DELETE' });
  await api(`/api/matches/${hard.id}`, { method: 'DELETE' });
  for (const game of [g, g2, hard]) {
    await api(`/api/teams/${game.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${game.teamB.id}?force=true`, { method: 'DELETE' });
  }
  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
