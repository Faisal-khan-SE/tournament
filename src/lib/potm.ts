/**
 * Player-of-the-match suggestion, tuned for tape-ball cricket.
 *
 * The headline problem with a generic "most runs wins" rule is that tape-ball
 * overs go for far more runs than a hard-ball game — 11 to 14 an over is
 * ordinary where 7 or 8 would be good with a leather ball. So a 30 is much less
 * special, while a tight over or a wicket is worth much more.
 *
 * Rather than hard-code that, every performance is measured against the par set
 * by *this match*: the run rate the two sides actually managed. A batter is
 * credited for the runs they made beyond what a par batter would have made off
 * the same balls, and a bowler for the runs they saved against the same par.
 * Everything is expressed in one currency — "impact runs" — so batting, bowling
 * and fielding can be compared directly.
 *
 * The ball type only supplies a prior, used to steady the numbers in a match too
 * short to establish its own par.
 */

/** Expected runs per over before the match itself tells us otherwise. */
const BASELINE_ECONOMY: Record<string, number> = {
  TAPE_BALL: 11,
  TENNIS_BALL: 11,
  LEATHER_BALL: 8,
};

/** Strength of that prior, in balls. Six overs of evidence outweighs it. */
const PRIOR_BALLS = 36;

/**
 * What a wicket is worth, as a multiple of the par over.
 *
 * Taking a wicket ends an innings that was, on average, going to last a little
 * over an over — so in a 12-an-over game a wicket is worth roughly 15 runs,
 * while in a 7-an-over game it is worth about 9. That is exactly the tape-ball
 * adjustment: cheap runs make wickets the scarcer currency.
 */
const WICKET_VALUE_IN_OVERS = 1.25;

export interface PotmInput {
  ballType: string;
  winnerId: string | null;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  innings: {
    id: string;
    battingTeamId: string;
    bowlingTeamId: string;
    totalRuns: number;
    legalBalls: number;
  }[];
  battingScores: {
    playerId: string;
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    isOut: boolean;
    player: { fullName: string };
  }[];
  bowlingFigures: {
    playerId: string;
    legalBalls: number;
    runs: number;
    wickets: number;
    player: { fullName: string };
  }[];
  deliveries: {
    inningsId: string;
    overNo: number;
    bowlerId: string;
    runsTotal: number;
    isLegal: boolean;
    extraType: string;
  }[];
  wickets: { fielderId: string | null; wicketType: string }[];
  squadPlayers: { playerId: string | null; teamId: string; playerName: string }[];
}

export interface PotmCandidate {
  playerId: string;
  name: string;
  teamId: string | null;
  teamName: string;
  onWinningTeam: boolean;
  score: number;
  batting: {
    runs: number;
    balls: number;
    fours: number;
    sixes: number;
    isOut: boolean;
    strikeRate: number;
    shareOfTeamRuns: number;
    impact: number;
  } | null;
  bowling: {
    overs: string;
    legalBalls: number;
    runs: number;
    wickets: number;
    economy: number;
    dots: number;
    maidens: number;
    impact: number;
  } | null;
  fielding: { catches: number; runOuts: number; stumpings: number; impact: number } | null;
  reasons: string[];
  summary: string;
}

export interface PotmResult {
  candidates: PotmCandidate[];
  par: {
    economy: number;
    strikeRate: number;
    wicketValue: number;
    matchRunRate: number;
    basedOn: string;
  };
}

