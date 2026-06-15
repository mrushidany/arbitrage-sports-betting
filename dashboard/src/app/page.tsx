'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Arb,
  Bet,
  BetsSummary,
  EngineStatus,
  StatPoint,
  api,
} from '@/lib/api';
import { StatusBar } from '@/components/StatusBar';
import { ArbTable } from '@/components/ArbTable';
import { SummaryCards } from '@/components/SummaryCards';
import { BetsPanel } from '@/components/BetsPanel';
import { ProductivityChart } from '@/components/ProductivityChart';

const POLL_MS = 10_000;

export default function Dashboard() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [arbs, setArbs] = useState<Arb[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [summary, setSummary] = useState<BetsSummary | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statHistory, setStatHistory] = useState<StatPoint[]>([]);
  const [statHours, setStatHours] = useState(24);
  const reachable = useRef(true);

  const refreshLive = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([api.status(), api.arbs()]);
      setStatus(s);
      setArbs(a.arbs);
      setError(null);
      reachable.current = true;
    } catch (err) {
      setStatus(null);
      reachable.current = false;
      setError((err as Error).message);
    }
  }, []);

  const refreshBets = useCallback(async () => {
    if (!reachable.current) return;
    try {
      const [b, sum] = await Promise.all([api.bets(), api.summary()]);
      setBets(b);
      setSummary(sum);
    } catch {
      // bets are non-critical for the live view; ignore transient errors
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    if (!reachable.current) return;
    try {
      const res = await api.statsHistory(statHours);
      setStatHistory(res.points);
    } catch {
      // history is non-critical; ignore transient errors
    }
  }, [statHours]);

  useEffect(() => {
    void refreshLive();
    void refreshBets();
    void refreshHistory();
    const timer = setInterval(() => {
      void refreshLive();
      void refreshBets();
      void refreshHistory();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshLive, refreshBets, refreshHistory]);

  const handleScanNow = async () => {
    setScanning(true);
    try {
      await api.scanNow();
      await refreshLive();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleLogBet = async (arb: Arb) => {
    await api.logBet(arb);
    await refreshBets();
  };

  const handleSettle = async (id: string, outcome: string) => {
    await api.settleBet(id, outcome);
    await refreshBets();
  };

  const handleVoid = async (id: string) => {
    await api.voidBet(id);
    await refreshBets();
  };

  const handleDelete = async (id: string) => {
    await api.deleteBet(id);
    await refreshBets();
  };

  const currency = summary?.currency ?? 'TZS';

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Arbitrage Console</h1>
          <p className="text-sm text-zinc-500">
            Live surebets across SportyBet · Helabet
          </p>
        </div>
        <span className="text-xs text-zinc-600">auto-refresh {POLL_MS / 1000}s</span>
      </header>

      <StatusBar status={status} onScanNow={handleScanNow} scanning={scanning} />

      {error && status === null && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <SummaryCards summary={summary} />

      <ProductivityChart points={statHistory} hours={statHours} onHoursChange={setStatHours} />

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Live arbitrage
          {arbs.length > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
              {arbs.length}
            </span>
          )}
        </h2>
        <ArbTable arbs={arbs} currency={currency} onLogBet={handleLogBet} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Bet log &amp; P&amp;L
        </h2>
        <BetsPanel bets={bets} onSettle={handleSettle} onVoid={handleVoid} onDelete={handleDelete} />
      </section>

      <footer className="pt-4 text-center text-xs text-zinc-700">
        Odds move fast — verify on the bookmaker before staking. Place the softer-book leg first.
      </footer>
    </main>
  );
}
