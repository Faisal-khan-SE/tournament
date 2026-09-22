export interface BattingStats {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  highestScore: number;
  notOuts: number;
  average: number;
  strikeRate: number;
  fifties: number;
  hundreds: number;
}

export interface BowlingStats {
  matches: number;
  overs: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
  bestBowling: string; // e.g. "3/12"
  economy: number;
  average: number;
  strikeRate: number;
}

export interface FieldingStats {
  catches: number;
  runOuts: number;
  stumpings: number;
}

export class StatsCalculator {
  static calculateBattingStats(
    scores: { runs: number; balls: number; fours: number; sixes: number; isOut: boolean }[]
  ): BattingStats {
    const matches = scores.length;
    const innings = scores.length;
    let totalRuns = 0;
    let totalBalls = 0;
    let fours = 0;
    let sixes = 0;
    let highestScore = 0;
    let notOuts = 0;
    let fifties = 0;
    let hundreds = 0;

    scores.forEach((s) => {
      totalRuns += s.runs;
      totalBalls += s.balls;
      fours += s.fours;
      sixes += s.sixes;
      if (s.runs > highestScore) highestScore = s.runs;
      if (!s.isOut) notOuts++;
      if (s.runs >= 100) hundreds++;
      else if (s.runs >= 50) fifties++;
    });

    const outs = innings - notOuts;
    const average = outs > 0 ? Math.round((totalRuns / outs) * 100) / 100 : totalRuns;
    const strikeRate = totalBalls > 0 ? Math.round((totalRuns / totalBalls) * 100 * 100) / 100 : 0;

    return {
      matches,
      innings,
      runs: totalRuns,
      balls: totalBalls,
      fours,
      sixes,
      highestScore,
      notOuts,
      average,
      strikeRate,
      fifties,
      hundreds,
    };
  }

  static calculateBowlingStats(
    figures: { overs: number; legalBalls: number; runs: number; wickets: number; wides: number; noBalls: number }[]
  ): BowlingStats {
    const matches = figures.length;
    let totalLegalBalls = 0;
    let totalRuns = 0;
    let totalWickets = 0;
    let totalWides = 0;
    let totalNoBalls = 0;
    let bestWickets = -1;
    let bestRuns = 999;

    figures.forEach((f) => {
      totalLegalBalls += f.legalBalls;
      totalRuns += f.runs;
      totalWickets += f.wickets;
      totalWides += f.wides;
      totalNoBalls += f.noBalls;

      if (
        f.wickets > bestWickets ||
        (f.wickets === bestWickets && f.runs < bestRuns)
      ) {
        bestWickets = f.wickets;
        bestRuns = f.runs;
      }
    });

    const completedOvers = Math.floor(totalLegalBalls / 6);
    const remBalls = totalLegalBalls % 6;
    const totalOversDec = completedOvers + remBalls / 6;

    const economy = totalOversDec > 0 ? Math.round((totalRuns / totalOversDec) * 100) / 100 : 0;
    const average = totalWickets > 0 ? Math.round((totalRuns / totalWickets) * 100) / 100 : 0;
    const strikeRate = totalWickets > 0 ? Math.round((totalLegalBalls / totalWickets) * 100) / 100 : 0;
    const bestBowling = bestWickets >= 0 ? `${bestWickets}/${bestRuns}` : 'N/A';

    const oversCricketFormat = parseFloat(`${completedOvers}.${remBalls}`);

    return {
      matches,
      overs: oversCricketFormat,
      runs: totalRuns,
      wickets: totalWickets,
      wides: totalWides,
      noBalls: totalNoBalls,
      bestBowling,
      economy,
      average,
      strikeRate,
    };
  }
}
