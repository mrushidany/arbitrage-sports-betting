'use client';

import { useState } from 'react';
import { Bet, BOOK_LABELS, fmtKickoff, fmtMoney } from '@/lib/api';

export function BetsPanel({
  bets,
  onSettle,
  onVoid,
  onDelete,
}: {
  bets: Bet[];
  onSettle: (id: string, outcome: string) => Promise<void>;
  onVoid: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (bets.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center text-sm text-zinc-500">
        No bets logged yet. Hit “Log this bet” on an arb to track it here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {bets.map((bet) => (
        <BetRow key={bet.id} bet={bet} onSettle={onSettle} onVoid={onVoid} onDelete={onDelete} />
      ))}
    </div>
  );
}

function BetRow({
  bet,
  onSettle,
  onVoid,
  onDelete,
}: {
  bet: Bet;
  onSettle: (id: string, outcome: string) => Promise<void>;
  onVoid: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const statusTone =
    bet.status === 'OPEN'
      ? 'bg-indigo-500/15 text-indigo-400'
      : bet.status === 'SETTLED'
        ? (bet.realizedPnl ?? 0) >= 0
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-red-500/15 text-red-400'
        : 'bg-zinc-700/40 text-zinc-400';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusTone}`}>{bet.status}</span>
        <span className="font-medium text-zinc-100">
          {bet.home} <span className="text-zinc-600">vs</span> {bet.away}
        </span>
        <span className="text-xs text-zinc-500">
          {bet.market} · {fmtKickoff(bet.kickoff)}
        </span>
        <span className="ml-auto text-xs text-zinc-500">
          {fmtMoney(bet.totalStake)} staked · target {bet.profitPct.toFixed(2)}%
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {bet.legs.map((leg) => (
          <span
            key={leg.id}
            className={`rounded-md px-2 py-1 text-xs ${
              bet.winningOutcome === leg.outcome
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-800/60 text-zinc-400'
            }`}
          >
            {leg.outcome} @ {leg.odds.toFixed(2)} · {BOOK_LABELS[leg.bookmaker] ?? leg.bookmaker} · {fmtMoney(leg.stake)}
          </span>
        ))}
      </div>

      {bet.status === 'OPEN' ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">Settle — which outcome won?</span>
          {bet.legs.map((leg) => (
            <button
              key={leg.id}
              disabled={busy}
              onClick={run(() => onSettle(bet.id, leg.outcome))}
              className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 transition hover:bg-emerald-600 hover:text-white disabled:opacity-40"
            >
              {leg.outcome}
            </button>
          ))}
          <button
            disabled={busy}
            onClick={run(() => onVoid(bet.id))}
            className="rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-zinc-700 disabled:opacity-40"
          >
            Void
          </button>
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm">
            {bet.status === 'SETTLED' ? (
              <span className={(bet.realizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {(bet.realizedPnl ?? 0) >= 0 ? '+' : ''}
                {fmtMoney(bet.realizedPnl ?? 0)} realized {bet.winningOutcome ? `(${bet.winningOutcome} won)` : ''}
              </span>
            ) : (
              <span className="text-zinc-500">Voided — no P&amp;L</span>
            )}
          </span>
          <button
            disabled={busy}
            onClick={run(() => onDelete(bet.id))}
            className="text-xs text-zinc-600 transition hover:text-red-400 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
