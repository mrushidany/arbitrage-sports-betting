'use client';

import { useState } from 'react';
import { Arb, BOOK_LABELS, fmtKickoff, fmtMoney } from '@/lib/api';

export function ArbTable({
  arbs,
  currency,
  onLogBet,
}: {
  arbs: Arb[];
  currency: string;
  onLogBet: (arb: Arb) => Promise<void>;
}) {
  if (arbs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-12 text-center text-sm text-zinc-500">
        No live arbitrage right now. Arbs appear in bursts when books disagree —
        the table fills in automatically on the next scan.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {arbs.map((arb) => (
        <ArbCard key={arb.id} arb={arb} currency={currency} onLogBet={onLogBet} />
      ))}
    </div>
  );
}

function ArbCard({
  arb,
  currency,
  onLogBet,
}: {
  arb: Arb;
  currency: string;
  onLogBet: (arb: Arb) => Promise<void>;
}) {
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const afterTaxLoss = arb.taxRate > 0 && arb.afterTaxProfitPct <= 0;

  const handleLog = async () => {
    setLogging(true);
    try {
      await onLogBet(arb);
      setLogged(true);
    } finally {
      setLogging(false);
    }
  };

  return (
    <div
      className={`rounded-xl border bg-zinc-900/60 p-4 ${
        arb.suspicious
          ? 'border-amber-700/60'
          : afterTaxLoss
          ? 'border-red-900/60'
          : 'border-zinc-800'
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        {/* After-tax profit badge — the number that actually matters */}
        <div className="flex flex-col items-center">
          <div
            className={`rounded-lg px-2.5 py-1 text-lg font-bold tabular-nums ${
              arb.suspicious
                ? 'bg-amber-500/15 text-amber-400'
                : afterTaxLoss
                ? 'bg-red-500/15 text-red-400'
                : 'bg-emerald-500/15 text-emerald-400'
            }`}
          >
            {arb.afterTaxProfitPct.toFixed(2)}%
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-600">
            {arb.taxRate > 0 ? `after ${(arb.taxRate * 100).toFixed(0)}% tax` : 'profit'}
          </div>
          {arb.taxRate > 0 && (
            <div className="text-[10px] text-zinc-700">
              {arb.profitPct.toFixed(2)}% pre-tax
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-zinc-100">
            {arb.home} <span className="text-zinc-500">vs</span> {arb.away}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {arb.league} · {fmtKickoff(arb.kickoff)} · market{' '}
            <span className="text-zinc-400">{arb.market}</span>
          </div>
        </div>

        <div className="text-right">
          <div
            className={`text-sm font-semibold ${
              afterTaxLoss ? 'text-red-400' : 'text-emerald-400'
            }`}
          >
            {afterTaxLoss ? '−' : '+'}
            {fmtMoney(Math.abs(arb.afterTaxGuaranteedProfit))} {currency}
          </div>
          <div className="text-xs text-zinc-500">
            after tax · on {fmtMoney(arb.totalStake)} stake
          </div>
          {arb.taxRate > 0 && (
            <div className="text-[10px] text-zinc-700">
              pre-tax +{fmtMoney(arb.guaranteedProfit)} {currency}
            </div>
          )}
        </div>
      </div>

      {arb.suspicious && (
        <div className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
          ⚠️ Unusually high — likely a mismatched fixture or stale price. Verify teams &amp; odds before staking.
        </div>
      )}

      {afterTaxLoss && (
        <div className="mt-2 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
          ⚠️ Loss after {(arb.taxRate * 100).toFixed(0)}% withholding tax — not worth betting unless tax doesn't apply to this book/outcome.
        </div>
      )}

      {arb.note && (
        <div className="mt-2 rounded-md bg-sky-500/10 px-2.5 py-1.5 text-xs text-sky-300">
          ℹ️ {arb.note}
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {arb.legs.map((leg) => (
          <div key={leg.outcome} className="rounded-lg bg-zinc-800/50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-zinc-400">{leg.outcome}</span>
              <span className="tabular-nums text-sm font-semibold text-zinc-100">
                {leg.odds.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-indigo-400">{BOOK_LABELS[leg.bookmaker] ?? leg.bookmaker}</span>
              <span className="tabular-nums text-zinc-300">stake {fmtMoney(leg.stake)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-600">
          implied {(arb.impliedSum * 100).toFixed(2)}% pre-tax
        </span>
        <button
          onClick={handleLog}
          disabled={logging || logged}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {logged ? '✓ Logged' : logging ? 'Logging…' : 'Log this bet'}
        </button>
      </div>
    </div>
  );
}
