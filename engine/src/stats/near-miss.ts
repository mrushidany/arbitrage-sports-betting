import { MatchedEvent, OutcomeCode } from '../common/types';

/**
 * "Near-miss" analytics — shared by the scanner (which persists a summary
 * each cycle) and the `stats` CLI. For every market where ≥2 books cover all
 * outcomes, we take the best price per outcome across books and sum the
 * implied probabilities. < 100% is an arb; just above 100% is a near-miss
 * that becomes an arb with a small price move.
 */

const REQUIRED: Record<string, OutcomeCode[]> = {
  '1X2': ['HOME', 'DRAW', 'AWAY'],
  OU: ['OVER', 'UNDER'],
  BTTS: ['YES', 'NO'],
  DNB: ['HOME', 'AWAY'],
  AH: ['HOME', 'AWAY'],
};

export function marketType(key: string): string {
  return key.startsWith('OU@') ? 'OU' : key.startsWith('AH@') ? 'AH' : key;
}

export interface NearMissMarket {
  impliedPct: number;
  type: string;
  label: string;
}

export interface NearMissSummary {
  matchedFixtures: number;
  tradableMarkets: number;
  /** Lowest implied % seen this scan (closest to an arb); null if none. */
  tightestImplied: number | null;
  under101: number;
  under102: number;
  under103: number;
  /** All tradable markets, ascending by implied % (tightest first). */
  markets: NearMissMarket[];
}

/** Best-of implied sum for one market, only when ≥2 books cover every outcome. */
function tradableMarkets(event: MatchedEvent): NearMissMarket[] {
  const keys = new Set<string>();
  for (const s of event.sources) for (const m of s.markets) keys.add(m.key);

  const out: NearMissMarket[] = [];
  for (const key of keys) {
    const required = REQUIRED[marketType(key)];
    if (!required) continue;

    const bestOdds = new Map<OutcomeCode, number>();
    const books = new Set<string>();
    for (const s of event.sources) {
      const m = s.markets.find((x) => x.key === key);
      if (!m) continue;
      for (const o of m.outcomes) {
        if (!bestOdds.has(o.code) || o.odds > bestOdds.get(o.code)!) bestOdds.set(o.code, o.odds);
        books.add(s.bookmaker);
      }
    }
    if (books.size < 2 || !required.every((c) => bestOdds.has(c))) continue;

    const implied = required.reduce((sum, c) => sum + 1 / bestOdds.get(c)!, 0) * 100;
    out.push({ impliedPct: implied, type: marketType(key), label: `${event.home} v ${event.away} ${key}` });
  }
  return out;
}

export function computeNearMiss(matched: MatchedEvent[]): NearMissSummary {
  const markets: NearMissMarket[] = [];
  for (const ev of matched) markets.push(...tradableMarkets(ev));
  markets.sort((a, b) => a.impliedPct - b.impliedPct);

  return {
    matchedFixtures: matched.length,
    tradableMarkets: markets.length,
    tightestImplied: markets.length ? markets[0].impliedPct : null,
    under101: markets.filter((m) => m.impliedPct < 101).length,
    under102: markets.filter((m) => m.impliedPct < 102).length,
    under103: markets.filter((m) => m.impliedPct < 103).length,
    markets,
  };
}
