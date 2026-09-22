export interface FixturePair {
  homeTeamId: string;
  awayTeamId: string;
  matchIndex: number;
}

export class FixtureGenerator {
  /**
   * Whether a balanced schedule exists for this team count and games-per-team.
   *
   * Every team playing `matchesPerTeam` games needs `teams * matchesPerTeam / 2`
   * fixtures, so with an odd number of teams the per-team count must be even.
   * The caller should surface `reason` instead of generating a lopsided list.
   */
  static validate(numTeams: number, matchesPerTeam: number): { ok: boolean; reason?: string } {
    if (numTeams < 2) return { ok: false, reason: 'At least 2 teams are needed to generate fixtures' };
    if (!Number.isInteger(matchesPerTeam) || matchesPerTeam < 1) {
      return { ok: false, reason: 'Matches per team must be at least 1' };
    }
    if (matchesPerTeam > numTeams - 1) {
      return {
        ok: false,
        reason: `With ${numTeams} teams, each team can play at most ${numTeams - 1} matches`,
      };
    }
    if (numTeams % 2 === 1 && matchesPerTeam % 2 === 1) {
      return {
        ok: false,
        reason: `With an odd number of teams (${numTeams}) every team must play an even number of matches — choose ${matchesPerTeam - 1 || 2} or ${matchesPerTeam + 1}`,
      };
    }
    return { ok: true };
  }

  /**
   * Generates fixtures where every team plays exactly `matchesPerTeam` matches.
   *
   * Even team counts use the circle method: each "round" pairs every team once,
   * and taking the first `matchesPerTeam` rounds gives every team that many
   * games. Odd team counts pair team i with team i+step for step = 1, 2, …;
   * each step is a cycle through all the teams, so it adds exactly two games
   * per team, which is why the per-team count must be even there.
   *
   * Throws when the combination cannot be balanced — see `validate`.
   */
  static generateLeagueFixtures(teamIds: string[], matchesPerTeam: number = 2): FixturePair[] {
    const numTeams = teamIds.length;
    const check = this.validate(numTeams, matchesPerTeam);
    if (!check.ok) throw new Error(check.reason);

    const fixtures: FixturePair[] = [];
    const push = (homeTeamId: string, awayTeamId: string) =>
      fixtures.push({ homeTeamId, awayTeamId, matchIndex: fixtures.length + 1 });

    if (numTeams % 2 === 1) {
      for (let step = 1; step <= matchesPerTeam / 2; step++) {
        for (let i = 0; i < numTeams; i++) {
          push(teamIds[i], teamIds[(i + step) % numTeams]);
        }
      }
    } else {
      // Circle method: fix the first team, rotate the rest one place per round.
      const rotating = teamIds.slice(1);
      for (let round = 0; round < matchesPerTeam; round++) {
        const order = [teamIds[0], ...rotating];
        for (let i = 0; i < numTeams / 2; i++) {
          const a = order[i];
          const b = order[numTeams - 1 - i];
          // Alternate home/away so the fixed team is not always at home.
          if (round % 2 === 0) push(a, b);
          else push(b, a);
        }
        rotating.unshift(rotating.pop()!);
      }
    }

    const verification = this.verifyFixtures(teamIds, fixtures, matchesPerTeam);
    if (!verification.isValid) {
      // Should be unreachable given `validate`; fail loudly rather than save a bad list.
      throw new Error(`Fixture generation produced an unbalanced schedule: ${verification.errors.join('; ')}`);
    }

    return fixtures;
  }

  /** Every team plays every other team once. Two teams give a single match. */
  static generateRoundRobin(teamIds: string[]): FixturePair[] {
    if (teamIds.length < 2) return [];
    return this.generateLeagueFixtures(teamIds, teamIds.length - 1);
  }

  /**
   * Verifies that:
   * 1. Every team appears exactly `expectedMatchesPerTeam` times.
   * 2. No team plays against itself.
   * 3. No pairing is repeated.
   */
  static verifyFixtures(
    teamIds: string[],
    fixtures: FixturePair[],
    expectedMatchesPerTeam: number = 2
  ): { isValid: boolean; errors: string[]; appearances: Record<string, number> } {
    const appearances: Record<string, number> = {};
    teamIds.forEach((id) => (appearances[id] = 0));
    const errors: string[] = [];
    const seenPairs = new Set<string>();

    fixtures.forEach((f, idx) => {
      if (f.homeTeamId === f.awayTeamId) {
        errors.push(`Match ${idx + 1}: Team ${f.homeTeamId} cannot play against itself.`);
      }
      const key = [f.homeTeamId, f.awayTeamId].sort().join('|');
      if (seenPairs.has(key)) errors.push(`Match ${idx + 1}: pairing is repeated.`);
      seenPairs.add(key);
      appearances[f.homeTeamId] = (appearances[f.homeTeamId] || 0) + 1;
      appearances[f.awayTeamId] = (appearances[f.awayTeamId] || 0) + 1;
    });

    teamIds.forEach((id) => {
      const count = appearances[id] || 0;
      if (count !== expectedMatchesPerTeam) {
        errors.push(`Team ${id} appears ${count} times (expected ${expectedMatchesPerTeam}).`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      appearances,
    };
  }
}
