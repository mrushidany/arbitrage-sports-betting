import { NormalizedEvent } from '../common/types';

export const BOOKMAKER_ADAPTERS = Symbol('BOOKMAKER_ADAPTERS');

export interface BookmakerAdapter {
  /** Stable lowercase key, e.g. "sportybet". */
  readonly key: string;
  readonly name: string;
  /** False while an adapter is scaffolded but not yet operational. */
  readonly enabled: boolean;
  /** Fetch upcoming football events with their main markets, normalized. */
  fetchEvents(): Promise<NormalizedEvent[]>;
}

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/** Shared JSON GET with browser-like headers and a hard timeout. */
export async function fetchJson<T>(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 15_000,
): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * True only for half lines (…-1.5, -0.5, 0.5, 1.5…). We restrict Asian
 * Handicap arbs to these because half lines always resolve win/lose —
 * whole lines can push and quarter lines half-void, either of which would
 * break the "guaranteed" stake-split math.
 */
export function isHalfLine(line: number): boolean {
  return Number.isInteger(line * 2) && !Number.isInteger(line);
}

/** Format a numeric line for a market key without trailing-zero drift. */
export function fmtLine(line: number): string {
  return String(line);
}
