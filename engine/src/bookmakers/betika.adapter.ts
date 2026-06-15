import { Injectable, Logger } from '@nestjs/common';
import { BookmakerAdapter, fetchJson } from './bookmaker-adapter';
import { NormalizedEvent, NormalizedMarket, NormalizedOutcome, OutcomeCode } from '../common/types';

/**
 * Betika Tanzania — public API used by their own web app.
 * Betradar-sourced events: parent_match_id maps to SportyBet's sr:match:{id},
 * giving us exact cross-book matching on 1X2 markets.
 *
 * The listing endpoint only returns 1X2. Additional markets (OU, BTTS, etc.)
 * are behind per-match detail calls (side_bets count shown but not fetched here
 * to avoid N×100 requests per scan).
 */

interface BetikaOddsEntry {
  display: string;   // "1" = HOME, "X" = DRAW, "2" = AWAY
  odd_value: string; // decimal odds as string
}

interface BetikaMarket {
  sub_type_id: string; // "1" = 1X2
  name: string;
  odds: BetikaOddsEntry[];
}

interface BetikaMatch {
  match_id: string;
  parent_match_id: string;  // Betradar numeric ID — maps to SportyBet's sr:match:N
  home_team: string;
  away_team: string;
  start_time: string; // "YYYY-MM-DD HH:MM:SS" UTC
  competition_name: string;
  category: string;
  provider: string;  // "sr" = Sportradar/Betradar
  odds: BetikaMarket[];
}

interface BetikaResponse {
  data: BetikaMatch[];
  meta: { total: string };
}

@Injectable()
export class BetikaAdapter implements BookmakerAdapter {
  readonly key = 'betika';
  readonly name = 'Betika TZ';
  readonly enabled = true;

  private readonly logger = new Logger(BetikaAdapter.name);
  private readonly base = 'https://api.betika.com/v1/uo/matches';
  private readonly extraHeaders = {
    Origin: 'https://www.betika.com',
    Referer: 'https://www.betika.com/',
  };
  private readonly maxPages = 10;

  async fetchEvents(): Promise<NormalizedEvent[]> {
    const events: NormalizedEvent[] = [];
    let page = 1;
    let total = Infinity;

    while (events.length < total && page <= this.maxPages) {
      const url = `${this.base}?per_page=100&page=${page}&sport_id=14&status=upcoming`;
      const res = await fetchJson<BetikaResponse>(url, this.extraHeaders);
      const matches = res.data ?? [];
      if (matches.length === 0) break;

      const parsedTotal = parseInt(res.meta?.total ?? '0', 10);
      if (parsedTotal > 0) total = parsedTotal;

      for (const match of matches) {
        try {
          const ev = this.normalizeMatch(match);
          if (ev) events.push(ev);
        } catch {
          // one bad match never kills the scan
        }
      }

      if (matches.length < 100) break;
      page++;
    }

    this.logger.log(`Betika: fetched ${events.length} events across ${page} page(s)`);
    return events;
  }

  private normalizeMatch(m: BetikaMatch): NormalizedEvent | null {
    if (!m.home_team || !m.away_team || !m.start_time) return null;

    const markets: NormalizedMarket[] = [];
    for (const market of m.odds ?? []) {
      const nm = this.normalizeMarket(market);
      if (nm) markets.push(nm);
    }
    if (markets.length === 0) return null;

    return {
      bookmaker: this.key,
      bookmakerEventId: m.match_id,
      // parent_match_id is the Betradar numeric event ID used by SportyBet as sr:match:{id}
      betradarId: m.parent_match_id ? `sr:match:${m.parent_match_id}` : undefined,
      home: m.home_team,
      away: m.away_team,
      league: m.competition_name ?? m.category ?? '',
      // Betika times are in EAT (UTC+3 = Africa/Nairobi = Africa/Dar_es_Salaam)
      startTime: new Date(m.start_time.replace(' ', 'T') + '+03:00').getTime(),
      markets,
    };
  }

  private normalizeMarket(m: BetikaMarket): NormalizedMarket | null {
    if (m.sub_type_id !== '1') return null; // 1X2 only from listing feed

    const outcomes: NormalizedOutcome[] = [];
    for (const o of m.odds ?? []) {
      const code = this.displayToCode(o.display);
      const odds = parseFloat(o.odd_value);
      if (code && Number.isFinite(odds) && odds > 1.0) {
        outcomes.push({ code, odds });
      }
    }
    return outcomes.length >= 2 ? { key: '1X2', outcomes } : null;
  }

  private displayToCode(display: string): OutcomeCode | null {
    if (display === '1') return 'HOME';
    if (display === 'X') return 'DRAW';
    if (display === '2') return 'AWAY';
    return null;
  }
}
