// Tape-ball rule checks: consecutive-over restriction, last-man-standing
// all-out thresholds, squad editing guards and the tie-breaker.
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
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
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

async function makeMatch(sizeA, sizeB, overs = 3) {
  const a = await api('/api/teams', { method: 'POST', body: { name: `R-A ${rid}${sizeA}${sizeB}`, shortName: 'RA' } });
  const b = await api('/api/teams', { method: 'POST', body: { name: `R-B ${rid}${sizeA}${sizeB}`, shortName: 'RB' } });
  const m = await api('/api/matches', { method: 'POST', body: {
    homeTeamId: a.team.id, awayTeamId: b.team.id, venue: 'Rules Ground', overs,
    teamASquad: Array.from({length: sizeA}, (_, i) => ({ playerName: `RA${i}-${rid}${sizeA}${sizeB}` })),
    teamBSquad: Array.from({length: sizeB}, (_, i) => ({ playerName: `RB${i}-${rid}${sizeA}${sizeB}` })) } });
  await api(`/api/matches/${m.match.id}`, { method: 'POST', body: { action: 'toss', tossWinnerId: a.team.id, tossDecision: 'BAT' } });
  const st = await api(`/api/matches/${m.match.id}`);
  return {
    id: m.match.id, teamA: a.team, teamB: b.team,
    inn: st.match.innings[0],
    bat: st.match.squadPlayers.filter(p => p.teamId === a.team.id),
    bowl: st.match.squadPlayers.filter(p => p.teamId === b.team.id),
  };
}

