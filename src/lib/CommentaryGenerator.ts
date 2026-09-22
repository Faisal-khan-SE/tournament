import { DeliveryPayload } from '../types';

export class CommentaryGenerator {
  static generateCommentary(
    payload: DeliveryPayload,
    strikerName: string,
    bowlerName: string,
    fielderName?: string,
    isFreeHit = false
  ): string {
    const { runsBat, extraType, runsExtra = 0, isWicket, wicketType } = payload;
    // Marks the ball in the feed so the free hit is visible when reading back.
    const prefix = isFreeHit ? 'FREE HIT — ' : '';

    if (isWicket) {
      const typeStr = wicketType ? wicketType.toLowerCase().replace('_', ' ') : 'out';
      if (wicketType === 'CAUGHT' && fielderName) {
        return `${prefix}OUT! ${strikerName} is caught by ${fielderName} off ${bowlerName}!`;
      } else if (wicketType === 'BOWLED') {
        return `${prefix}OUT! ${strikerName} is clean bowled by ${bowlerName}!`;
      } else if (wicketType === 'RUN_OUT') {
        return `${prefix}OUT! ${strikerName} is run out!`;
      } else if (wicketType === 'LBW') {
        return `${prefix}OUT! ${strikerName} is trapped LBW by ${bowlerName}!`;
      } else if (wicketType === 'STUMPED' && fielderName) {
        return `${prefix}OUT! ${strikerName} is stumped by ${fielderName} off ${bowlerName}!`;
      }
      return `${prefix}OUT! ${strikerName} is ${typeStr} by ${bowlerName}.`;
    }

    if (extraType === 'WIDE') {
      const totalWide = 1 + (runsExtra || 0);
      return `${prefix}${bowlerName} bowls a WIDE! (${totalWide} extra runs).`;
    }

    if (extraType === 'NO_BALL') {
      if (runsBat === 4) return `${prefix}NO BALL! ${strikerName} smashes it for FOUR!`;
      if (runsBat === 6) return `${prefix}NO BALL! ${strikerName} launches it for SIX!`;
      return `${prefix}${bowlerName} bowls a NO BALL! (${1 + runsBat} runs total).`;
    }

    if (extraType === 'BYE') {
      return `${prefix}${runsExtra || 1} BYE run(s) taken by ${strikerName}.`;
    }

    if (extraType === 'LEG_BYE') {
      return `${prefix}${runsExtra || 1} LEG BYE run(s) off the pad.`;
    }

    // Normal legal runs off bat
    if (runsBat === 6) return `${prefix}BOOM! ${strikerName} hits a massive SIX off ${bowlerName}!`;
    if (runsBat === 4) return `${prefix}FOUR! Beautiful shot by ${strikerName} off ${bowlerName}!`;
    if (runsBat === 0) return `${prefix}No run. Dot ball bowled by ${bowlerName} to ${strikerName}.`;
    if (runsBat === 1) return `${prefix}${strikerName} takes a single off ${bowlerName}.`;
    if (runsBat === 2) return `${prefix}${strikerName} pushes for two runs off ${bowlerName}.`;
    if (runsBat === 3) return `${prefix}Great running! ${strikerName} collects 3 runs off ${bowlerName}.`;

    return `${prefix}${strikerName} scores ${runsBat} runs off ${bowlerName}.`;
  }
}
