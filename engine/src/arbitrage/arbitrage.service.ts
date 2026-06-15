import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArbOpportunity,
  MarketKey,
  MatchedEvent,
  OutcomeCode,
} from '../common/types';
import { calculateStakes } from './stake-calculator';

/** Outcome sets that must be fully covered for each market type. */
const REQUIRED_OUTCOMES: Record<string, OutcomeCode[]> = {
  '1X2': ['HOME', 'DRAW', 'AWAY'],
  BTTS: ['YES', 'NO'],
  OU: ['OVER', 'UNDER'],
  DNB: ['HOME', 'AWAY'],
  AH: ['HOME', 'AWAY'],
};

/** Collapse a market key to its outcome-set type (strips the line). */
function marketType(key: string): string {
  if (key.startsWith('OU@')) return 'OU';
  if (key.startsWith('AH@')) return 'AH';
  return key;
}

interface BestPrice {
  bookmaker: string;
  odds: number;
}

@Injectable()
export class ArbitrageService {
  private readonly minProfitPct: number;
  private readonly totalStake: number;
  /** Above this the "arb" is almost certainly a mismatch or stale price. */
  private readonly suspiciousProfitPct = 12;

  constructor(config: ConfigService) {
    this.minProfitPct = parseFloat(config.get('MIN_PROFIT_PCT') ?? '0.5');
    this.totalStake = parseFloat(config.get('TOTAL_STAKE') ?? '100000');
  }

  findArbs(events: MatchedEvent[]): ArbOpportunity[] {
    const arbs: ArbOpportunity[] = [];
    for (const event of events) {
      for (const marketKey of this.marketKeysOf(event)) {
        const arb = this.checkMarket(event, marketKey);
        if (arb) arbs.push(arb);
      }
    }
    return arbs.sort((a, b) => b.profitPct - a.profitPct);
  }

  private marketKeysOf(event: MatchedEvent): Set<MarketKey> {
    const keys = new Set<MarketKey>();
    for (const source of event.sources) {
      for (const market of source.markets) keys.add(market.key);
    }
    return keys;
  }

  private checkMarket(event: MatchedEvent, marketKey: MarketKey): ArbOpportunity | null {
    const type = marketType(marketKey);
    const required = REQUIRED_OUTCOMES[type];
    if (!required) return null;

    // Best price per outcome across all books offering this market.
    const best = new Map<OutcomeCode, BestPrice>();
    for (const source of event.sources) {
      const market = source.markets.find((m) => m.key === marketKey);
      if (!market) continue;
      for (const outcome of market.outcomes) {
        const current = best.get(outcome.code);
        if (!current || outcome.odds > current.odds) {
          best.set(outcome.code, { bookmaker: source.bookmaker, odds: outcome.odds });
        }
      }
    }

    if (!required.every((code) => best.has(code))) return null;

    // A genuine arb needs at least two distinct books; a single book
    // pricing itself below 100% is a palpable error you can't bet both
    // sides of safely.
    const books = new Set(required.map((code) => best.get(code)!.bookmaker));
    if (books.size < 2) return null;

    const impliedSum = required.reduce((sum, code) => sum + 1 / best.get(code)!.odds, 0);
    if (impliedSum >= 1) return null;

    const profitPct = (1 / impliedSum - 1) * 100;
    if (profitPct < this.minProfitPct) return null;

    const plan = calculateStakes(
      required.map((code) => ({
        bookmaker: best.get(code)!.bookmaker,
        outcome: code,
        odds: best.get(code)!.odds,
      })),
      this.totalStake,
    );

    return {
      id: `${event.home}|${event.away}|${event.startTime}|${marketKey}`,
      event,
      market: marketKey,
      legs: plan.legs,
      impliedSum,
      profitPct,
      totalStake: this.totalStake,
      guaranteedProfit: plan.guaranteedProfit,
      suspicious: profitPct > this.suspiciousProfitPct,
      note:
        type === 'DNB'
          ? 'Draw No Bet — a draw refunds both stakes (break-even, never a loss).'
          : undefined,
      detectedAt: Date.now(),
    };
  }
}
