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
 * SportyBet Tanzania — public facts-center API used by their own web app.
 * Verified live: returns Betradar-sourced events with `sr:match:*` ids,
 * which gives us exact cross-book matching against other Betradar books.
 *
 * Market ids (Betradar convention): 1 = 1X2, 18 = Over/Under (specifier
 * "total=X.Y"), 29 = Both Teams To Score.
 */

interface SportyOutcome {
  desc: string;
  odds: string;
  isActive: number;
}

interface SportyMarket {
  id: string;
  specifier?: string;
  status: number;
  outcomes: SportyOutcome[];
}

interface SportyEvent {
  eventId: string; // "sr:match:66457070"
  homeTeamName: string;
  awayTeamName: string;
  estimateStartTime: number; // epoch ms
  sport?: { category?: { tournament?: { name?: string } } };
  markets: SportyMarket[];
}

interface SportyResponse {
  bizCode: number;
  data?: { totalNum: number; tournaments: { name: string; events: SportyEvent[] }[] };
}

@Injectable()
export class SportybetAdapter implements BookmakerAdapter {
  readonly key = 'sportybet';
  readonly name = 'SportyBet TZ';
  readonly enabled = true;

  private readonly logger = new Logger(SportybetAdapter.name);
  private readonly base = 'https://www.sportybet.com/api/tz/factsCenter/pcUpcomingEvents';
  private readonly pages = 3;
  private readonly pageSize = 100;

  async fetchEvents(): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];
    for (let page = 1; page <= this.pages; page++) {
      const url =
        `${this.base}?sportId=${encodeURIComponent('sr:sport:1')}` +
        `&marketId=${encodeURIComponent('1,18,29,11,16')}` +
        `&pageSize=${this.pageSize}&pageNum=${page}`;
      const res = await fetchJson<SportyResponse>(url);
      if (res.bizCode !== 10000 || !res.data) {
        this.logger.warn(`Unexpected bizCode ${res.bizCode} on page ${page}`);
        break;
      }
      for (const tournament of res.data.tournaments ?? []) {
        for (const ev of tournament.events ?? []) {
          try {
            const normalized = this.normalizeEvent(ev, tournament.name);
            if (normalized) events.push(normalized);
          } catch {
            // one malformed event must never kill the scan
          }
        }
      }
      if (res.data.totalNum <= page * this.pageSize) break;
    }
    return events;
  }

  private normalizeEvent(ev: SportyEvent, tournamentName: string): NormalizedEvent | null {
    if (!ev.homeTeamName || !ev.awayTeamName || !ev.estimateStartTime) return null;
    const markets: NormalizedMarket[] = [];
    for (const m of ev.markets ?? []) {
      const market = this.normalizeMarket(m);
      if (market) markets.push(market);
    }
    if (markets.length === 0) return null;
    return {
      bookmaker: this.key,
      bookmakerEventId: ev.eventId,
      betradarId: ev.eventId.startsWith('sr:match:') ? ev.eventId : undefined,
      home: ev.homeTeamName,
      away: ev.awayTeamName,
      league: ev.sport?.category?.tournament?.name ?? tournamentName ?? '',
      startTime: ev.estimateStartTime,
      markets,
    };
  }

  private normalizeMarket(m: SportyMarket): NormalizedMarket | null {
    if (m.status !== 0) return null;
    let key: MarketKey;
    let mapOutcome: (desc: string) => OutcomeCode | null;

    if (m.id === '1') {
      key = '1X2';
      mapOutcome = (d) =>
        ({ home: 'HOME', draw: 'DRAW', away: 'AWAY' }) [d.toLowerCase()] as OutcomeCode ?? null;
    } else if (m.id === '18') {
      const line = /total=([\d.]+)/.exec(m.specifier ?? '')?.[1];
      if (!line) return null;
      key = `OU@${line}`;
      mapOutcome = (d) =>
        d.toLowerCase().includes('over') ? 'OVER' : d.toLowerCase().includes('under') ? 'UNDER' : null;
    } else if (m.id === '29') {
      key = 'BTTS';
      mapOutcome = (d) =>
        d.toLowerCase() === 'yes' ? 'YES' : d.toLowerCase() === 'no' ? 'NO' : null;
    } else if (m.id === '11') {
      key = 'DNB';
      mapOutcome = (d) =>
        d.toLowerCase() === 'home' ? 'HOME' : d.toLowerCase() === 'away' ? 'AWAY' : null;
    } else if (m.id === '16') {
      // Asian Handicap. specifier "hcp=-0.5" is the HOME line; the "Home"
      // outcome is that line, "Away" is its mirror. Half lines only.
      const hcp = parseFloat(/hcp=(-?[\d.]+)/.exec(m.specifier ?? '')?.[1] ?? '');
      if (!Number.isFinite(hcp) || !isHalfLine(hcp)) return null;
      key = `AH@${fmtLine(hcp)}`;
      mapOutcome = (d) =>
        d.toLowerCase().startsWith('home') ? 'HOME' : d.toLowerCase().startsWith('away') ? 'AWAY' : null;
    } else {
      return null;
    }

    const outcomes: NormalizedOutcome[] = [];
    for (const o of m.outcomes ?? []) {
      if (o.isActive !== 1) continue;
      const code = mapOutcome(o.desc ?? '');
      const odds = parseFloat(o.odds);
      if (code && Number.isFinite(odds) && odds > 1.0) {
        outcomes.push({ code, odds });
      }
    }
    return outcomes.length >= 2 ? { key, outcomes } : null;
  }
}
