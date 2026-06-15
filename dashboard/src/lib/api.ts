/** Typed client for the arb-engine HTTP API. */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5001';

export interface BookStat {
  key: string;
  name: string;
  enabled: boolean;
  ok: boolean;
  eventCount: number;
  error?: string;
}

export interface EngineStatus {
  lastScanAt: number | null;
  scanDurationMs: number;
  matchedFixtures: number;
  books: BookStat[];
  arbCount: number;
}

export interface ArbLeg {
  bookmaker: string;
  outcome: string;
  odds: number;
  stake: number;
}

export interface Arb {
  id: string;
  home: string;
  away: string;
  league: string;
  kickoff: number;
  market: string;
  profitPct: number;
  impliedSum: number;
  totalStake: number;
  guaranteedProfit: number;
  taxRate: number;
  afterTaxProfitPct: number;
  afterTaxGuaranteedProfit: number;
  suspicious: boolean;
  note?: string;
  detectedAt: number;
  legs: ArbLeg[];
}

export interface BetLeg {
  id: string;
  bookmaker: string;
  outcome: string;
  odds: number;
  stake: number;
}

export interface Bet {
  id: string;
  createdAt: string;
  home: string;
  away: string;
  league: string;
  market: string;
  kickoff: string;
  profitPct: number;
  totalStake: number;
  status: 'OPEN' | 'SETTLED' | 'VOID';
  winningOutcome: string | null;
  realizedPnl: number | null;
  settledAt: string | null;
  note: string | null;
  legs: BetLeg[];
}

export interface StatPoint {
  t: number;
  matchedFixtures: number;
  tradableMarkets: number;
  arbCount: number;
  tightestImplied: number | null;
  under101: number;
  under102: number;
  under103: number;
}

export interface HistoricalArb {
  id: string;
  event: { home: string; away: string; league: string; startTime: number };
  market: string;
  legs: ArbLeg[];
  impliedSum: number;
  profitPct: number;
  totalStake: number;
  guaranteedProfit: number;
  taxRate: number;
  afterTaxProfitPct: number;
  afterTaxGuaranteedProfit: number;
  suspicious: boolean;
  note?: string;
  detectedAt: number;
}

export interface BetsSummary {
  currency: string;
  openCount: number;
  settledCount: number;
  stakedOutstanding: number;
  realizedPnl: number;
  settledTurnover: number;
  roiPct: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => request<EngineStatus>('/api/status'),
  arbs: () => request<{ lastScanAt: number | null; arbs: Arb[] }>('/api/arbs'),
  scanNow: () => request<{ ok: boolean; arbCount: number }>('/api/scan'),
  statsHistory: (hours = 24) =>
    request<{ hours: number; points: StatPoint[] }>(`/api/stats/history?hours=${hours}`),
  arbsAround: (t: number) =>
    request<{ t: number; arbs: HistoricalArb[] }>(`/api/arbs/around?t=${t}`),
  bets: () => request<Bet[]>('/api/bets'),
  summary: () => request<BetsSummary>('/api/bets/summary'),
  logBet: (arb: Arb, note?: string) =>
    request<Bet>('/api/bets', {
      method: 'POST',
      body: JSON.stringify({
        home: arb.home,
        away: arb.away,
        league: arb.league,
        market: arb.market,
        kickoff: arb.kickoff,
        profitPct: arb.profitPct,
        totalStake: arb.totalStake,
        legs: arb.legs,
        note,
      }),
    }),
  settleBet: (id: string, winningOutcome: string) =>
    request<Bet>(`/api/bets/${id}/settle`, {
      method: 'PATCH',
      body: JSON.stringify({ winningOutcome }),
    }),
  voidBet: (id: string) =>
    request<Bet>(`/api/bets/${id}/settle`, {
      method: 'PATCH',
      body: JSON.stringify({ void: true }),
    }),
  deleteBet: (id: string) => request<{ ok: boolean }>(`/api/bets/${id}`, { method: 'DELETE' }),
};

export const BOOK_LABELS: Record<string, string> = {
  sportybet: 'SportyBet',
  helabet: 'Helabet',
};

export function fmtMoney(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtKickoff(ts: number | string): string {
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Africa/Dar_es_Salaam',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
