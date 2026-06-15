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
 * DB-Bet TZ (db-bet-72958.pro) — 1xBet white-label, same VZip payload
 * as Helabet (LineFeed API, fields O1/O2/L/S/I/E/AE identical).
 *
 * partner=164 confirmed via browser DevTools capture.
 * LineFeed does NOT require the x-hd session token that LiveFeed needs —
 * just the four standard browser-context headers below.
 *
 * Rate limit note: ~20 requests within 2 minutes triggers a temporary
 * block (~5 min). maxLeagues is kept at 8 so each 60-second scan cycle
 * makes at most 10 LineFeed calls (well within the limit).
 */

interface DbbetOutcome {
  G: number;
  T: number;
  C: number;
  P?: number;
}

interface DbbetEvent {
  O1?: string;
  O2?: string;
  L?: string;
  S?: number;
  I?: number;
  E?: DbbetOutcome[];
  AE?: { G: number; ME?: DbbetOutcome[] }[];
}

interface DbbetResponse {
  Success?: boolean;
  Value?: DbbetEvent[];
}

interface DbbetChamp {
  L?: string;
  LI?: number;
  GC?: number;
  SC?: DbbetChamp[];
}

interface ChampsResponse {
  Value?: DbbetChamp[];
}

const SPECIAL_LEAGUE = /winner|team vs player|player vs|duel|specials?|to win|outright|long[- ]?term/i;

@Injectable()
export class DbbetAdapter implements BookmakerAdapter {
  readonly key = 'dbbet';
  readonly name = 'DB-Bet TZ';
  readonly enabled = true;

  private readonly logger = new Logger(DbbetAdapter.name);
  private readonly api = 'https://db-bet-72958.pro/service-api/LineFeed';
  private readonly partner = '164';
  private readonly common = `lng=en&mode=4&country=181&partner=${this.partner}&getEmpty=true&virtualSports=true`;
  private readonly extraHeaders = {
    'x-svc-source': '__BETTING_APP__',
    'Referer': 'https://db-bet-72958.pro/en',
    'x-requested-with': 'XMLHttpRequest',
    'Accept': 'application/json, text/plain, */*',
  };
  private readonly count = 100;
  // Keep at 8 so each 60-second scan cycle stays under ~10 LineFeed calls total.
  private readonly maxLeagues = 8;

  async fetchEvents(): Promise<NormalizedEvent[]> {
    const leagueIds = await this.topLeagueIds();
    const urls = [
      `${this.api}/Get1x2_VZip?sports=1&count=${this.count}&${this.common}`,
      ...leagueIds.map((id) => `${this.api}/Get1x2_VZip?champs=${id}&count=${this.count}&${this.common}`),
    ];

    const results = await Promise.allSettled(
      urls.map((u) => fetchJson<DbbetResponse>(u, this.extraHeaders)),
    );

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

  private async topLeagueIds(): Promise<number[]> {
    try {
      const res = await fetchJson<ChampsResponse>(
        `${this.api}/GetChampsZip?sport=1&lng=en&country=181&partner=${this.partner}&virtualSports=true&groupChamps=true`,
        this.extraHeaders,
      );
      const flat: DbbetChamp[] = [];
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
      this.logger.warn(`League enumeration failed: ${(err as Error).message}`);
      return [];
    }
  }

  private normalizeEvent(ev: DbbetEvent): NormalizedEvent | null {
    if (!ev.O1 || !ev.O2 || !ev.S) return null;

    const flat: DbbetOutcome[] = [...(ev.E ?? [])];
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

  private buildMarkets(outcomes: DbbetOutcome[]): NormalizedMarket[] {
    const byKey = new Map<MarketKey, Map<OutcomeCode, number>>();

    const put = (key: MarketKey, code: OutcomeCode, odds: number) => {
      if (!Number.isFinite(odds) || odds <= 1.0) return;
      if (!byKey.has(key)) byKey.set(key, new Map());
      const m = byKey.get(key)!;
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
