/** Plain request/response shapes for the bets API (no class-validator dep). */

export interface LogBetLegDto {
  bookmaker: string;
  outcome: string;
  odds: number;
  stake: number;
}

export interface LogBetDto {
  home: string;
  away: string;
  league: string;
  market: string;
  kickoff: number; // epoch ms
  profitPct: number;
  totalStake: number;
  legs: LogBetLegDto[];
  note?: string;
}

export interface SettleBetDto {
  /** Outcome code that won, e.g. "HOME" / "OVER" / "YES". Omit for VOID. */
  winningOutcome?: string;
  void?: boolean;
}

export interface BetsSummary {
  currency: string;
  openCount: number;
  settledCount: number;
  /** Capital tied up in open bets. */
  stakedOutstanding: number;
  /** Sum of realized P&L across settled bets. */
  realizedPnl: number;
  /** Total stake ever placed across settled bets (for ROI). */
  settledTurnover: number;
  roiPct: number;
}
