import { DeliveryPayload, ExtraType } from '../types';
import { NRRCalculator } from './NRRCalculator';

export class CentralMatchEngine {
  /**
   * Evaluates a delivery's effect on runs, extra runs, legal ball status, and strike rotation.
   */
  static evaluateDelivery(payload: DeliveryPayload) {
    const { runsBat, extraType, runsExtra = 0, isWicket } = payload;

    let runsForTeam = runsBat;
    let runsForBatsman = runsBat;
    let extraRunsForTeam = 0;
    let isLegal = true;

    if (extraType === 'WIDE') {
      isLegal = false;
      extraRunsForTeam = 1 + (runsExtra || 0);
      runsForTeam = extraRunsForTeam;
      runsForBatsman = 0;
    } else if (extraType === 'NO_BALL') {
      isLegal = false;
      extraRunsForTeam = 1 + (runsExtra || 0);
      runsForTeam = extraRunsForTeam + runsBat;
      runsForBatsman = runsBat;
    } else if (extraType === 'BYE' || extraType === 'LEG_BYE') {
      isLegal = true;
      extraRunsForTeam = runsExtra ?? 0;
      runsForTeam = extraRunsForTeam;
      runsForBatsman = 0; // Byes/legbyes do NOT count as batsman runs
    } else {
      // Normal legal delivery
      isLegal = true;
      runsForTeam = runsBat;
      runsForBatsman = runsBat;
    }

    // Strike Rotation calculation:
    // Odd completed runs run by batsmen (1, 3) swap strike during play.
    let ballRunRotation = false;
    if (extraType === 'WIDE') {
      if ((runsExtra || 0) % 2 === 1) ballRunRotation = true;
    } else if (extraType === 'BYE' || extraType === 'LEG_BYE') {
      if ((runsExtra ?? 0) % 2 === 1) ballRunRotation = true;
    } else if (extraType === 'NO_BALL') {
      const physicalRuns = runsBat + (runsExtra || 0);
      if (physicalRuns % 2 === 1) ballRunRotation = true;
    } else {
      if (runsBat % 2 === 1) ballRunRotation = true;
    }

    return {
      runsForTeam,
      runsForBatsman,
      extraRunsForTeam,
      isLegal,
      ballRunRotation,
    };
  }

  /**
   * Calculates formatted overs display string (e.g. 5 legal balls = "0.5", 6 legal balls = "1.0").
   */
  static formatOvers(legalBalls: number): string {
    const overs = Math.floor(legalBalls / 6);
    const balls = legalBalls % 6;
    return `${overs}.${balls}`;
  }

  /**
   * Calculates Bowler Economy rate using legal ball fraction.
   * Economy = Runs Conceded / (Legal Balls / 6)
   */
  static calculateEconomy(runsConceded: number, legalBalls: number): number {
    if (legalBalls <= 0) return 0.0;
    const oversDec = legalBalls / 6;
    return Math.round((runsConceded / oversDec) * 100) / 100;
  }

  /**
   * Calculates Batsman Strike Rate.
   * Strike Rate = (Runs Scored / Balls Faced) * 100
   */
  static calculateStrikeRate(runs: number, ballsFaced: number): number {
    if (ballsFaced <= 0) return 0.0;
    return Math.round((runs / ballsFaced) * 100 * 100) / 100;
  }

  /**
   * Calculates Current Run Rate (CRR).
   * CRR = Total Runs / (Legal Balls / 6)
   */
  static calculateCurrentRunRate(totalRuns: number, legalBalls: number): number {
    if (legalBalls <= 0) return 0.0;
    const oversDec = legalBalls / 6;
    return Math.round((totalRuns / oversDec) * 100) / 100;
  }

  /**
   * Calculates Target & Required Run Rate (RRR) for chasing team.
   */
  static calculateTargetInfo(
    target: number,
    currentRuns: number,
    allocatedOvers: number,
    currentLegalBalls: number
  ) {
    const runsNeeded = target - currentRuns;
    const totalBallsAllocated = allocatedOvers * 6;
    const ballsRemaining = Math.max(0, totalBallsAllocated - currentLegalBalls);

    const requiredRunRate =
      runsNeeded <= 0
        ? 0.0
        : ballsRemaining > 0
        ? Math.round((runsNeeded / (ballsRemaining / 6)) * 100) / 100
        : 99.99;

    return {
      runsNeeded: Math.max(0, runsNeeded),
      ballsRemaining,
      requiredRunRate,
      targetReached: currentRuns >= target,
    };
  }

  /**
   * Checks if a bowler is eligible to bowl the next over (consecutive over restriction).
   */
  static isBowlerEligible(bowlerId: string, lastBowlerId?: string | null): boolean {
    if (!lastBowlerId) return true;
    return bowlerId !== lastBowlerId;
  }
}
