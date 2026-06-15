import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { BOOKMAKER_ADAPTERS, BookmakerAdapter } from './bookmakers/bookmaker-adapter';
import { EventMatcherService } from './matching/event-matcher.service';
import { computeNearMiss, marketType, NearMissMarket } from './stats/near-miss';

/**
 * Productivity report for the current book lineup. Two parts:
 *
 *  1. NEAR-MISS — a single live scan, bucketed by how close each tradable
 *     market is to an arb. With efficient books you'll rarely see live arbs
 *     at the instant you scan, but the share of markets sitting near 100–101%
 *     tells you how often an arb will *fire* as prices wiggle.
 *
 *  2. ARB LOG — a summary of every arb the running engine has actually
 *     detected and recorded to data/arbs.jsonl over time.
 */

function band(pct: number): string {
  if (pct < 100) return 'ARB (<100%)';
  if (pct < 100.5) return '100–100.5%';
  if (pct < 101) return '100.5–101%';
  if (pct < 102) return '101–102%';
  if (pct < 103) return '102–103%';
  return '>103%';
}

const BANDS = ['ARB (<100%)', '100–100.5%', '100.5–101%', '101–102%', '102–103%', '>103%'];

async function nearMiss() {
  process.env.SCANNER_AUTOSTART = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const adapters = app.get<BookmakerAdapter[]>(BOOKMAKER_ADAPTERS);
  const matcher = app.get(EventMatcherService);

  const active = adapters.filter((a) => a.enabled);
  const byBook = await Promise.all(active.map((a) => a.fetchEvents()));
  const matched = matcher.match(byBook);
  const summary = computeNearMiss(matched);
  const stats: NearMissMarket[] = summary.markets;

  console.log('\n══════════ LIVE NEAR-MISS SCAN ══════════');
  console.log(`Books: ${active.map((a, i) => `${a.name}=${byBook[i].length}`).join(', ')}`);
  console.log(`Matched fixtures (≥2 books): ${summary.matchedFixtures}`);
  console.log(`Tradable cross-book markets: ${summary.tradableMarkets}`);
  if (stats.length === 0) {
    await app.close();
    return;
  }

  const bandCounts: Record<string, number> = {};
  for (const s of stats) bandCounts[band(s.impliedPct)] = (bandCounts[band(s.impliedPct)] ?? 0) + 1;
  console.log('\nHow close are markets to an arb? (best-of implied %)');
  for (const b of BANDS) {
    const n = bandCounts[b] ?? 0;
    const pct = ((n / stats.length) * 100).toFixed(1);
    console.log(`  ${b.padEnd(13)} ${String(n).padStart(4)}  ${'█'.repeat(Math.round((n / stats.length) * 40))} ${pct}%`);
  }

  console.log('\nBy market type (count · tightest implied %):');
  const byType = new Map<string, NearMissMarket[]>();
  for (const s of stats) (byType.get(s.type) ?? byType.set(s.type, []).get(s.type)!).push(s);
  for (const [type, arr] of [...byType.entries()].sort((a, b) => a[1][0].impliedPct - b[1][0].impliedPct)) {
    console.log(`  ${type.padEnd(5)} ${String(arr.length).padStart(4)} markets · tightest ${arr[0].impliedPct.toFixed(2)}%`);
  }

  console.log('\nTightest 8 markets right now (closest to a surebet):');
  for (const s of stats.slice(0, 8)) console.log(`  ${s.impliedPct.toFixed(2)}%  ${s.label}`);

  await app.close();
}

function arbLog() {
  const file = join(process.cwd(), 'data', 'arbs.jsonl');
  console.log('\n══════════ DETECTED ARB LOG (data/arbs.jsonl) ══════════');
  if (!existsSync(file)) {
    console.log('No arb log yet — none detected since the engine started recording.');
    return;
  }
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log('Arb log is empty.');
    return;
  }
  const arbs = lines.map((l) => JSON.parse(l));
  const byType = new Map<string, number>();
  let maxProfit = 0;
  let sumProfit = 0;
  for (const a of arbs) {
    const t = marketType(a.market ?? '');
    byType.set(t, (byType.get(t) ?? 0) + 1);
    maxProfit = Math.max(maxProfit, a.profitPct ?? 0);
    sumProfit += a.profitPct ?? 0;
  }
  const times = arbs.map((a) => a.detectedAt).filter(Boolean).sort();
  console.log(`Total arbs detected: ${arbs.length}`);
  console.log(`Avg profit: ${(sumProfit / arbs.length).toFixed(2)}%  ·  Max: ${maxProfit.toFixed(2)}%`);
  if (times.length) {
    console.log(`First: ${new Date(times[0]).toLocaleString()}  ·  Last: ${new Date(times[times.length - 1]).toLocaleString()}`);
  }
  console.log('By market type:', [...byType.entries()].map(([t, n]) => `${t}=${n}`).join(' '));
}

async function main() {
  await nearMiss();
  arbLog();
  console.log('');
}

void main();
