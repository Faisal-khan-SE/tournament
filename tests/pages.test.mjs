// Renders every page and checks for HTTP errors, Next.js error overlays and
// links that point at routes which do not exist.
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

async function page(path) {
  const res = await fetch(BASE + path, { headers: AUTH_HEADERS });
  const html = await res.text();
  return { status: res.status, html };
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

async function main() {
  // Build a small amount of real data so pages have something to render.
  const tA = await api('/api/teams', { method: 'POST', body: { name: `Page A ${rid}`, shortName: 'PA' + rid.slice(0,2) } });
  const tB = await api('/api/teams', { method: 'POST', body: { name: `Page B ${rid}`, shortName: 'PB' + rid.slice(0,2) } });
  const m = await api('/api/matches', { method: 'POST', body: {
    matchType: 'SINGLE', homeTeamId: tA.team.id, awayTeamId: tB.team.id, venue: 'Page Ground', overs: 2,
    teamASquad: [1,2,3,4].map(n => ({ playerName: `PA${n}-${rid}` })),
    teamBSquad: [1,2,3,4].map(n => ({ playerName: `PB${n}-${rid}` })) } });
  const tour = await api('/api/tournaments', { method: 'POST', body: {
    name: `Page Cup ${rid}`, venue: 'Page Ground', defaultOvers: 2,
    teamIds: [tA.team.id, tB.team.id], matchesPerTeam: 1, generateFixtures: true } });

  // Score a few balls so scorecards, stats and commentary have content.
  await api(`/api/matches/${m.match.id}`, { method: 'POST', body: { action: 'toss', tossWinnerId: tA.team.id, tossDecision: 'BAT' } });
  const st = await api(`/api/matches/${m.match.id}`);
  const inn = st.match.innings[0];
  const bat = st.match.squadPlayers.filter(p => p.teamId === tA.team.id);
  const bowl = st.match.squadPlayers.filter(p => p.teamId === tB.team.id);
  for (const spec of [{ runsBat: 4, extraType: 'NONE' }, { runsBat: 0, extraType: 'WIDE', runsExtra: 1 },
                      { runsBat: 6, extraType: 'NONE' }, { runsBat: 0, extraType: 'NONE', isWicket: true, wicketType: 'CAUGHT', dismissedId: bat[0].playerId, fielderId: bowl[1].playerId }]) {
    await api(`/api/matches/${m.match.id}`, { method: 'POST', body: {
      action: 'delivery', inningsId: inn.id, strikerId: bat[0].playerId,
      nonStrikerId: bat[1].playerId, bowlerId: bowl[0].playerId, ...spec } });
  }

  const playerId = bat[0].playerId;

  // Static text each page must server-render, so a blank or crashed page is caught.
  const routes = [
    ['/', 'Home', 'Run your tournament'],
    ['/matches', 'Matches list', 'Matches'],
    ['/teams', 'Teams list', 'Teams'],
    [`/teams/${tA.team.id}`, 'Team detail', 'Loading'],
    ['/players', 'Players list', 'Players'],
    [`/players/${playerId}`, 'Player profile', 'Loading'],
    ['/tournaments', 'Tournaments list', 'Tournaments'],
    [`/tournaments/${tour.tournament.slug}`, 'Tournament detail', 'Loading'],
    ['/tournaments/create', 'Create tournament', 'Loading'],
    ['/match/create', 'Create match', 'Loading'],
    [`/match/${m.match.id}`, 'Match detail', 'Loading'],
    [`/score/${m.match.id}`, 'Scoring console', 'Loading'],
    ['/admin', 'Admin panel', 'Loading'],
    ['/stats', 'Stats page', 'Loading'],
  ];

  console.log('\n=== PAGE RENDERING ===');
  const allHtml = [];
  for (const [path, label, marker] of routes) {
    const { status, html } = await page(path);
    allHtml.push({ path, html });
    // Next.js inlines its default 404 component into every RSC payload, so
    // scan the visible markup only, with scripts stripped out.
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
    const hasError =
      visible.includes('Application error') ||
      visible.includes('Unhandled Runtime Error') ||
      visible.includes('404: This page could not be found');
    check(`${label} (${path}) returns 200`, status === 200, `status ${status}`);
    check(`${label} renders without an error page`, !hasError);
    check(`${label} rendered its content`, visible.includes(marker), `missing "${marker}"`);
  }

  console.log('\n=== INTERNAL LINKS RESOLVE ===');
  // Collect every internal href the pages emit and confirm none 404s.
  const hrefs = new Set();
  for (const { html } of allHtml) {
    for (const m2 of html.matchAll(/href="(\/[^"#?]*)"/g)) hrefs.add(m2[1]);
  }
  const checked = [];
  for (const href of Array.from(hrefs)) {
    if (href.startsWith('/api/') || href.startsWith('/_next')) continue;
    const res = await fetch(BASE + href, { method: 'GET', headers: AUTH_HEADERS });
    checked.push([href, res.status]);
  }
  const broken = checked.filter(([, s]) => s >= 400);
  check(`all ${checked.length} internal links resolve`, broken.length === 0,
    broken.map(([h, s]) => `${h} -> ${s}`).join(', '));

  console.log('\n=== NAV + CONTENT SANITY ===');
  const home = allHtml.find(p => p.path === '/').html;
  check('home links to the tournaments route (not the old /tournament/)', !/href="\/tournament\/[^s]/.test(home));
  check('home shows the recent match', home.includes(`Page A ${rid}`) || home.includes(`Page B ${rid}`));

  // These pages hydrate then fetch, so verify the data they will render.
  const matchApi = await api(`/api/matches/${m.match.id}`);
  check('match page data includes the venue', matchApi.match.venue === 'Page Ground');
  check('match page data includes a scorecard', matchApi.match.battingScores.length > 0);
  check('match page exposes player-to-team mapping', Object.keys(matchApi.teamByPlayerId).length > 0);

  const tourApi = await api(`/api/tournaments/${tour.tournament.slug}`);
  check('tournament page data includes its name', tourApi.tournament.name === `Page Cup ${rid}`);
  check('tournament page data includes a points table', tourApi.tournament.pointsTable.length === 2);

  const notFound = await page('/tournaments/does-not-exist-xyz');
  check('unknown tournament renders a page rather than crashing', notFound.status === 200);

  const badMatch = await page('/match/00000000-0000-0000-0000-000000000000');
  check('unknown match renders a page rather than crashing', badMatch.status === 200);

  // Clean up.
  await api(`/api/matches/${m.match.id}`, { method: 'DELETE' });
  await api(`/api/tournaments/${tour.tournament.slug}?force=true`, { method: 'DELETE' });
  await api(`/api/teams/${tA.team.id}?force=true`, { method: 'DELETE' });
  await api(`/api/teams/${tB.team.id}?force=true`, { method: 'DELETE' });

  await cleanupPlayers(rid);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (failures.length) { console.log('\nFailures:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error('CRASH', e); process.exit(1); });
