# TapeBall Pro

A tape-ball cricket platform: run tournaments, score matches ball by ball on a
phone at the ground, and get points tables, Net Run Rate, knockout brackets and
player statistics without doing any arithmetic yourself.

## Getting started

```bash
npm install
npm run setup      # generates the Prisma client, creates the database, loads starter teams
npm run dev        # http://localhost:3000
```

`npm run setup` **wipes the database** and loads two starter teams with six
players each. Skip it and run `npm run db:push` alone if you already have data.

## Access control

Set `ADMIN_PASSWORD` (copy `.env.example` to `.env`) and every write — scoring,
editing, deleting — needs a sign-in at `/login`; reads stay public so spectators
can follow a live score. The session is an HttpOnly cookie, and API clients can
send `Authorization: Bearer <password>` instead. With the variable unset the
site runs open, which is fine on a private network at the ground but not on
the internet.

## What you can do

**Matches**
- Create a single match by typing team and player names — anything new is
  registered automatically.
- Toss, then score every ball: runs, wides, no-balls, byes, leg byes, and every
  dismissal type including run outs of the non-striker and retired hurt.
- Free hits are tracked automatically after a no-ball, with the dismissals that
  do not count blocked at entry.
- Undo the last ball at any time, including across the innings break.
- End an innings early, abandon a match as a no result, or reset it completely.
- Edit the venue, date and over count; delete a match and everything it holds.
- Player of the match is suggested automatically from the scorecard, ranked and
  explained, with any player selectable as an override.
- Settle a tied knockout with a super over or bowl-out result.
- Delete a match at any point, finished ones included.

**Tournaments**
- Build the team list on the spot: type a new team's name and its players, or
  pick a team that is already registered. Every team can be removed again and
  put into a group (A, B, C…); groups are optional.
- Fixtures are generated only when you press **Generate league fixtures** on
  the tournament page, so teams and groups can still change after creation.
  Every team then plays every other team in its group once. Without groups the
  whole field is one league (the API still accepts `matchesPerTeam` to shorten
  that; with an odd number of teams it must be even).
- The points table shows one standings table per group, ranked inside the
  group, with Net Run Rate; it is rebuilt from scratch whenever a result changes
  — including after a deletion.
- Seed a knockout bracket from the standings. With two groups the semi-finals
  are A1 v B2 and B1 v A2; with four groups the quarter-finals cross the groups
  the same way; otherwise the top 4 or 8 overall qualify. Winners feed into the
  next round automatically; later rounds show as "Winner of SF1" until decided
  and cannot be started early — a tied feeder has to be settled with a super
  over or bowl-out first.
- Create teams inline, add or remove teams, move them between groups,
  regenerate fixtures, edit settings, delete the tournament.

**Teams, players and statistics**
- Full create/edit/delete for teams and players; add and remove players from a
  team's squad on the team page (a player who has already played for the team
  stays on the record).
- Career pages per player: batting, bowling and fielding across every match.
- Platform-wide and per-tournament leaderboards.
- CSV export for points tables, player statistics, results and single scorecards.

## Tape-ball rules the engine applies

| Rule | Behaviour |
| --- | --- |
| Squad of 5 or fewer | Last man standing — every batter must be dismissed |
| Squad of 6 or more | All out one wicket short, as in the full game |
| Wide / no-ball | One run plus anything run or hit; the ball is re-bowled |
| Free hit | The ball after a no-ball: only a run out or obstructing the field can dismiss the striker. An unused free hit carries over a wide or another no-ball |
| Bye / leg bye | A legal ball; runs go to the team, not the batter or the bowler |
| Retired hurt | Not a wicket; the batter may return later in the innings |
| Run out, retired | Not credited to the bowler |
| Consecutive overs | A bowler cannot bowl two overs in a row, enforced server-side |
| Points | Win 2, tie 1, no result 1; ties split on Net Run Rate |
| NRR | A side bowled out is charged its full quota of overs |

## How the player-of-the-match suggestion works

Tape-ball overs go for far more runs than a hard-ball game, so "most runs wins"
picks the wrong player. Instead every performance is measured against the par set
by *this match* — the run rate the two sides actually managed:

- A batter is credited for runs made **beyond** what a par batter would make off
  the same balls, plus volume, boundaries (sixes weighted heavily) and their share
  of the team total.
- A bowler is credited for runs **saved** against that same par, plus wickets,
  dot balls and maidens.
- A wicket is priced at roughly **1.25 par overs** — so in a 12-an-over game it is
  worth about 15 runs, and in a 7-an-over game about 9. Cheap runs make wickets
  the scarcer currency, which is exactly the tape-ball adjustment.
- Catches, run outs and stumpings add a little, and the winning side gets a modest
  multiplier, since the award nearly always follows the result.

Ball type only supplies a starting prior (11 an over for tape and tennis, 8 for
leather), which the match's own scoring quickly overrides. The engine lives in
[`src/lib/potm.ts`](src/lib/potm.ts) and always shows its reasoning, so the pick
can be checked and overridden.

## How scoring works internally

The ball-by-ball log is the only source of truth. Every innings total, batting
card, bowling card, wicket, innings closure and match result is recomputed from
that log by `rebuildMatch` in [`src/lib/scorebook.ts`](src/lib/scorebook.ts).
Recording a ball and undoing a ball both simply change the log and re-run it, so
the two paths cannot disagree with each other.

Shared rules live in [`src/lib/matchRules.ts`](src/lib/matchRules.ts) and points
and leaderboards in [`src/lib/tournamentStats.ts`](src/lib/tournamentStats.ts).
The delivery endpoint does not trust the console: batters must belong to the
side batting and the bowler and fielder to the side bowling, an abandoned match
cannot be scored or abandoned again, and a completed one cannot be abandoned.

## Tests

Integration tests run against a live server:

```bash
npm run dev                 # terminal 1
npm test                    # terminal 2
BASE_URL=http://localhost:3111 npm test   # or point it elsewhere
```

They cover the scoring engine's arithmetic, the tape-ball rules, tournament
progression, fixture balance, knockout placeholders, server-side squad
validation, the admin session, typed-in teams with groups and every page's
rendering and links. The suites
create their own randomly named data and delete it afterwards, so they are safe
to run against a database that already holds real matches. When the server has
`ADMIN_PASSWORD` set, run the tests with the same variable so they can write:

```bash
ADMIN_PASSWORD=yourpassword npm test
```

```bash
npm run lint        # type check (tsc --noEmit)
npm run build       # production build
```

Note: Next 16 no longer bundles `next lint`, so `npm run lint` runs the
TypeScript check. Add `eslint` and `eslint-config-next` to devDependencies if you
want ESLint back.

## Stack

Next.js 16 (App Router), React 19, Tailwind CSS, Prisma with SQLite. The database
is a single file at `prisma/dev.db`. Every dependency, environment variable and
setup step is also listed in [`requirements.txt`](requirements.txt).
