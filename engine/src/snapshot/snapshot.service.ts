import { Injectable } from '@nestjs/common';
import { ArbOpportunity } from '../common/types';

export interface BookStat {
  key: string;
  name: string;
  enabled: boolean;
  ok: boolean;
  eventCount: number;
  error?: string;
}

export interface ScanSnapshot {
  lastScanAt: number | null;
  scanDurationMs: number;
  matchedFixtures: number;
  books: BookStat[];
  arbs: ArbOpportunity[];
}

/**
 * In-memory store of the most recent scan result. The scanner writes here
 * each cycle; the HTTP API reads from here. Live arbs are ephemeral by
 * nature (odds move), so they don't belong in the database — only the bets
 * the user actually places get persisted.
 */
@Injectable()
export class SnapshotService {
  private snapshot: ScanSnapshot = {
    lastScanAt: null,
    scanDurationMs: 0,
    matchedFixtures: 0,
    books: [],
    arbs: [],
  };

  update(snapshot: ScanSnapshot): void {
    this.snapshot = snapshot;
  }

  get(): ScanSnapshot {
    return this.snapshot;
  }
}
