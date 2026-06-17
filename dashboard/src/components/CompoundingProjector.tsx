'use client';

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/api';

/**
 * Projected-profit calendar. Visualizes what daily compounding profit looks
 * like laid out as a month grid — each day a green heatmap cell, brighter as
 * the compounding stake (and so the daily profit) grows through the month.
 *
 * Compound model: each day runs `arbsPerDay` arbs at `profitPct` each, so the
 * bankroll multiplies by g = (1 + p/100)^arbsPerDay per day. Profit booked on
 * global day d (counted from the anchor month) is:
 *     bankroll · g^d · (g − 1)
 */
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CompoundingProjector({ currency = 'TZS' }: { currency?: string }) {
  const [bankroll, setBankroll] = useState(1_000_000);
  const [arbsPerDay, setArbsPerDay] = useState(2);
  const [profitPct, setProfitPct] = useState(1.0);
  const [monthOffset, setMonthOffset] = useState(0);

  // The compounding timeline starts on the 1st of the month we mount in.
  const anchor = useMemo(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  }, []);

  const view = useMemo(() => {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadBlanks = (monthStart.getDay() + 6) % 7; // Monday-first offset

    const g = Math.pow(1 + profitPct / 100, arbsPerDay);
    const dayMs = 86_400_000;

    type Cell = { date: number; profit: number; dayIndex: number };
    const cells: Cell[] = [];
    let monthTotal = 0;
    let maxProfit = 0;
    let minProfit = Infinity;

    for (let d = 1; d <= daysInMonth; d++) {
      const dayIndex = Math.round((new Date(year, month, d).getTime() - anchor.getTime()) / dayMs);
      // Before the timeline starts there is no projection.
      const profit = dayIndex >= 0 ? bankroll * Math.pow(g, dayIndex) * (g - 1) : 0;
      cells.push({ date: d, profit, dayIndex });
      if (dayIndex >= 0) {
        monthTotal += profit;
        if (profit > maxProfit) maxProfit = profit;
        if (profit < minProfit) minProfit = profit;
      }
    }
    const range = maxProfit - minProfit;
    return { year, month, daysInMonth, leadBlanks, cells, monthTotal, maxProfit, minProfit, range };
  }, [anchor, monthOffset, bankroll, arbsPerDay, profitPct]);

  const trailing = (7 - ((view.leadBlanks + view.daysInMonth) % 7)) % 7;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
      {/* Month header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            className="rounded-md px-1.5 py-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="min-w-[7.5rem] text-center text-lg font-semibold text-zinc-100">
            {MONTHS[view.month]} {view.year}
          </span>
          <button
            onClick={() => setMonthOffset((m) => m + 1)}
            className="rounded-md px-1.5 py-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold tabular-nums text-emerald-400">
            +{fmtMoney(Math.round(view.monthTotal))}
          </span>
          <span className="ml-1.5 text-sm font-medium text-zinc-500">{currency} profit</span>
        </div>
      </div>

      {/* Weekday row */}
      <div className="mb-1.5 grid grid-cols-7 gap-1.5 sm:gap-2">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-xs font-medium text-zinc-500">
            {w}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: view.leadBlanks }).map((_, i) => (
          <div key={`lead-${i}`} />
        ))}

        {view.cells.map((cell) => {
          const active = cell.dayIndex >= 0;
          const t = view.range > 0 ? (cell.profit - view.minProfit) / view.range : 1;
          return (
            <div
              key={cell.date}
              title={active ? `${MONTHS[view.month]} ${cell.date}: +${fmtMoney(Math.round(cell.profit))} ${currency}` : undefined}
              className={`flex aspect-square flex-col justify-between rounded-lg p-1.5 sm:p-2 ${
                active ? 'text-white' : 'border border-zinc-800/60 text-zinc-700'
              }`}
              style={active ? { backgroundColor: heatColor(t) } : undefined}
            >
              <span className={`text-xs font-semibold leading-none sm:text-sm ${active ? 'text-white/90' : ''}`}>
                {cell.date}
              </span>
              {active && (
                <span className="text-xs font-bold leading-none tabular-nums sm:text-sm">
                  {fmtCompact(cell.profit)}
                </span>
              )}
            </div>
          );
        })}

        {Array.from({ length: trailing }).map((_, i) => (
          <div
            key={`trail-${i}`}
            className="flex aspect-square items-start rounded-lg p-1.5 text-xs font-semibold text-zinc-700 sm:p-2 sm:text-sm"
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 text-xs sm:grid-cols-3">
        <SliderInput
          label="Starting bankroll"
          value={bankroll}
          min={100_000}
          max={10_000_000}
          step={100_000}
          display={`${fmtMoney(bankroll)} ${currency}`}
          onChange={setBankroll}
        />
        <SliderInput
          label="Arbs per day"
          value={arbsPerDay}
          min={1}
          max={10}
          step={1}
          display={String(arbsPerDay)}
          onChange={setArbsPerDay}
        />
        <SliderInput
          label="Avg profit / arb (after tax)"
          value={profitPct}
          min={0.1}
          max={5}
          step={0.1}
          display={`${profitPct.toFixed(1)}%`}
          onChange={setProfitPct}
        />
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
        Each day reinvests the whole bankroll across {arbsPerDay} arb{arbsPerDay > 1 ? 's' : ''} at{' '}
        {profitPct.toFixed(1)}% after tax, so daily profit compounds and cells brighten through the month.
        Navigate months to see the curve keep accelerating — real arb frequency varies day to day.
      </p>
    </div>
  );
}

/** Heatmap green: muted forest → bright grass as intensity rises. */
function heatColor(t: number): string {
  const lo = [40, 92, 54];
  const hi = [92, 170, 78];
  const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * Math.max(0, Math.min(1, t))));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** Short money label for calendar cells, e.g. 1.2M, 850K, 240. */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function SliderInput({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-0.5 text-zinc-500">{label}</div>
      <div className="mb-1.5 font-bold tabular-nums text-zinc-200">{display}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  );
}
