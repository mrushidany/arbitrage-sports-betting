import { Controller, Get, Query } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ScannerService } from '../scanner/scanner.service';
import { SnapshotService } from '../snapshot/snapshot.service';

@Controller('api')
export class ApiController {
  constructor(
    private readonly snapshot: SnapshotService,
    private readonly scanner: ScannerService,
    private readonly prisma: PrismaService,
  ) {}

  /** Book health + last scan metadata (no arb payload). */
  @Get('status')
  status() {
    const s = this.snapshot.get();
    return {
      lastScanAt: s.lastScanAt,
      scanDurationMs: s.scanDurationMs,
      matchedFixtures: s.matchedFixtures,
      books: s.books,
      arbCount: s.arbs.length,
    };
  }

  /** Current live arbitrage opportunities (sorted by profit desc). */
  @Get('arbs')
  arbs() {
    const s = this.snapshot.get();
    return {
      lastScanAt: s.lastScanAt,
      arbs: s.arbs.map((a) => ({
        id: a.id,
        home: a.event.home,
        away: a.event.away,
        league: a.event.league,
        kickoff: a.event.startTime,
        market: a.market,
        profitPct: a.profitPct,
        impliedSum: a.impliedSum,
        totalStake: a.totalStake,
        guaranteedProfit: a.guaranteedProfit,
        suspicious: a.suspicious,
        note: a.note,
        detectedAt: a.detectedAt,
        legs: a.legs.map((l) => ({
          bookmaker: l.bookmaker,
          outcome: l.outcome,
          odds: l.odds,
          stake: l.stake,
        })),
      })),
    };
  }

  /** Force an immediate scan (handy from the dashboard's refresh button). */
  @Get('scan')
  async scan() {
    const arbs = await this.scanner.scan();
    return { ok: true, arbCount: arbs.length };
  }

  /**
   * Arbs from arbs.jsonl whose detectedAt is within ±90s of the given
   * timestamp t (ms). Used by the chart click-to-inspect feature.
   */
  @Get('arbs/around')
  arbsAround(@Query('t') tStr?: string) {
    const t = parseInt(tStr ?? '0', 10);
    const window = 90_000;
    try {
      const raw = readFileSync(join(process.cwd(), 'data', 'arbs.jsonl'), 'utf8');
      const arbs = raw
        .split('\n')
        .filter(Boolean)
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((a) => a && Math.abs(a.detectedAt - t) <= window);
      return { t, arbs };
    } catch {
      return { t, arbs: [] };
    }
  }

  /** Productivity time series for the dashboard chart (default last 24h). */
  @Get('stats/history')
  async statsHistory(@Query('hours') hours?: string) {
    const h = Math.min(Math.max(parseInt(hours ?? '24', 10) || 24, 1), 24 * 14);
    const since = new Date(Date.now() - h * 3600_000);
    const rows = await this.prisma.scanStat.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      hours: h,
      points: rows.map((r) => ({
        t: r.createdAt.getTime(),
        matchedFixtures: r.matchedFixtures,
        tradableMarkets: r.tradableMarkets,
        arbCount: r.arbCount,
        tightestImplied: r.tightestImplied,
        under101: r.under101,
        under102: r.under102,
        under103: r.under103,
      })),
    };
  }
}
