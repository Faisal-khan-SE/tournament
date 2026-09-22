#!/usr/bin/env node
/**
 * Runs every integration suite against a running app.
 *
 *   npm run dev          # in one terminal
 *   npm test             # in another
 *
 * Point it somewhere else with BASE_URL, e.g.
 *   BASE_URL=http://localhost:3111 npm test
 *
 * The suites create their own teams, players and matches with randomised names
 * and delete them again at the end, so they are safe to run against a database
 * that already has real data in it.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const SUITES = [
  ['scoring.test.mjs', 'Scoring engine, extras, wickets, undo and deletion'],
  ['rules.test.mjs', 'Tape-ball rules, squad guards and tie-breakers'],
  ['freehit.test.mjs', 'Free hit after a no-ball'],
  ['potm.test.mjs', 'Player-of-the-match suggestion and completed-match deletion'],
  ['tournament.test.mjs', 'Fixtures, points, NRR and knockout progression'],
  ['hardening.test.mjs', 'Balanced fixtures, placeholder knockouts, squad validation and auth'],
  ['groups.test.mjs', 'Typed-in teams, groups, on-demand fixtures and group knockouts'],
  ['pages.test.mjs', 'Page rendering and internal links'],
];

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(here, file)], {
      stdio: 'inherit',
      env: { ...process.env, BASE_URL: BASE },
    });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function main() {
  // Fail fast with a useful message rather than a wall of fetch errors.
  try {
    const res = await fetch(`${BASE}/api/teams`);
    if (!res.ok) throw new Error(`responded ${res.status}`);
  } catch (e) {
    console.error(`\nCannot reach the app at ${BASE} (${e.message}).`);
    console.error('Start it with "npm run dev", or set BASE_URL to the right address.\n');
    process.exit(1);
  }

  console.log(`Running integration tests against ${BASE}\n`);

  const results = [];
  for (const [file, description] of SUITES) {
    console.log(`\n${'='.repeat(64)}\n${description}\n${'='.repeat(64)}`);
    results.push([description, await run(file)]);
  }

  console.log(`\n${'='.repeat(64)}\nSUMMARY\n${'='.repeat(64)}`);
  for (const [description, ok] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${description}`);
  }

  const failed = results.filter(([, ok]) => !ok).length;
  console.log(failed === 0 ? '\nAll suites passed.\n' : `\n${failed} suite(s) failed.\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
