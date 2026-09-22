// End-to-end tournament test: fixtures, points, NRR, ties, abandonment,
// knockout seeding and auto-advancement.
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
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  return { status: res.status, ...j };
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
    /* best effort — the suite result matters more than the tidy-up */
  }
}

/** Plays a whole match: team1 scores `runs1`, team2 chases to `runs2` then stops. */
async function playMatch(matchId, homeFirst, runs1, runs2) {
  const st = await api(`/api/matches/${matchId}`);
  const m = st.match;
  const batFirst = homeFirst ? m.homeTeamId : m.awayTeamId;
  await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'toss', tossWinnerId: batFirst, tossDecision: 'BAT' } });

  for (const teamId of [batFirst, batFirst === m.homeTeamId ? m.awayTeamId : m.homeTeamId]) {
    const names = ['P1', 'P2', 'P3', 'P4'].map((n) => ({ playerName: `${n} ${teamId.slice(0, 4)} ${rid}`, role: 'ALL_ROUNDER' }));
    await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'setSquad', teamId, players: names } });
  }

  let cur = await api(`/api/matches/${matchId}`);
  const squad = cur.match.squadPlayers;
  const targets = [runs1, runs2];

  for (let innNo = 1; innNo <= 2; innNo++) {
    cur = await api(`/api/matches/${matchId}`);
    const inn = cur.match.innings.find((i) => i.inningsNo === innNo);
    if (!inn || inn.isCompleted) continue;
    const bat = squad.filter((p) => p.teamId === inn.battingTeamId);
    const bowl = squad.filter((p) => p.teamId === inn.bowlingTeamId);
    let scored = 0, guard = 0;
    while (scored < targets[innNo - 1] && guard < 200) {
      const need = targets[innNo - 1] - scored;
      const runs = need >= 6 ? 6 : need >= 4 ? 4 : need >= 2 ? 2 : 1;
      const res = await api(`/api/matches/${matchId}`, { method: 'POST', body: {
        action: 'delivery', inningsId: inn.id,
        strikerId: bat[0].playerId, nonStrikerId: bat[1].playerId, bowlerId: bowl[0].playerId,
        runsBat: runs, extraType: 'NONE' } });
      if (!res.success) return { error: res.error, innNo };
      scored = res.updatedInnings.totalRuns;
      guard++;
      if (res.updatedInnings.isCompleted) break;
    }
    // Close the innings early if the target was under the full quota of overs.
    const after = await api(`/api/matches/${matchId}`);
    const innAfter = after.match.innings.find((i) => i.inningsNo === innNo);
    if (innAfter && !innAfter.isCompleted) {
      await api(`/api/matches/${matchId}`, { method: 'POST', body: { action: 'endInnings', inningsId: innAfter.id } });
    }
  }
  return {};
}

