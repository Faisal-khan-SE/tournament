/**
 * Central tape-ball rule helpers.
 *
 * These were previously duplicated (and drifting) between the delivery handler,
 * the match-completion handler and the points-table builder. Every caller now
 * shares one definition so a squad-size rule change lands everywhere at once.
 */

export const NON_BOWLER_DISMISSALS = ['RUN_OUT', 'RETIRED_HURT', 'RETIRED_OUT', 'OBSTRUCTING'];

/** Dismissals that do NOT consume a team wicket (batter can return). */
export const NON_WICKET_DISMISSALS = ['RETIRED_HURT'];

/**
 * The only ways out on a free hit.
 *
 * A free hit carries the same dismissal restrictions as the no-ball that caused
 * it: the striker cannot be bowled, caught, stumped, lbw or hit wicket. Running
 * yourself out still counts, as does obstructing the field. Retirements are the
 * batter's own choice rather than a dismissal by the fielding side, so they stay
 * available too.
 */
export const FREE_HIT_ALLOWED_DISMISSALS = [
  'RUN_OUT',
  'OBSTRUCTING',
  'RETIRED_HURT',
  'RETIRED_OUT',
];

export function isDismissalAllowedOnFreeHit(wicketType?: string | null): boolean {
  if (!wicketType) return false;
  return FREE_HIT_ALLOWED_DISMISSALS.includes(wicketType);
}

/**
 * Whether the delivery after `previous` is bowled as a free hit.
 *
 * A no-ball always sets one up. If that free hit is then wasted on another
 * illegal delivery (a wide or a second no-ball) the free hit carries over to the
 * following ball, so it is only used up by a legal delivery.
 */
export function nextBallIsFreeHit(
  previous: { extraType: string; isLegal: boolean; isFreeHit?: boolean } | null | undefined
): boolean {
  if (!previous) return false;
  if (previous.extraType === 'NO_BALL') return true;
  return Boolean(previous.isFreeHit) && !previous.isLegal;
}

export type EndReason = 'OVERS' | 'ALL_OUT' | 'TARGET' | 'MANUAL' | 'ABANDONED';

/**
 * Tape-ball all-out threshold.
 *
 * Small-sided tape-ball games allow "last man standing" — with a squad of 5 or
 * fewer, every batter must be dismissed. With a bigger squad the innings ends
 * one short, as in the full game (no partner left to bat with).
 */
export function maxWicketsForSquad(squadSize: number): number {
  const size = squadSize > 0 ? squadSize : 10;
  if (size <= 5) return size;
  return Math.max(1, size - 1);
}

/** Squad size registered for a team in a match, falling back to a full XI. */
export function squadSizeFor(squadPlayers: { teamId: string }[], teamId: string): number {
  const count = squadPlayers.filter((p) => p.teamId === teamId).length;
  return count > 0 ? count : 10;
}

export function isAllOut(wickets: number, squadSize: number): boolean {
  return wickets >= maxWicketsForSquad(squadSize);
}

/** A wicket that goes to the bowler's column. */
export function creditsBowler(wicketType?: string | null): boolean {
  if (!wicketType) return false;
  return !NON_BOWLER_DISMISSALS.includes(wicketType);
}

/** A dismissal that counts against the team total. Retired hurt does not. */
export function countsAsTeamWicket(wicketType?: string | null): boolean {
  if (!wicketType) return true;
  return !NON_WICKET_DISMISSALS.includes(wicketType);
}

/** Points awarded per result. Standard 2 for a win, 1 shared for tie/no-result. */
export const POINTS_WIN = 2;
export const POINTS_TIE = 1;
export const POINTS_NO_RESULT = 1;

/** Human-readable dismissal line, e.g. "c Zain b Faraz" / "b Faraz" / "run out (Zain)". */
export function dismissalText(
  wicketType: string | null | undefined,
  bowlerName?: string | null,
  fielderName?: string | null
): string {
  switch (wicketType) {
    case 'BOWLED':
      return `b ${bowlerName || 'bowler'}`;
    case 'CAUGHT':
      return fielderName ? `c ${fielderName} b ${bowlerName || 'bowler'}` : `c & b ${bowlerName || 'bowler'}`;
    case 'LBW':
      return `lbw b ${bowlerName || 'bowler'}`;
    case 'STUMPED':
      return `st ${fielderName || 'keeper'} b ${bowlerName || 'bowler'}`;
    case 'HIT_WICKET':
      return `hit wicket b ${bowlerName || 'bowler'}`;
    case 'RUN_OUT':
      return fielderName ? `run out (${fielderName})` : 'run out';
    case 'RETIRED_HURT':
      return 'retired hurt';
    case 'RETIRED_OUT':
      return 'retired out';
    case 'OBSTRUCTING':
      return 'obstructing the field';
    default:
      return wicketType ? wicketType.toLowerCase().replace(/_/g, ' ') : 'out';
  }
}

/** Overs display for a legal-ball count: 7 balls -> "1.1". */
export function oversDisplay(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  return `${overs}.${legalBalls % 6}`;
}

/** Decimal overs used by economy/NRR maths: 7 balls -> 1.1666… */
export function oversDecimal(legalBalls: number): number {
  return legalBalls / 6;
}

/** Which earlier knockout stages decide the two sides of a later one. */
export const KNOCKOUT_FEEDS: Record<string, [string, string]> = {
  SF1: ['QF1', 'QF2'],
  SF2: ['QF3', 'QF4'],
  FINAL: ['SF1', 'SF2'],
};
