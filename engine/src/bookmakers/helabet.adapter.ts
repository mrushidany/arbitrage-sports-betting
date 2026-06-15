import { Injectable, Logger } from '@nestjs/common';
import { BookmakerAdapter, fetchJson, fmtLine, isHalfLine } from './bookmaker-adapter';
import {
  MarketKey,
  NormalizedEvent,
  NormalizedMarket,
  NormalizedOutcome,
  OutcomeCode,
} from '../common/types';

/**
 * Helabet TZ — runs on the 1xBet platform. Verified live via helabet.co.tz.
 *
 * Endpoint quirk that cost real debugging time: the LineFeed API rejects
 * small `count` values with HTTP 406 (a content-negotiation-looking error
 * that is actually parameter validation). `count` must be >= ~10. The
 * `partner`/`country` params turn out to be optional. The classic
 * `/LineFeed/*` path is 404 here — it lives under `/service-api/LineFeed/*`.
 *
 * Payload is the 1xBet "VZip" shape: Value[] events, each with
 *   O1/O2  = home/away names           S = kickoff (unix seconds)
 *   L      = league/tournament name    I = 1xBet event id
 *   E[]    = headline outcomes, AE[]   = the rest. Both hold {G,T,C,P}:
 *            G = market group, T = outcome type, C = coefficient (odds),
 *            P = parameter (the line, for totals/handicaps).
 *
 * Market groups we use:  G1 = 1X2 (T1/T2/T3 = home/draw/away),
 *   G17 = Total (T9/T10 = over/under, P = line), G19 = BTTS (T180/T181).
 *
 * 1xBet does not expose Betradar ids, so Helabet events are matched to
 * other books by fuzzy team name + kickoff (handled by EventMatcher).
 */

interface HelabetOutcome {
  G: number; // market group
  T: number; // outcome type
  C: number; // coefficient / odds
  P?: number; // parameter (line)
}

interface HelabetEvent {
  O1?: string;
  O2?: string;
  L?: string;
  S?: number; // kickoff, unix seconds
  I?: number; // event id
  E?: HelabetOutcome[];
  AE?: { G: number; ME?: HelabetOutcome[] }[];
}

interface HelabetResponse {
  Success?: boolean;
  Value?: HelabetEvent[];
}

interface HelabetChamp {
  L?: string; // league name
  LI?: number; // league id
  GC?: number; // game count
  SC?: HelabetChamp[]; // sub-champs
}

interface ChampsResponse {
  Value?: HelabetChamp[];
}

/** League names that aren't head-to-head fixtures (no arb value). */
const SPECIAL_LEAGUE = /winner|team vs player|player vs|duel|specials?|to win|outright|long[- ]?term/i;

@Injectable()
export class HelabetAdapter implements BookmakerAdapter {
  readonly key = 'helabet';
  readonly name = 'Helabet TZ';
  readonly enabled = true;

  private readonly logger = new Logger(HelabetAdapter.name);
  private readonly api = 'https://helabet.co.tz/service-api/LineFeed';
  private readonly common = 'lng=en&mode=4&country=181&partner=237&getEmpty=true&virtualSports=true';
  /** The unfiltered "top" feed caps near 50 regardless of count. */
  private readonly count = 100;
  /** How many extra leagues to pull odds for, on top of the top feed. */
  private readonly maxLeagues = 12;