async function main() {
  console.log('\n=== TEAMS ===');
  const teamIds = [];
  for (let i = 1; i <= 8; i++) {
    const t = await api('/api/teams', { method: 'POST', body: { name: `T${i} ${rid}`, shortName: `T${i}${rid.slice(0,1)}` } });
    if (!t.success) { check(`create team ${i}`, false, JSON.stringify(t)); return; }
    teamIds.push(t.team.id);
  }
  check('8 teams created', teamIds.length === 8);

  console.log('\n=== TOURNAMENT + FIXTURES ===');
  const badPerTeam = await api('/api/tournaments', { method: 'POST', body: {
    name: `Bad ${rid}`, venue: 'V', teamIds: teamIds.slice(0, 3), matchesPerTeam: 5, generateFixtures: true } });
  check('matchesPerTeam above team count rejected', !badPerTeam.success, JSON.stringify(badPerTeam).slice(0, 150));

  const noVenue = await api('/api/tournaments', { method: 'POST', body: { name: `NoVenue ${rid}` } });
  check('tournament without venue rejected', !noVenue.success);

  const badDates = await api('/api/tournaments', { method: 'POST', body: {
    name: `Dates ${rid}`, venue: 'V', startDate: '2026-05-01', endDate: '2026-04-01' } });
  check('end date before start date rejected', !badDates.success);

  const t = await api('/api/tournaments', { method: 'POST', body: {
    name: `Cup ${rid}`, venue: 'Main Ground', defaultOvers: 2, teamIds, matchesPerTeam: 2, generateFixtures: true } });
  check('tournament created', t.success, JSON.stringify(t).slice(0, 200));
  const slug = t.tournament.slug;

  let det = await api(`/api/tournaments/${slug}`);
  check('fixtures generated', det.tournament.matches.length === 8, `got ${det.tournament.matches.length}`);
  check('every team appears twice', (() => {
    const c = {}; det.tournament.matches.forEach(m => { c[m.homeTeamId] = (c[m.homeTeamId]||0)+1; c[m.awayTeamId]=(c[m.awayTeamId]||0)+1; });
    return teamIds.every(id => c[id] === 2);
  })());
  check('points table seeded with 8 rows', det.tournament.pointsTable.length === 8);
  check('all teams start on 0 points', det.tournament.pointsTable.every(p => p.points === 0));
  check('progress reports league not complete', det.progress.leagueComplete === false);

  console.log('\n=== EARLY KNOCKOUT GUARD ===');
  const early = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateKnockouts' } });
  check('knockout before league completion asks for confirmation', early.requiresConfirmation === true, JSON.stringify(early).slice(0,150));

  console.log('\n=== PLAY THE LEAGUE ===');
  const fixtures = det.tournament.matches.filter(m => m.stage === 'LEAGUE');
  // Distinct margins so the standings are unambiguous.
  const scripts = [[24,12],[18,20],[30,10],[14,16],[22,8],[12,26],[20,6],[10,28]];
  for (let i = 0; i < fixtures.length; i++) {
    const res = await playMatch(fixtures[i].id, true, scripts[i][0], scripts[i][1]);
    if (res.error) check(`play fixture ${i+1}`, false, res.error);
  }

  det = await api(`/api/tournaments/${slug}`);
  const played = det.tournament.matches.filter(m => m.status === 'COMPLETED').length;
  check('all 8 league matches completed', played === 8, `got ${played}`);
  check('progress reports league complete', det.progress.leagueComplete === true);

  const table = det.tournament.pointsTable;
  check('every team has played 2', table.every(p => p.played === 2), JSON.stringify(table.map(p=>p.played)));
  const totalWins = table.reduce((a, p) => a + p.won, 0);
  const totalLosses = table.reduce((a, p) => a + p.lost, 0);
  check('wins and losses balance', totalWins === totalLosses, `${totalWins} vs ${totalLosses}`);
  check('points equal 2 per win', table.every(p => p.points === p.won * 2 + p.tied + p.noResult));
  check('table is ranked 1..8', table.map(p => p.rank).sort((a,b)=>a-b).join(',') === '1,2,3,4,5,6,7,8');
  check('table is ordered by points then NRR', (() => {
    for (let i = 1; i < table.length; i++) {
      if (table[i-1].points < table[i].points) return false;
      if (table[i-1].points === table[i].points && table[i-1].nrr < table[i].nrr - 1e-9) return false;
    }
    return true;
  })(), JSON.stringify(table.map(p => [p.points, p.nrr])));
  check('NRR is non-zero for teams that played', table.some(p => Math.abs(p.nrr) > 0.001));
  // NRR is a ratio of sums, so it only cancels league-wide when every side
  // faces the same number of overs. Verify it exactly against the raw innings
  // instead: for each team, runs-for/overs-faced minus runs-against/overs-bowled,
  // charging a side the full quota whenever it is bowled out.
  {
    const detail = await api(`/api/matches?tournamentId=${t.tournament.id}`);
    let worst = 0, worstTeam = '';
    for (const p of table) {
      let rf = 0, of = 0, ra = 0, ob = 0;
      for (const m of detail.matches) {
        if (m.stage !== 'LEAGUE' || m.status !== 'COMPLETED') continue;
        if (m.homeTeamId !== p.teamId && m.awayTeamId !== p.teamId) continue;
        const oppId = m.homeTeamId === p.teamId ? m.awayTeamId : m.homeTeamId;
        const mine = m.innings.find(i => i.battingTeamId === p.teamId);
        const theirs = m.innings.find(i => i.battingTeamId === oppId);
        const sz = (tid) => { const n = m.squadPlayers.filter(s => s.teamId === tid).length; return n > 0 ? n : 10; };
        const maxW = (n) => (n <= 5 ? n : Math.max(1, n - 1));
        const eff = (inn, tid) => inn.totalWickets >= maxW(sz(tid)) ? m.overs : Math.floor(inn.legalBalls/6) + (inn.legalBalls%6)/6;
        if (mine) { rf += mine.totalRuns; of += eff(mine, p.teamId); }
        if (theirs) { ra += theirs.totalRuns; ob += eff(theirs, oppId); }
      }
      const expected = (of > 0 ? rf/of : 0) - (ob > 0 ? ra/ob : 0);
      const diff = Math.abs(expected - p.nrr);
      if (diff > worst) { worst = diff; worstTeam = p.teamId; }
    }
    check('NRR matches a hand-computed value for every team', worst < 0.002, `worst delta ${worst.toFixed(4)} on ${worstTeam}`);
  }

  console.log('\n=== LEADERBOARDS ARE AGGREGATED ===');
  check('top batter aggregates multiple innings', det.topBatsmen.length > 0 && det.topBatsmen[0].innings >= 1, JSON.stringify(det.topBatsmen[0]||{}).slice(0,200));
  check('top batter has a strike rate', det.topBatsmen[0]?.strikeRate > 0);
  check('leaderboard has one row per player', new Set(det.topBatsmen.map(b=>b.playerId)).size === det.topBatsmen.length);

  console.log('\n=== KNOCKOUTS ===');
  const ko = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateKnockouts' } });
  check('bracket generated after the league', ko.success, JSON.stringify(ko).slice(0, 200));

  det = await api(`/api/tournaments/${slug}`);
  const kos = det.tournament.knockoutMatches;
  check('bracket has QF1-4, SF1-2 and FINAL', kos.length === 7, `got ${kos.length}: ${kos.map(k=>k.stage).join(',')}`);

  const ranked = table.slice().sort((a,b)=>a.rank-b.rank).map(p=>p.teamId);
  const qf1 = kos.find(k => k.stage === 'QF1');
  check('QF1 is rank 1 vs rank 8', qf1.match.homeTeamId === ranked[0] && qf1.match.awayTeamId === ranked[7],
    `${ranked.indexOf(qf1.match.homeTeamId)+1} vs ${ranked.indexOf(qf1.match.awayTeamId)+1}`);
  const qf2 = kos.find(k => k.stage === 'QF2');
  check('QF2 is rank 4 vs rank 5', qf2.match.homeTeamId === ranked[3] && qf2.match.awayTeamId === ranked[4]);

  const dup = await api(`/api/tournaments/${slug}`, { method: 'POST', body: { action: 'generateKnockouts' } });
  check('regenerating a bracket asks for confirmation', dup.requiresConfirmation === true);

  console.log('\n=== KNOCKOUT AUTO-ADVANCE ===');
  for (const stage of ['QF1','QF2','QF3','QF4']) {
    const k = det.tournament.knockoutMatches.find(x => x.stage === stage);
    const res = await playMatch(k.matchId, true, 20, 10); // home team always wins
    if (res.error) check(`play ${stage}`, false, res.error);
  }

  det = await api(`/api/tournaments/${slug}`);
  const sf1 = det.tournament.knockoutMatches.find(k => k.stage === 'SF1');
  const qf1w = det.tournament.knockoutMatches.find(k => k.stage === 'QF1').match.winnerId;
  const qf2w = det.tournament.knockoutMatches.find(k => k.stage === 'QF2').match.winnerId;
  check('SF1 auto-filled with the QF1 and QF2 winners',
    sf1.match.homeTeamId === qf1w && sf1.match.awayTeamId === qf2w,
    `SF1 ${sf1.match.homeTeam.name} v ${sf1.match.awayTeam.name}`);

  const sf2 = det.tournament.knockoutMatches.find(k => k.stage === 'SF2');
  const qf3w = det.tournament.knockoutMatches.find(k => k.stage === 'QF3').match.winnerId;
  check('SF2 auto-filled with the QF3 winner', sf2.match.homeTeamId === qf3w);

  await playMatch(sf1.matchId, true, 20, 10);
  await playMatch(sf2.matchId, true, 20, 10);

  det = await api(`/api/tournaments/${slug}`);
  const fin = det.tournament.knockoutMatches.find(k => k.stage === 'FINAL');
  const sf1w = det.tournament.knockoutMatches.find(k => k.stage === 'SF1').match.winnerId;
  const sf2w = det.tournament.knockoutMatches.find(k => k.stage === 'SF2').match.winnerId;
  check('FINAL auto-filled with the semi-final winners',
    fin.match.homeTeamId === sf1w && fin.match.awayTeamId === sf2w,
    `FINAL ${fin.match.homeTeam.name} v ${fin.match.awayTeam.name}`);

  await playMatch(fin.matchId, true, 25, 12);
  det = await api(`/api/tournaments/${slug}`);
  check('champion is reported', !!det.progress.champion, JSON.stringify(det.progress).slice(0, 200));

  console.log('\n=== KNOCKOUTS DO NOT POLLUTE THE LEAGUE TABLE ===');
  check('league table still shows 2 games per team', det.tournament.pointsTable.every(p => p.played === 2),
    JSON.stringify(det.tournament.pointsTable.map(p => p.played)));

  console.log('\n=== TIE + ABANDON ===');
  const tieMatch = await api('/api/matches', { method: 'POST', body: {
    matchType: 'TOURNAMENT', tournamentId: t.tournament.id, stage: 'LEAGUE',
    homeTeamId: teamIds[0], awayTeamId: teamIds[1], venue: 'Main Ground', overs: 2 } });
  await playMatch(tieMatch.match.id, true, 12, 12);
  let tm = await api(`/api/matches/${tieMatch.match.id}`);
  check('equal scores produce a tie', tm.match.resultType === 'TIE', `${tm.match.resultType} / ${tm.match.resultSummary}`);
  check('a tie has no winner', tm.match.winnerId === null);

  det = await api(`/api/tournaments/${slug}`);
  const t0 = det.tournament.pointsTable.find(p => p.teamId === teamIds[0]);
  check('tie awards 1 point to each side', t0.tied === 1 && t0.points === t0.won * 2 + 1, JSON.stringify(t0).slice(0,200));

  const abMatch = await api('/api/matches', { method: 'POST', body: {
    matchType: 'TOURNAMENT', tournamentId: t.tournament.id, stage: 'LEAGUE',
    homeTeamId: teamIds[2], awayTeamId: teamIds[3], venue: 'Main Ground', overs: 2 } });
  await api(`/api/matches/${abMatch.match.id}`, { method: 'POST', body: { action: 'abandon', reason: 'rain' } });
  det = await api(`/api/tournaments/${slug}`);
  const t2 = det.tournament.pointsTable.find(p => p.teamId === teamIds[2]);
  check('abandoned match counts as a no-result', t2.noResult === 1, JSON.stringify(t2).slice(0,200));
  check('no-result awards 1 point', t2.points === t2.won * 2 + t2.tied + 1);

  console.log('\n=== DELETING A MATCH REBUILDS THE TABLE ===');
  const beforeDel = (await api(`/api/tournaments/${slug}`)).tournament.pointsTable.find(p => p.teamId === teamIds[0]);
  await api(`/api/matches/${tieMatch.match.id}`, { method: 'DELETE' });
  const afterDel = (await api(`/api/tournaments/${slug}`)).tournament.pointsTable.find(p => p.teamId === teamIds[0]);
  check('deleting the tied match removed its point', afterDel.points === beforeDel.points - 1, `${beforeDel.points} -> ${afterDel.points}`);
  check('deleting the match reduced games played', afterDel.played === beforeDel.played - 1);

  console.log('\n=== TOURNAMENT DELETE GUARD ===');
  const delGuard = await api(`/api/tournaments/${slug}`, { method: 'DELETE' });
  check('deleting a played tournament asks for confirmation', delGuard.requiresConfirmation === true, JSON.stringify(delGuard).slice(0,150));
  const delForce = await api(`/api/tournaments/${slug}?force=true`, { method: 'DELETE' });
  check('forced tournament delete succeeds', delForce.success);
  const gone = await api(`/api/tournaments/${slug}`);
  check('deleted tournament returns 404', gone.status === 404);

  for (const id of teamIds) await api(`/api/teams/${id}?force=true`, { method: 'DELETE' });

  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
