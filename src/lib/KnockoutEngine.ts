export interface KnockoutMatchPairing {
  stage: 'QF1' | 'QF2' | 'QF3' | 'QF4' | 'SF1' | 'SF2' | 'FINAL';
  homeTeamId?: string;
  awayTeamId?: string;
  nextStage?: string;
}

export class KnockoutEngine {
  /**
   * Generates initial Semi Final pairings when 4 to 7 teams are qualified.
   * Rank 1 vs Rank 4, Rank 2 vs Rank 3.
   */
  static generateSemiFinalsFrom4Teams(rankedTeamIds: string[]): KnockoutMatchPairing[] {
    if (rankedTeamIds.length < 4) {
      throw new Error('At least 4 qualified teams are required for Semi Finals.');
    }

    const t1 = rankedTeamIds[0]; // Rank 1
    const t2 = rankedTeamIds[1]; // Rank 2
    const t3 = rankedTeamIds[2]; // Rank 3
    const t4 = rankedTeamIds[3]; // Rank 4

    return [
      { stage: 'SF1', homeTeamId: t1, awayTeamId: t4, nextStage: 'FINAL' }, // 1 vs 4
      { stage: 'SF2', homeTeamId: t2, awayTeamId: t3, nextStage: 'FINAL' }, // 2 vs 3
    ];
  }

  /**
   * Generates initial Quarter Final pairings based on sorted league rankings (1..8).
   */
  static generateQuarterFinals(rankedTeamIds: string[]): KnockoutMatchPairing[] {
    if (rankedTeamIds.length < 8) {
      return this.generateSemiFinalsFrom4Teams(rankedTeamIds);
    }

    const t1 = rankedTeamIds[0]; // Rank 1
    const t2 = rankedTeamIds[1]; // Rank 2
    const t3 = rankedTeamIds[2]; // Rank 3
    const t4 = rankedTeamIds[3]; // Rank 4
    const t5 = rankedTeamIds[4]; // Rank 5
    const t6 = rankedTeamIds[5]; // Rank 6
    const t7 = rankedTeamIds[6]; // Rank 7
    const t8 = rankedTeamIds[7]; // Rank 8

    return [
      { stage: 'QF1', homeTeamId: t1, awayTeamId: t8, nextStage: 'SF1' }, // 1 vs 8
      { stage: 'QF2', homeTeamId: t4, awayTeamId: t5, nextStage: 'SF1' }, // 4 vs 5
      { stage: 'QF3', homeTeamId: t2, awayTeamId: t7, nextStage: 'SF2' }, // 2 vs 7
      { stage: 'QF4', homeTeamId: t3, awayTeamId: t6, nextStage: 'SF2' }, // 3 vs 6
    ];
  }

  /**
   * Evaluates semi final pairings given QF winners.
   */
  static generateSemiFinals(
    qf1WinnerId?: string,
    qf2WinnerId?: string,
    qf3WinnerId?: string,
    qf4WinnerId?: string
  ): KnockoutMatchPairing[] {
    return [
      { stage: 'SF1', homeTeamId: qf1WinnerId, awayTeamId: qf2WinnerId, nextStage: 'FINAL' },
      { stage: 'SF2', homeTeamId: qf3WinnerId, awayTeamId: qf4WinnerId, nextStage: 'FINAL' },
    ];
  }

  /**
   * Evaluates final pairing given SF winners.
   */
  static generateFinal(sf1WinnerId?: string, sf2WinnerId?: string): KnockoutMatchPairing {
    return {
      stage: 'FINAL',
      homeTeamId: sf1WinnerId,
      awayTeamId: sf2WinnerId,
    };
  }
}