async function main() {
  console.log('\n=== CONSECUTIVE-OVER RESTRICTION ===');
  {
    const g = await makeMatch(4, 4, 3);
    const ball = (bowler, extra = {}) => api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: g.inn.id, strikerId: g.bat[0].playerId,
      nonStrikerId: g.bat[1].playerId, bowlerId: bowler, runsBat: 0, extraType: 'NONE', ...extra } });

    // Bowl a full over with the same bowler.
    for (let i = 0; i < 6; i++) {
      const r = await ball(g.bowl[0].playerId);
      check(`ball ${i + 1} of the over accepted`, r.success, r.error);
    }
    const same = await ball(g.bowl[0].playerId);
    check('same bowler is refused a second over in a row', !same.success, JSON.stringify(same).slice(0, 160));
    check('the refusal names the bowler', (same.error || '').includes('previous over'), same.error);

    const different = await ball(g.bowl[1].playerId);
    check('a different bowler is accepted', different.success, different.error);

    // Back at the same bowler after someone else's over — now legal.
    for (let i = 0; i < 5; i++) await ball(g.bowl[1].playerId);
    const back = await ball(g.bowl[0].playerId);
    check('the first bowler may return after an over off', back.success, back.error);

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  console.log('\n=== LAST MAN STANDING (squad of 4) ===');
  {
    const g = await makeMatch(4, 4, 10);
    const out = (dismissed, bowler) => api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: g.inn.id, strikerId: dismissed,
      nonStrikerId: g.bat[3].playerId, bowlerId: bowler,
      runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'BOWLED', dismissedId: dismissed } });

    let r;
    // A squad of 4 must lose all 4 wickets, not 3.
    for (let i = 0; i < 3; i++) {
      r = await out(g.bat[i].playerId, g.bowl[i % 2].playerId);
      check(`wicket ${i + 1} of 4 keeps the innings alive`, r.success && !r.updatedInnings.isCompleted,
        JSON.stringify(r.updatedInnings || r));
    }
    r = await out(g.bat[3].playerId, g.bowl[0].playerId);
    check('the 4th wicket ends the innings (last man standing)', r.updatedInnings.isCompleted === true);
    check('end reason is ALL_OUT', r.updatedInnings.endReason === 'ALL_OUT', r.updatedInnings.endReason);

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  console.log('\n=== STANDARD ALL-OUT (squad of 8) ===');
  {
    const g = await makeMatch(8, 8, 10);
    const out = (dismissed, ns, bowler) => api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: g.inn.id, strikerId: dismissed, nonStrikerId: ns, bowlerId: bowler,
      runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'BOWLED', dismissedId: dismissed } });

    let r;
    for (let i = 0; i < 6; i++) {
      r = await out(g.bat[i].playerId, g.bat[7].playerId, g.bowl[i % 2].playerId);
      check(`wicket ${i + 1} of 7 keeps the innings alive`, !r.updatedInnings.isCompleted);
    }
    r = await out(g.bat[6].playerId, g.bat[7].playerId, g.bowl[0].playerId);
    check('a squad of 8 is all out at 7 wickets', r.updatedInnings.isCompleted === true, JSON.stringify(r.updatedInnings));

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  console.log('\n=== SQUAD EDITING GUARDS ===');
  {
    const g = await makeMatch(4, 4, 3);
    await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: g.inn.id, strikerId: g.bat[0].playerId,
      nonStrikerId: g.bat[1].playerId, bowlerId: g.bowl[0].playerId, runsBat: 1, extraType: 'NONE' } });

    const dropUsed = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setSquad', teamId: g.teamA.id,
      players: [{ playerName: g.bat[2].playerName }, { playerName: g.bat[3].playerName }] } });
    check('dropping a player who has already batted is refused', !dropUsed.success, JSON.stringify(dropUsed).slice(0,180));

    const dupes = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setSquad', teamId: g.teamB.id,
      players: [{ playerName: 'Same Name' }, { playerName: 'same name' }] } });
    check('duplicate names in a squad are refused', !dupes.success);

    const wrongTeam = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setSquad', teamId: 'not-a-team', players: [{ playerName: 'X' }] } });
    check('a squad for a team not in the match is refused', !wrongTeam.success);

    const addOk = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setSquad', teamId: g.teamA.id,
      players: g.bat.map(p => ({ playerName: p.playerName, playerId: p.playerId }))
        .concat([{ playerName: `Late Sub ${rid}` }]) } });
    check('adding a substitute mid-match is allowed', addOk.success, JSON.stringify(addOk).slice(0,180));

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  console.log('\n=== RETIRED HURT, RETURN, AND DISMISSED BATTERS ===');
  {
    const g = await makeMatch(4, 2, 10);
    const ball = (x) => api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: g.inn.id, bowlerId: g.bowl[0].playerId, ...x } });

    await ball({ strikerId: g.bat[0].playerId, nonStrikerId: g.bat[1].playerId, runsBat: 4, extraType: 'NONE' });
    let r = await ball({ strikerId: g.bat[0].playerId, nonStrikerId: g.bat[1].playerId, runsBat: 0,
      extraType: 'NONE', isWicket: true, wicketType: 'RETIRED_HURT', dismissedId: g.bat[0].playerId });
    check('retired hurt is not a team wicket', r.updatedInnings.totalWickets === 0, String(r.updatedInnings.totalWickets));

    let st = await api(`/api/matches/${g.id}`);
    let card = st.match.battingScores.find(x => x.playerId === g.bat[0].playerId);
    check('retired batter is flagged retired, not out', card.isRetired === true && card.isOut === false);
    check('retired batter keeps the runs already made', card.runs === 4);

    await ball({ strikerId: g.bat[2].playerId, nonStrikerId: g.bat[1].playerId, runsBat: 6, extraType: 'NONE' });
    r = await ball({ strikerId: g.bat[0].playerId, nonStrikerId: g.bat[1].playerId, runsBat: 2, extraType: 'NONE' });
    check('a retired batter may resume later in the innings', r.success, r.error);

    st = await api(`/api/matches/${g.id}`);
    card = st.match.battingScores.find(x => x.playerId === g.bat[0].playerId);
    check('resumed runs are added to the same card', card.runs === 6, String(card.runs));
    check('the retirement note is cleared once they resume', card.isRetired === false, JSON.stringify(card));

    // Retired out, by contrast, is a wicket that the bowler does not get.
    r = await ball({ strikerId: g.bat[1].playerId, nonStrikerId: g.bat[0].playerId, runsBat: 0,
      extraType: 'NONE', isWicket: true, wicketType: 'RETIRED_OUT', dismissedId: g.bat[1].playerId });
    check('retired out counts as a team wicket', r.updatedInnings.totalWickets === 1, String(r.updatedInnings.totalWickets));
    st = await api(`/api/matches/${g.id}`);
    const bowlCard = st.match.bowlingFigures.find(x => x.playerId === g.bowl[0].playerId);
    check('retired out is not credited to the bowler', bowlCard.wickets === 0, String(bowlCard.wickets));

    const backAgain = await ball({ strikerId: g.bat[1].playerId, nonStrikerId: g.bat[0].playerId, runsBat: 1, extraType: 'NONE' });
    check('a dismissed batter cannot bat again', !backAgain.success, JSON.stringify(backAgain).slice(0, 160));

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  console.log('\n=== TIE-BREAKER ===');
  {
    const g = await makeMatch(4, 4, 2);
    const bat2 = g.bowl;
    // Both sides make 6.
    for (const [innIdx, batters, bowlers] of [[0, g.bat, g.bowl], [1, g.bowl, g.bat]]) {
      const cur = await api(`/api/matches/${g.id}`);
      const inn = cur.match.innings[innIdx];
      await api(`/api/matches/${g.id}`, { method: 'POST', body: {
        action: 'delivery', inningsId: inn.id, strikerId: batters[0].playerId,
        nonStrikerId: batters[1].playerId, bowlerId: bowlers[0].playerId, runsBat: 6, extraType: 'NONE' } });
      const after = await api(`/api/matches/${g.id}`);
      const i2 = after.match.innings[innIdx];
      if (!i2.isCompleted) {
        await api(`/api/matches/${g.id}`, { method: 'POST', body: { action: 'endInnings', inningsId: i2.id } });
      }
    }

    let st = await api(`/api/matches/${g.id}`);
    check('level scores are recorded as a tie', st.match.resultType === 'TIE', `${st.match.resultType} / ${st.match.resultSummary}`);
    check('a tie has no winner', st.match.winnerId === null);

    const bad = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setTieBreakWinner', winnerId: 'someone-else' } });
    check('a tie-breaker winner outside the match is refused', !bad.success);

    const tb = await api(`/api/matches/${g.id}`, { method: 'POST', body: {
      action: 'setTieBreakWinner', winnerId: g.teamB.id, method: 'SUPER_OVER' } });
    check('super-over winner recorded', tb.success, JSON.stringify(tb).slice(0,160));

    st = await api(`/api/matches/${g.id}`);
    check('the tie-breaker sets the winner', st.match.winnerId === g.teamB.id);
    check('result summary mentions the super over', (st.match.resultSummary || '').includes('super over'), st.match.resultSummary);
    check('resultType becomes SUPER_OVER', st.match.resultType === 'SUPER_OVER');

    const cleared = await api(`/api/matches/${g.id}`, { method: 'POST', body: { action: 'setTieBreakWinner', winnerId: null } });
    check('the tie-breaker can be cleared back to a tie', cleared.success);
    st = await api(`/api/matches/${g.id}`);
    check('clearing restores the tie', st.match.resultType === 'TIE' && st.match.winnerId === null);

    await api(`/api/matches/${g.id}`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamA.id}?force=true`, { method: 'DELETE' });
    await api(`/api/teams/${g.teamB.id}?force=true`, { method: 'DELETE' });
  }

  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
