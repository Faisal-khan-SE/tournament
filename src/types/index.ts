export type BallType = 'TAPE_BALL' | 'LEATHER_BALL' | 'TENNIS_BALL';
export type MatchType = 'TOURNAMENT' | 'SINGLE';
export type MatchStatus = 'SCHEDULED' | 'TOSS' | 'LIVE' | 'INNINGS_BREAK' | 'COMPLETED' | 'ABANDONED';
export type PlayerRole = 'BATSMAN' | 'BOWLER' | 'ALL_ROUNDER' | 'WICKETKEEPER';
export type ExtraType = 'NONE' | 'WIDE' | 'NO_BALL' | 'BYE' | 'LEG_BYE';
export type WicketType = 'BOWLED' | 'CAUGHT' | 'RUN_OUT' | 'LBW' | 'STUMPED' | 'HIT_WICKET' | 'RETIRED_HURT' | 'RETIRED_OUT' | 'OTHER';

export interface DeliveryPayload {
  strikerId: string;
  nonStrikerId: string;
  bowlerId: string;
  runsBat: number;
  extraType: ExtraType;
  runsExtra?: number;
  isWicket?: boolean;
  wicketType?: WicketType | string;
  dismissedId?: string;
  fielderId?: string;
}

export interface InningsState {
  totalRuns: number;
  totalWickets: number;
  overs: string;
  legalBalls: number;
  target?: number;
  requiredRunRate?: number;
  currentRunRate: number;
}
