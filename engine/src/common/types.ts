/**
 * Normalized domain model. Every bookmaker adapter maps its proprietary
 * feed into these shapes; everything downstream (matching, arb detection,
 * alerting) only ever sees these.
 */

export type OutcomeCode =
  | 'HOME'
  | 'DRAW'
  | 'AWAY'
  | 'OVER'
  | 'UNDER'
  | 'YES'
  | 'NO';

/**
 * Canonical market keys. Lines are carried in the key so only identical
 * lines are ever compared across books:
 *   "1X2"            home/draw/away
 *   "OU@2.5"         total over/under at 2.5
 *   "BTTS"           both teams to score yes/no
 *   "DNB"            draw no bet (home/away; draw refunds stakes)
 *   "AH@-0.5"        Asian handicap, home line -0.5 (home/away)
 * AH lines are always the HOME team's handicap and restricted to half
 * lines (…-1.5, -0.5, 0.5, 1.5…) so there is never a push/void.
 */
export type MarketKey = '1X2' | `OU@${string}` | 'BTTS' | 'DNB' | `AH@${string}`;

export interface NormalizedOutcome {
  code: OutcomeCode;
  odds: number;
}

export interface NormalizedMarket {
  key: MarketKey;
  outcomes: NormalizedOutcome[];
}

export interface NormalizedEvent {
  bookmaker: string;
  bookmakerEventId: string;
  /** Betradar id (e.g. "sr:match:123") when the book exposes it. */
  betradarId?: string;
  home: string;
  away: string;
  league: string;
  startTime: number; // epoch ms
  markets: NormalizedMarket[];
}

/** The same real-world fixture as seen by 2+ bookmakers. */
export interface MatchedEvent {
  home: string;
  away: string;
  league: string;
  startTime: number;
  sources: NormalizedEvent[];
}

export interface ArbLeg {
  bookmaker: string;
  outcome: OutcomeCode;
  odds: number;
  /** Fraction of total stake on this leg (0..1), before rounding. */
  stakeFraction: number;
  /** Rounded stake in bankroll currency. */
  stake: number;
}

export interface ArbOpportunity {
  id: string; // stable dedupe key
  event: MatchedEvent;
  market: MarketKey;
  legs: ArbLeg[];
  /** Sum of inverse odds; < 1 means arbitrage. */
  impliedSum: number;
  /** Guaranteed return as % of total stake, before rounding. */
  profitPct: number;
  totalStake: number;
  /** Worst-case profit after stake rounding, in bankroll currency (pre-tax). */
  guaranteedProfit: number;
  /** Withholding tax rate applied (e.g. 0.15 = 15%). 0 when not configured. */
  taxRate: number;
  /** Guaranteed profit % after withholding tax on winnings. Negative = loss. */
  afterTaxProfitPct: number;
  /** Worst-case guaranteed profit after tax and stake rounding, in bankroll currency. */
  afterTaxGuaranteedProfit: number;
  /** True when profit is implausibly high — likely a mismatched event or stale odds. */
  suspicious: boolean;
  /**
   * Optional risk caveat shown alongside the arb. Used for markets that can
   * void rather than lose — e.g. Draw No Bet, where a draw refunds both
   * stakes (break-even, never a loss) instead of paying the computed profit.
   */
  note?: string;
  detectedAt: number;
}
