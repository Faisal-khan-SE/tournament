export interface SingleMatchNRR {
  runsScored: number;
  legalBallsFaced: number;
  allOut: boolean;
  allocatedOvers: number;

  runsConceded: number;
  legalBallsBowled: number;
  opponentAllOut: boolean;
}

export interface TeamInningsStats extends SingleMatchNRR {}

export class NRRCalculator {
  /**
   * Converts overs & balls count to total effective decimal overs for a single match.
   * If `isAllOut` is true, the team is considered to have used ALL allocated overs!
   */
  static calculateEffectiveOvers(
    legalBalls: number,
    allocatedOvers: number,
    isAllOut: boolean
  ): number {
    if (isAllOut) {
      return allocatedOvers;
    }
    const completedOvers = Math.floor(legalBalls / 6);
    const remainingBalls = legalBalls % 6;
    return completedOvers + remainingBalls / 6;
  }

  /**
   * Calculates Net Run Rate (NRR) formatted to 3 decimal places across multiple matches.
   * NRR = (Total Runs Scored / Total Effective Overs Faced) - (Total Runs Conceded / Total Effective Overs Bowled)
   */
  static calculateNRRFromMatches(matches: SingleMatchNRR[]): number {
    if (matches.length === 0) return 0.0;

    let totalRunsScored = 0;
    let totalEffectiveOversFaced = 0;
    let totalRunsConceded = 0;
    let totalEffectiveOversBowled = 0;

    for (const m of matches) {
      totalRunsScored += m.runsScored;
      totalEffectiveOversFaced += this.calculateEffectiveOvers(
        m.legalBallsFaced,
        m.allocatedOvers,
        m.allOut
      );

      totalRunsConceded += m.runsConceded;
      totalEffectiveOversBowled += this.calculateEffectiveOvers(
        m.legalBallsBowled,
        m.allocatedOvers,
        m.opponentAllOut
      );
    }

    const runRateFor = totalEffectiveOversFaced > 0 ? totalRunsScored / totalEffectiveOversFaced : 0;
    const runRateAgainst = totalEffectiveOversBowled > 0 ? totalRunsConceded / totalEffectiveOversBowled : 0;

    const nrr = runRateFor - runRateAgainst;
    return Math.round(nrr * 1000) / 1000;
  }

  /**
   * Legacy wrapper for a single match stats calculation.
   */
  static calculateNRR(stats: TeamInningsStats): number {
    return this.calculateNRRFromMatches([stats]);
  }

  /**
   * Formats NRR value with leading sign e.g. "+2.345" or "-0.875"
   */
  static formatNRR(nrr: number): string {
    const formatted = nrr.toFixed(3);
    return nrr > 0 ? `+${formatted}` : formatted;
  }
}