function oversText(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export function suggestPlayerOfTheMatch(input: PotmInput): PotmResult {
  const baseline = BASELINE_ECONOMY[input.ballType] ?? BASELINE_ECONOMY.TAPE_BALL;

  // ---- Par for this match ----
  const matchRuns = input.innings.reduce((a, i) => a + i.totalRuns, 0);
  const matchBalls = input.innings.reduce((a, i) => a + i.legalBalls, 0);
  const matchRunRate = matchBalls > 0 ? matchRuns / (matchBalls / 6) : baseline;

  // Blend the observed rate with the prior so a two-over match is not decided by
  // one freak over.
  const parEconomy =
    (matchRunRate * matchBalls + baseline * PRIOR_BALLS) / (matchBalls + PRIOR_BALLS);

  const batRuns = input.battingScores.reduce((a, b) => a + b.runs, 0);
  const batBalls = input.battingScores.reduce((a, b) => a + b.balls, 0);
  const observedSR = batBalls > 0 ? (batRuns / batBalls) * 100 : (parEconomy / 6) * 100;
  const parStrikeRate =
    (observedSR * batBalls + (baseline / 6) * 100 * PRIOR_BALLS) / (batBalls + PRIOR_BALLS);

  const wicketValue = parEconomy * WICKET_VALUE_IN_OVERS;

  // ---- Lookups ----
  const teamOf = new Map<string, string>();
  input.squadPlayers.forEach((sp) => {
    if (sp.playerId) teamOf.set(sp.playerId, sp.teamId);
  });

  const teamName = (teamId: string | null) =>
    teamId === input.homeTeamId
      ? input.homeTeamName
      : teamId === input.awayTeamId
      ? input.awayTeamName
      : '—';

  // Runs the batting side made in each innings, for share-of-total credit.
  const teamRuns = new Map<string, number>();
  input.innings.forEach((i) => {
    teamRuns.set(i.battingTeamId, (teamRuns.get(i.battingTeamId) || 0) + i.totalRuns);
  });

  // ---- Dot balls and maidens per bowler ----
  const dots = new Map<string, number>();
  const overRuns = new Map<string, { charged: number; legal: number; bowlerId: string }>();

  for (const d of input.deliveries) {
    // Byes and leg byes are not the bowler's fault, so they neither break a
    // maiden nor count against the economy.
    const charged = d.extraType === 'BYE' || d.extraType === 'LEG_BYE' ? 0 : d.runsTotal;
    if (d.isLegal && charged === 0) {
      dots.set(d.bowlerId, (dots.get(d.bowlerId) || 0) + 1);
    }
    const key = `${d.inningsId}|${d.overNo}|${d.bowlerId}`;
    const entry = overRuns.get(key) || { charged: 0, legal: 0, bowlerId: d.bowlerId };
    entry.charged += charged;
    if (d.isLegal) entry.legal += 1;
    overRuns.set(key, entry);
  }

  const maidens = new Map<string, number>();
  overRuns.forEach((v) => {
    if (v.legal === 6 && v.charged === 0) {
      maidens.set(v.bowlerId, (maidens.get(v.bowlerId) || 0) + 1);
    }
  });

  // ---- Fielding ----
  const fielding = new Map<string, { catches: number; runOuts: number; stumpings: number }>();
  for (const w of input.wickets) {
    if (!w.fielderId) continue;
    const f = fielding.get(w.fielderId) || { catches: 0, runOuts: 0, stumpings: 0 };
    if (w.wicketType === 'CAUGHT') f.catches += 1;
    else if (w.wicketType === 'RUN_OUT') f.runOuts += 1;
    else if (w.wicketType === 'STUMPED') f.stumpings += 1;
    fielding.set(w.fielderId, f);
  }

  // ---- Build candidates ----
  const byPlayer = new Map<string, PotmCandidate>();

  const ensure = (playerId: string, name: string): PotmCandidate => {
    let c = byPlayer.get(playerId);
    if (!c) {
      const teamId = teamOf.get(playerId) ?? null;
      c = {
        playerId,
        name,
        teamId,
        teamName: teamName(teamId),
        onWinningTeam: !!input.winnerId && teamId === input.winnerId,
        score: 0,
        batting: null,
        bowling: null,
        fielding: null,
        reasons: [],
        summary: '',
      };
      byPlayer.set(playerId, c);
    }
    return c;
  };

  // Batting
  for (const b of input.battingScores) {
    if (b.balls === 0 && b.runs === 0 && !b.isOut) continue;
    const c = ensure(b.playerId, b.player.fullName);
    const strikeRate = b.balls > 0 ? (b.runs / b.balls) * 100 : 0;
    const teamTotal = teamRuns.get(teamOf.get(b.playerId) || '') || 0;
    const share = teamTotal > 0 ? b.runs / teamTotal : 0;

    // Runs beyond what a par batter makes off the same number of balls.
    const runsAbovePar = b.runs - (parStrikeRate / 100) * b.balls;

    const impact =
      b.runs * 0.35 + // volume still counts for something
      runsAbovePar * 0.8 + // but efficiency against this match's par counts more
      b.fours * 0.5 +
      b.sixes * 1.5 + // sixes decide tape-ball games
      share * 20 + // carrying the innings
      (!b.isOut && b.runs >= 10 ? 4 : 0); // saw it through

    c.batting = {
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      isOut: b.isOut,
      strikeRate: Math.round(strikeRate * 100) / 100,
      shareOfTeamRuns: Math.round(share * 1000) / 10,
      impact: Math.round(impact * 10) / 10,
    };
    c.score += impact;
  }

  // Bowling
  for (const bw of input.bowlingFigures) {
    if (bw.legalBalls === 0 && bw.runs === 0) continue;
    const c = ensure(bw.playerId, bw.player.fullName);
    const overs = bw.legalBalls / 6;
    const economy = overs > 0 ? bw.runs / overs : 0;
    const d = dots.get(bw.playerId) || 0;
    const m = maidens.get(bw.playerId) || 0;

    const impact =
      bw.wickets * wicketValue + // wickets priced off this match's par over
      (parEconomy - economy) * overs + // runs saved against par
      d * 0.5 + // dots strangle a tape-ball chase
      m * 6;

    c.bowling = {
      overs: oversText(bw.legalBalls),
      legalBalls: bw.legalBalls,
      runs: bw.runs,
      wickets: bw.wickets,
      economy: Math.round(economy * 100) / 100,
      dots: d,
      maidens: m,
      impact: Math.round(impact * 10) / 10,
    };
    c.score += impact;
  }

  // Fielding
  fielding.forEach((f, playerId) => {
    const name =
      input.squadPlayers.find((sp) => sp.playerId === playerId)?.playerName ||
      input.battingScores.find((b) => b.playerId === playerId)?.player.fullName ||
      input.bowlingFigures.find((b) => b.playerId === playerId)?.player.fullName;
    if (!name) return;
    const c = ensure(playerId, name);
    const impact = f.catches * 3 + f.runOuts * 4 + f.stumpings * 4;
    c.fielding = { ...f, impact: Math.round(impact * 10) / 10 };
    c.score += impact;
  });

  // The award almost always follows the result, but a big enough performance on
  // the losing side can still come through.
  const candidates = Array.from(byPlayer.values()).map((c) => {
    if (input.winnerId) c.score *= c.onWinningTeam ? 1.2 : 0.9;
    c.score = Math.round(c.score * 10) / 10;

    const reasons: string[] = [];
    if (c.batting && (c.batting.balls > 0 || c.batting.runs > 0)) {
      const bits = [`${c.batting.runs}${c.batting.isOut ? '' : '*'} off ${c.batting.balls}`];
      if (c.batting.balls > 0) bits.push(`SR ${c.batting.strikeRate.toFixed(0)}`);
      if (c.batting.sixes > 0) bits.push(`${c.batting.sixes}×6`);
      if (c.batting.fours > 0) bits.push(`${c.batting.fours}×4`);
      let line = bits.join(', ');
      if (c.batting.shareOfTeamRuns >= 30) {
        line += ` — ${c.batting.shareOfTeamRuns.toFixed(0)}% of the team's runs`;
      }
      reasons.push(line);
    }
    if (c.bowling) {
      const bits = [`${c.bowling.wickets}/${c.bowling.runs} from ${c.bowling.overs}`];
      bits.push(`econ ${c.bowling.economy.toFixed(2)} v par ${parEconomy.toFixed(2)}`);
      if (c.bowling.maidens > 0) bits.push(`${c.bowling.maidens} maiden`);
      else if (c.bowling.dots >= 6) bits.push(`${c.bowling.dots} dots`);
      reasons.push(bits.join(', '));
    }
    if (c.fielding) {
      const bits: string[] = [];
      if (c.fielding.catches) bits.push(`${c.fielding.catches} catch${c.fielding.catches > 1 ? 'es' : ''}`);
      if (c.fielding.runOuts) bits.push(`${c.fielding.runOuts} run out${c.fielding.runOuts > 1 ? 's' : ''}`);
      if (c.fielding.stumpings) bits.push(`${c.fielding.stumpings} stumping${c.fielding.stumpings > 1 ? 's' : ''}`);
      if (bits.length) reasons.push(bits.join(', '));
    }

    c.reasons = reasons;
    c.summary = reasons.join(' • ') || 'No recorded contribution';
    return c;
  });

  candidates.sort((a, b) => b.score - a.score);

  return {
    candidates,
    par: {
      economy: Math.round(parEconomy * 100) / 100,
      strikeRate: Math.round(parStrikeRate * 10) / 10,
      wicketValue: Math.round(wicketValue * 10) / 10,
      matchRunRate: Math.round(matchRunRate * 100) / 100,
      basedOn:
        matchBalls > 0
          ? `${matchRuns} runs off ${oversText(matchBalls)} overs in this match`
          : `${input.ballType.replace('_', ' ').toLowerCase()} baseline`,
    },
  };
}
