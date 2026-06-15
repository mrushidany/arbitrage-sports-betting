import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ArbitrageService } from '../arbitrage/arbitrage.service';
import { BOOKMAKER_ADAPTERS, BookmakerAdapter } from '../bookmakers/bookmaker-adapter';
import { ArbOpportunity, NormalizedEvent } from '../common/types';
import { EventMatcherService } from '../matching/event-matcher.service';
import { TelegramService } from '../notifier/telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { computeNearMiss } from '../stats/near-miss';
import { BookStat, SnapshotService } from '../snapshot/snapshot.service';

interface AlertMemo {
  profitPct: number;
  alertedAt: number;
}

@Injectable()
export class ScannerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ScannerService.name);
  private readonly intervalMs: number;
  private readonly autoStart: boolean;
  private timer?: NodeJS.Timeout;
  private scanning = false;

  /** Dedupe memory: don't re-alert the same arb unless it improved or aged out. */
  private readonly alerted = new Map<string, AlertMemo>();
  private readonly reAlertAfterMs = 15 * 60 * 1000;
  private readonly reAlertProfitDelta = 0.3;

  constructor(
    @Inject(BOOKMAKER_ADAPTERS) private readonly adapters: BookmakerAdapter[],
    private readonly matcher: EventMatcherService,
    private readonly arbitrage: ArbitrageService,
    private readonly telegram: TelegramService,
    private readonly snapshot: SnapshotService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.intervalMs = parseInt(config.get('SCAN_INTERVAL_SEC') ?? '60', 10) * 1000;
    this.autoStart = (config.get('SCANNER_AUTOSTART') ?? 'true') !== 'false';
  }

  onApplicationBootstrap(): void {
    if (!this.autoStart) return;
    this.logger.log(
      `Scanner starting: ${this.adapters.filter((a) => a.enabled).length} active books, every ${this.intervalMs / 1000}s`,
    );
    void this.scan();
    this.timer = setInterval(() => void this.scan(), this.intervalMs);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One full scan cycle. Returns the arbs found (also used by scan-once). */
  async scan(): Promise<ArbOpportunity[]> {
    if (this.scanning) {
      this.logger.warn('Previous scan still running, skipping this tick');
      return [];
    }
    this.scanning = true;
    const startedAt = Date.now();
    try {
      const active = this.adapters.filter((a) => a.enabled);
      const results = await Promise.allSettled(active.map((a) => a.fetchEvents()));

      const eventsByBook: NormalizedEvent[][] = [];
      const books: BookStat[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          this.logger.log(`${active[i].name}: ${result.value.length} events`);
          eventsByBook.push(result.value);
          books.push({
            key: active[i].key,
            name: active[i].name,
            enabled: true,
            ok: true,
            eventCount: result.value.length,
          });
        } else {
          const message = result.reason?.message ?? String(result.reason);
          this.logger.error(`${active[i].name} fetch failed: ${message}`);
          books.push({
            key: active[i].key,
            name: active[i].name,
            enabled: true,
            ok: false,
            eventCount: 0,
            error: message,
          });
        }
      });

      const matched = this.matcher.match(eventsByBook);
      const arbs = this.arbitrage.findArbs(matched);
      const nearMiss = computeNearMiss(matched);
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `Matched ${matched.length} cross-book fixtures, found ${arbs.length} arb(s) in ${durationMs}ms`,
      );

      this.snapshot.update({
        lastScanAt: Date.now(),
        scanDurationMs: durationMs,
        matchedFixtures: matched.length,
        books,
        arbs,
      });

      // Persist the productivity time series (best-effort — never break a scan).
      try {
        await this.prisma.scanStat.create({
          data: {
            matchedFixtures: nearMiss.matchedFixtures,
            tradableMarkets: nearMiss.tradableMarkets,
            arbCount: arbs.length,
            tightestImplied: nearMiss.tightestImplied,
            under101: nearMiss.under101,
            under102: nearMiss.under102,
            under103: nearMiss.under103,
          },
        });
      } catch (err) {
        this.logger.warn(`Could not persist scan stat: ${(err as Error).message}`);
      }

      for (const arb of arbs) {
        if (this.shouldAlert(arb)) {
          await this.telegram.sendArb(arb);
          this.persist(arb);
          this.alerted.set(arb.id, { profitPct: arb.profitPct, alertedAt: Date.now() });
        }
      }
      this.gcMemos();
      return arbs;
    } finally {
      this.scanning = false;
    }
  }

  private shouldAlert(arb: ArbOpportunity): boolean {
    const memo = this.alerted.get(arb.id);
    if (!memo) return true;
    if (arb.profitPct >= memo.profitPct + this.reAlertProfitDelta) return true;
    return Date.now() - memo.alertedAt > this.reAlertAfterMs;
  }

  /** Append every alerted arb to a JSONL log for later P&L analysis. */
  private persist(arb: ArbOpportunity): void {
    try {
      const dir = join(process.cwd(), 'data');
      mkdirSync(dir, { recursive: true });
      const record = { ...arb, event: { ...arb.event, sources: undefined } };
      appendFileSync(join(dir, 'arbs.jsonl'), JSON.stringify(record) + '\n');
    } catch (err) {
      this.logger.warn(`Could not persist arb: ${(err as Error).message}`);
    }
  }

  private gcMemos(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, memo] of this.alerted) {
      if (memo.alertedAt < cutoff) this.alerted.delete(key);
    }
  }
}