  /**
   * The odds-bearing feed (`Get1x2_VZip`) only ever returns ~50 "top" games.
   * To see more fixtures we additionally pull the busiest real leagues by id
   * (`?champs=<id>`), then merge and de-dupe by event id. The plain champ
   * listing (`GetChampZip`) carries no odds, so it's only used to *discover*
   * which leagues to request.
   */
  async fetchEvents(): Promise<NormalizedEvent[]> {
    const leagueIds = await this.topLeagueIds();
    const urls = [
      `${this.api}/Get1x2_VZip?sports=1&count=${this.count}&${this.common}`,
      ...leagueIds.map((id) => `${this.api}/Get1x2_VZip?champs=${id}&count=${this.count}&${this.common}`),
    ];

    const results = await Promise.allSettled(urls.map((u) => fetchJson<HelabetResponse>(u)));

    // De-dupe across the top feed and per-league feeds by bookmaker event id.
    const byId = new Map<string, NormalizedEvent>();
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value.Value) continue;
      for (const ev of result.value.Value) {
        try {
          const normalized = this.normalizeEvent(ev);
          if (normalized) byId.set(normalized.bookmakerEventId, normalized);
        } catch {
          // one malformed event must never kill the scan
        }
      }
    }
    return [...byId.values()];
  }

  /** Busiest non-special football leagues, by game count. */
  private async topLeagueIds(): Promise<number[]> {
    try {
      const res = await fetchJson<ChampsResponse>(
        `${this.api}/GetChampsZip?sport=1&lng=en&country=181&partner=237&virtualSports=true&groupChamps=true`,
      );
      const flat: HelabetChamp[] = [];
      for (const champ of res.Value ?? []) {
        if (champ.SC?.length) flat.push(...champ.SC);
        else flat.push(champ);
      }
      return flat
        .filter((c) => c.LI && (c.GC ?? 0) > 0 && !SPECIAL_LEAGUE.test(c.L ?? ''))
        .sort((a, b) => (b.GC ?? 0) - (a.GC ?? 0))
        .slice(0, this.maxLeagues)
        .map((c) => c.LI!);
    } catch (err) {
      // Coverage broadening is best-effort; fall back to just the top feed.
      this.logger.warn(`League enumeration failed, using top feed only: ${(err as Error).message}`);
      return [];
    }
  }

  private normalizeEvent(ev: HelabetEvent): NormalizedEvent | null {
    if (!ev.O1 || !ev.O2 || !ev.S) return null;

    // Merge headline (E) and secondary (AE) outcomes into one flat list.
    const flat: HelabetOutcome[] = [...(ev.E ?? [])];
    for (const group of ev.AE ?? []) {
      for (const outcome of group.ME ?? []) flat.push(outcome);
    }

    const markets = this.buildMarkets(flat);
    if (markets.length === 0) return null;

    return {
      bookmaker: this.key,
      bookmakerEventId: String(ev.I ?? `${ev.O1}-${ev.O2}-${ev.S}`),
      home: ev.O1,
      away: ev.O2,
      league: ev.L ?? '',
      startTime: ev.S * 1000,
      markets,
    };
  }

  private buildMarkets(outcomes: HelabetOutcome[]): NormalizedMarket[] {
    // Collect per market key, de-duping on outcome code (E and AE can overlap).
    const byKey = new Map<MarketKey, Map<OutcomeCode, number>>();

    const put = (key: MarketKey, code: OutcomeCode, odds: number) => {
      if (!Number.isFinite(odds) || odds <= 1.0) return;
      if (!byKey.has(key)) byKey.set(key, new Map());
      const m = byKey.get(key)!;
      // Prefer the better (higher) price if a duplicate appears.
      if (!m.has(code) || odds > m.get(code)!) m.set(code, odds);
    };

    for (const o of outcomes) {
      if (o.G === 1) {
        const code: OutcomeCode | null =
          o.T === 1 ? 'HOME' : o.T === 2 ? 'DRAW' : o.T === 3 ? 'AWAY' : null;
        if (code) put('1X2', code, o.C);
      } else if (o.G === 17 && o.P !== undefined) {
        const code: OutcomeCode | null = o.T === 9 ? 'OVER' : o.T === 10 ? 'UNDER' : null;
        if (code) put(`OU@${o.P}` as MarketKey, code, o.C);
      } else if (o.G === 19) {
        const code: OutcomeCode | null = o.T === 180 ? 'YES' : o.T === 181 ? 'NO' : null;
        if (code) put('BTTS', code, o.C);
      } else if (o.G === 2) {
        // Asian Handicap group. T7 = home @ its line P, T8 = away @ its
        // line P (the away line is the negative of the home line). Line 0
        // is Draw No Bet. Only half lines become AH arbs (no push/void).
        const p = o.P ?? 0;
        if (o.T === 7) {
          if (p === 0) put('DNB', 'HOME', o.C);
          else if (isHalfLine(p)) put(`AH@${fmtLine(p)}` as MarketKey, 'HOME', o.C);
        } else if (o.T === 8) {
          if (p === 0) put('DNB', 'AWAY', o.C);
          else if (isHalfLine(p)) put(`AH@${fmtLine(-p)}` as MarketKey, 'AWAY', o.C);
        }
      }
    }

    const markets: NormalizedMarket[] = [];
    for (const [key, codes] of byKey) {
      if (codes.size < 2) continue;
      const list: NormalizedOutcome[] = [...codes].map(([code, odds]) => ({ code, odds }));
      markets.push({ key, outcomes: list });
    }
    return markets;
  }
}
