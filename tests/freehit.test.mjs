const BASE = process.env.BASE_URL || 'http://localhost:3000';
// With ADMIN_PASSWORD set, writes need the organiser session; send it as a Bearer token.
const AUTH_HEADERS = { 'Content-Type': 'application/json', ...(process.env.ADMIN_PASSWORD ? { Authorization: `Bearer ${process.env.ADMIN_PASSWORD}` } : {}) };
let pass=0, fail=0; const failures=[];
function check(n,c,d){ if(c){pass++;console.log('  ok  '+n);} else {fail++;failures.push(n+(d?' :: '+d:''));console.log('  FAIL '+n+' '+(d||''));} }
async function api(p,o={}){const r=await fetch(BASE+p,{headers:AUTH_HEADERS,...o,body:o.body?JSON.stringify(o.body):undefined});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j={raw:t.slice(0,200)}}return{status:r.status,...j};}
const rid=Math.random().toString(36).slice(2,6);

// Free hit: a no-ball earns the striker a delivery on which only a run out (or
// obstructing the field) can dismiss them.
(async()=>{
  const a=await api('/api/teams',{method:'POST',body:{name:`FH-A ${rid}`,shortName:'FHA'}});
  const b=await api('/api/teams',{method:'POST',body:{name:`FH-B ${rid}`,shortName:'FHB'}});
  const m=await api('/api/matches',{method:'POST',body:{homeTeamId:a.team.id,awayTeamId:b.team.id,venue:'FH',overs:20,
    teamASquad:[0,1,2,3,4,5].map(i=>({playerName:`FHA${i}-${rid}`})),teamBSquad:[0,1].map(i=>({playerName:`FHB${i}-${rid}`}))}});
  await api(`/api/matches/${m.match.id}`,{method:'POST',body:{action:'toss',tossWinnerId:a.team.id,tossDecision:'BAT'}});
  const st=await api(`/api/matches/${m.match.id}`);
  const inn=st.match.innings[0];
  const bat=st.match.squadPlayers.filter(p=>p.teamId===a.team.id);
  const bowl=st.match.squadPlayers.filter(p=>p.teamId===b.team.id);
  let S=0, NS=1, B=0;
  const ball=(x)=>api(`/api/matches/${m.match.id}`,{method:'POST',body:{action:'delivery',inningsId:inn.id,
    strikerId:bat[S].playerId,nonStrikerId:bat[NS].playerId,bowlerId:bowl[B].playerId,runsBat:0,extraType:'NONE',...x}});

  console.log('\n=== NO BALL SETS UP A FREE HIT ===');
  let r = await ball({ runsBat: 1, extraType: 'NONE' });
  check('normal ball does not set a free hit', r.nextBallIsFreeHit === false, JSON.stringify(r.nextBallIsFreeHit));

  r = await ball({ runsBat: 0, extraType: 'NO_BALL' });
  check('a no-ball sets up a free hit', r.nextBallIsFreeHit === true);
  check('the no-ball itself is not a free hit', r.wasFreeHit === false);

  console.log('\n=== ON THE FREE HIT: NOT OUT ===');
  for (const wt of ['BOWLED','CAUGHT','LBW','STUMPED','HIT_WICKET']) {
    const res = await ball({ isWicket: true, wicketType: wt, dismissedId: bat[S].playerId, fielderId: bowl[1].playerId });
    check(`${wt} is refused on a free hit`, !res.success, JSON.stringify(res).slice(0,140));
  }
  // Refusals must not consume the free hit or add a ball.
  let cur = await api(`/api/matches/${m.match.id}`);
  check('refused dismissals did not change the score', cur.match.innings[0].totalRuns === 2, String(cur.match.innings[0].totalRuns));
  check('refused dismissals did not add a legal ball', cur.match.innings[0].legalBalls === 1, String(cur.match.innings[0].legalBalls));

  console.log('\n=== ON THE FREE HIT: RUN OUT STILL COUNTS ===');
  r = await ball({ isWicket: true, wicketType: 'RUN_OUT', dismissedId: bat[NS].playerId, fielderId: bowl[1].playerId });
  check('run out IS allowed on a free hit', r.success, JSON.stringify(r).slice(0,160));
  check('the run out is recorded as a wicket', r.updatedInnings.totalWickets === 1, String(r.updatedInnings.totalWickets));
  check('that ball was flagged as a free hit', r.wasFreeHit === true);
  check('free hit is used up by the legal ball', r.nextBallIsFreeHit === false);

  console.log('\n=== FREE HIT CARRIES OVER A WIDE ===');
  NS = 2;
  r = await ball({ runsBat: 0, extraType: 'NO_BALL' });
  check('no-ball sets up the free hit again', r.nextBallIsFreeHit === true);
  r = await ball({ runsBat: 0, extraType: 'WIDE', runsExtra: 0 });
  check('a wide does not use up the free hit', r.nextBallIsFreeHit === true, JSON.stringify(r.nextBallIsFreeHit));
  const stillBlocked = await ball({ isWicket: true, wicketType: 'BOWLED', dismissedId: bat[S].playerId });
  check('still not out after the wide', !stillBlocked.success);
  r = await ball({ runsBat: 2, extraType: 'NONE' });
  check('a legal ball finally uses up the free hit', r.nextBallIsFreeHit === false);

  const nowOut = await ball({ isWicket: true, wicketType: 'BOWLED', dismissedId: bat[S].playerId });
  check('bowled counts again once the free hit is gone', nowOut.success, JSON.stringify(nowOut).slice(0,140));

  console.log('\n=== FREE HIT CARRIES ACROSS AN OVER ===');
  S = 3; NS = 4;
  cur = await api(`/api/matches/${m.match.id}`);
  let balls = cur.match.innings[0].legalBalls;
  // Fill up to the last ball of the current over.
  while ((balls % 6) !== 5) {
    r = await ball({ runsBat: 0, extraType: 'NONE' });
    if (!r.success) { check('filler ball accepted', false, JSON.stringify(r).slice(0,160)); break; }
    balls = r.updatedInnings.legalBalls;
    if (r.updatedInnings.isOverEnd) B = 1 - B;   // a bowler cannot bowl two overs running
  }
  r = await ball({ runsBat: 0, extraType: 'NO_BALL' });   // no-ball on the last ball of the over
  check('no-ball late in the over sets a free hit', r.nextBallIsFreeHit === true);
  r = await ball({ runsBat: 0, extraType: 'NONE' });       // completes the over
  check('over completed', r.updatedInnings.isOverEnd === true, JSON.stringify(r.updatedInnings));
  check('that last ball of the over was the free hit', r.wasFreeHit === true);
  B = 1 - B;   // new over, new bowler

  console.log('\n=== NO-BALL ON THE FREE HIT KEEPS IT ALIVE ===');
  r = await ball({ runsBat: 0, extraType: 'NO_BALL' });
  check('no-ball sets a free hit', r.nextBallIsFreeHit === true, JSON.stringify(r).slice(0,160));
  r = await ball({ runsBat: 0, extraType: 'NO_BALL' });
  check('another no-ball keeps the free hit', r.nextBallIsFreeHit === true, JSON.stringify(r).slice(0,160));

  console.log('\n=== PERSISTENCE + COMMENTARY ===');
  cur = await api(`/api/matches/${m.match.id}`);
  const withFlag = cur.match.innings[0].deliveries.filter(d => d.isFreeHit);
  check('free-hit balls are stored with the flag', withFlag.length >= 3, `got ${withFlag.length}`);
  check('commentary marks the free hit', withFlag.some(d => (d.commentary||'').includes('FREE HIT')),
    JSON.stringify(withFlag[0]?.commentary));

  console.log('\n=== UNDO RESTORES THE FREE HIT ===');
  const before = (await api(`/api/matches/${m.match.id}`)).match.innings[0].deliveries[0];
  check('last ball was a no-ball', before.extraType === 'NO_BALL', before.extraType);
  await api(`/api/matches/${m.match.id}`,{method:'POST',body:{action:'undo'}});
  const after = (await api(`/api/matches/${m.match.id}`)).match.innings[0].deliveries[0];
  check('undo left the previous no-ball in place', after.extraType === 'NO_BALL', after.extraType);
  const blockedAgain = await ball({ isWicket: true, wicketType: 'CAUGHT', dismissedId: bat[S].playerId, fielderId: bowl[1].playerId });
  check('free hit still applies after an undo', !blockedAgain.success, JSON.stringify(blockedAgain).slice(0,140));

  await api(`/api/matches/${m.match.id}`,{method:'DELETE'});
  await api(`/api/teams/${a.team.id}?force=true`,{method:'DELETE'});
  await api(`/api/teams/${b.team.id}?force=true`,{method:'DELETE'});
  for (const p of (await api(`/api/players?q=${rid}`)).players||[]) await api(`/api/players/${p.id}?force=true`,{method:'DELETE'});

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if(failures.length){console.log('\nFailures:');failures.forEach(f=>console.log('  - '+f));}
  process.exit(fail?1:0);
})();
