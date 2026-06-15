import { Injectable } from '@nestjs/common';
import { MatchedEvent, NormalizedEvent } from '../common/types';

/**
 * Groups the same real-world fixture across bookmakers.
 *
 * Strategy:
 *  1. Exact join on Betradar id when both books expose it.
 *  2. Otherwise fuzzy join: kickoff within ±10 min AND both team names
 *     similar (Sørensen–Dice on bigrams over normalized names).
 *
 * A wrong match here produces fake "arbs" that lose real money, so the
 * matcher is deliberately conservative: when in doubt, don't match.
 */
@Injectable()
export class EventMatcherService {
  private readonly kickoffToleranceMs = 10 * 60 * 1000;
  private readonly similarityThreshold = 0.62;

  match(eventsByBook: NormalizedEvent[][]): MatchedEvent[] {
    const books = eventsByBook.filter((list) => list.length > 0);
    if (books.length < 2) return [];

    // Anchor on the book with the most events; attach matches from the rest.
    books.sort((a, b) => b.length - a.length);
    const [anchors, ...others] = books;

    const matched: MatchedEvent[] = [];
    const claimed = new Set<NormalizedEvent>();

    for (const anchor of anchors) {
      const sources: NormalizedEvent[] = [anchor];
      for (const otherBook of others) {
        const best = this.bestMatch(anchor, otherBook, claimed);
        if (best) {
          sources.push(best);
          claimed.add(best);
        }
      }
      if (sources.length >= 2) {
        matched.push({
          home: anchor.home,
          away: anchor.away,
          league: anchor.league,
          startTime: anchor.startTime,
          sources,
        });
      }
    }
    return matched;
  }

  private bestMatch(
    anchor: NormalizedEvent,
    candidates: NormalizedEvent[],
    claimed: Set<NormalizedEvent>,
  ): NormalizedEvent | null {
    let best: NormalizedEvent | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      if (claimed.has(candidate)) continue;

      // Exact Betradar id join — trusted unconditionally.
      if (
        anchor.betradarId &&
        candidate.betradarId &&
        anchor.betradarId === candidate.betradarId
      ) {
        return candidate;
      }

      if (Math.abs(anchor.startTime - candidate.startTime) > this.kickoffToleranceMs) continue;
      // Never cross-match a women's fixture with a men's one.
      if (isWomens(anchor.home) !== isWomens(candidate.home)) continue;

      const homeScore = dice(normalizeTeam(anchor.home), normalizeTeam(candidate.home));
      const awayScore = dice(normalizeTeam(anchor.away), normalizeTeam(candidate.away));
      if (homeScore < this.similarityThreshold || awayScore < this.similarityThreshold) continue;

      const score = homeScore + awayScore;
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }
}

const STOPWORDS = /\b(fc|sc|fk|cf|afc|ac|cd|sv|club|de)\b/g;
const WOMENS = /\bw(omen)?\b|\(w\)|ladies/i;

export function isWomens(team: string): boolean {
  return WOMENS.test(team);
}

export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(STOPWORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sørensen–Dice coefficient on character bigrams. */
export function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      overlap++;
      bigrams.set(bg, count - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}
