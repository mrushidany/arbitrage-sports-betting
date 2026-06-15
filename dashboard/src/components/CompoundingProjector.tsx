'use client';

import { useState, useMemo } from 'react';
import { fmtMoney } from '@/lib/api';

/**
 * Shows how your bankroll grows if you reinvest profits (compound) vs
 * always betting the same fixed amount (flat staking).
 *
 * Flat:      profit per day = arbs_per_day × avg_pct% × fixed_stake
 * Compound:  bankroll grows each arb → stake grows → profit accelerates
 */
export function CompoundingProjector({ currency = 'TZS' }: { currency?: string }) {
  const [bankroll, setBankroll] = useState(1_000_000);
  const [arbsPerDay, setArbsPerDay] = useState(2);
  const [profitPct, setProfitPct] = useState(1.0);
  const [days, setDays] = useState(30);

  const data = useMemo(() => {
    const rows: { day: number; flat: number; compound: number }[] = [];
    let compoundBankroll = bankroll;
    const dailyFlatProfit = arbsPerDay * (profitPct / 100) * bankroll;

    for (let d = 0; d <= days; d++) {
      rows.push({
        day: d,
        flat: bankroll + d * dailyFlatProfit,
        compound: compoundBankroll,
      });
      // Each day: compound N arbs, each at the current bankroll
      for (let a = 0; a < arbsPerDay; a++) {
        compoundBankroll *= 1 + profitPct / 100;
      }
    }
    return rows;
  }, [bankroll, arbsPerDay, profitPct, days]);

  const final = data[data.length - 1];
  const flatProfit = final.flat - bankroll;
  const compoundProfit = final.compound - bankroll;

  // SVG chart
  const W = 600;
  const H = 180;
  const padL = 10;
  const padR = 10;
  const padT = 10;
  const padB = 24;

  const maxVal = Math.max(final.flat, final.compound);
  const xScale = (d: number) => padL + (d / days) * (W - padL - padR);
  const yScale = (v: number) => padT + (1 - (v - bankroll) / (maxVal - bankroll + 1)) * (H - padT - padB);

  const flatPath = data.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xScale(r.day).toFixed(1)} ${yScale(r.flat).toFixed(1)}`).join(' ');
  const compoundPath = data.map((r, i) => `${i === 0 ? 'M' : 'L'} ${xScale(r.day).toFixed(1)} ${yScale(r.compound).toFixed(1)}`).join(' ');

  // x-axis labels
  const xTicks = Math.min(days, 6);
  const xLabels = Array.from({ length: xTicks + 1 }, (_, i) => Math.round((days * i) / xTicks));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Bankroll growth projector
      </h2>

      {/* Inputs */}
      <div className="mb-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
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
          label="Avg profit / arb (after tax %)"
          value={profitPct}
          min={0.1}
          max={5}
          step={0.1}
          display={`${profitPct.toFixed(1)}%`}
          onChange={setProfitPct}
        />
        <SliderInput
          label="Days"
          value={days}
          min={7}
          max={365}
          step={1}
          display={`${days}d`}
          onChange={setDays}
        />
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} className="mb-3 w-full" preserveAspectRatio="xMidYMid meet">
        <path d={flatPath} fill="none" stroke="rgb(99 102 241 / 0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={compoundPath} fill="none" stroke="rgb(16 185 129)" strokeWidth={2} />
        {xLabels.map((d) => (
          <text key={d} x={xScale(d)} y={H - 6} textAnchor="middle" fontSize={9} fill="rgb(113 113 122)">
            day {d}
          </text>
        ))}
        {/* legend */}
        <line x1={W - 130} y1={14} x2={W - 110} y2={14} stroke="rgb(16 185 129)" strokeWidth={2} />
        <text x={W - 106} y={17} fontSize={9} fill="rgb(52 211 153)">Compounding</text>
        <line x1={W - 130} y1={26} x2={W - 110} y2={26} stroke="rgb(99 102 241 / 0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
        <text x={W - 106} y={29} fontSize={9} fill="rgb(129 140 248)">Flat staking</text>
      </svg>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <ResultCard label="Final bankroll (flat)" value={`${fmtMoney(Math.round(final.flat))} ${currency}`} tone="text-indigo-300" />
        <ResultCard label="Profit (flat)" value={`+${fmtMoney(Math.round(flatProfit))} ${currency}`} tone="text-indigo-300" />
        <ResultCard label="Final bankroll (compound)" value={`${fmtMoney(Math.round(final.compound))} ${currency}`} tone="text-emerald-400" />
        <ResultCard label="Profit (compound)" value={`+${fmtMoney(Math.round(compoundProfit))} ${currency}`} tone="text-emerald-400" />
      </div>

      <p className="mt-2 text-[10px] text-zinc-600">
        Compound: every arb reinvests the whole bankroll (stake grows with profits). Flat: same fixed stake every arb. Assumes {arbsPerDay} arb{arbsPerDay > 1 ? 's' : ''}/day at {profitPct.toFixed(1)}% each after tax — actual arbs vary.
      </p>
    </div>
  );
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
      <div className="mb-1 text-zinc-500">{label}</div>
      <div className="mb-1 font-bold text-zinc-200">{display}</div>
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

function ResultCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 px-3 py-2">
      <div className="text-zinc-500">{label}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}
