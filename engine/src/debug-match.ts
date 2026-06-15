import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BOOKMAKER_ADAPTERS, BookmakerAdapter } from './bookmakers/bookmaker-adapter';
import { EventMatcherService } from './matching/event-matcher.service';

/** Diagnostic: show matched fixtures with per-book best-of implied sums. */
async function main() {
  process.env.SCANNER_AUTOSTART = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const adapters = app.get<BookmakerAdapter[]>(BOOKMAKER_ADAPTERS);
  const matcher = app.get(EventMatcherService);

  const eventsByBook = await Promise.all(
    adapters.filter((a) => a.enabled).map((a) => a.fetchEvents()),
  );
  const matched = matcher.match(eventsByBook);
  console.log(`matched fixtures: ${matched.length}\n`);

  for (const event of matched) {
    console.log(`${event.home} vs ${event.away} — ${new Date(event.startTime).toISOString()}`);
    const marketKeys = new Set(event.sources.flatMap((s) => s.markets.map((m) => m.key)));
    for (const key of marketKeys) {
      const perBook = event.sources
        .map((s) => {
          const m = s.markets.find((x) => x.key === key);
          if (!m) return `  ${s.bookmaker}: -`;
          return `  ${s.bookmaker}: ${m.outcomes.map((o) => `${o.code}=${o.odds}`).join(' ')}`;
        })
        .join('\n');
      // best-of implied sum
      const best = new Map<string, number>();
      for (const s of event.sources) {
        const m = s.markets.find((x) => x.key === key);
        for (const o of m?.outcomes ?? []) {
          if (!best.has(o.code) || o.odds > best.get(o.code)!) best.set(o.code, o.odds);
        }
      }
      const sum = [...best.values()].reduce((acc, odds) => acc + 1 / odds, 0);
      console.log(` [${key}] best-of implied ${(sum * 100).toFixed(2)}% (${best.size} outcomes)`);
      console.log(perBook);
    }
    console.log('');
  }
  await app.close();
}

void main();
