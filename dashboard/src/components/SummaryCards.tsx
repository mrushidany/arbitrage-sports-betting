'use client';

import { BetsSummary, fmtMoney } from '@/lib/api';

export function SummaryCards({ summary }: { summary: BetsSummary | null }) {
  const pnl = summary?.realizedPnl ?? 0;
  const cards = [
    {
      label: 'Realized P&L',
      value: summary ? `${pnl >= 0 ? '+' : ''}${fmtMoney(pnl)} ${summary.currency}` : '—',
      tone: pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-zinc-200',
    },
    {
      label: 'ROI (settled)',
      value: summary ? `${summary.roiPct >= 0 ? '+' : ''}${summary.roiPct.toFixed(2)}%` : '—',
      tone: (summary?.roiPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
    },
    {
      label: 'Open bets',
      value: summary ? String(summary.openCount) : '—',
      sub: summary ? `${fmtMoney(summary.stakedOutstanding)} staked` : undefined,
      tone: 'text-zinc-200',
    },
    {
      label: 'Settled bets',
      value: summary ? String(summary.settledCount) : '—',
      sub: summary ? `${fmtMoney(summary.settledTurnover)} turnover` : undefined,
      tone: 'text-zinc-200',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">{card.label}</div>
          <div className={`mt-1 text-xl font-bold tabular-nums ${card.tone}`}>{card.value}</div>
          {card.sub && <div className="text-xs text-zinc-600">{card.sub}</div>}
        </div>
      ))}
    </div>
  );
}
