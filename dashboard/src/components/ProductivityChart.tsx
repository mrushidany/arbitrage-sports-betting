'use client';

import { useState } from 'react';
import { api, HistoricalArb, StatPoint, BOOK_LABELS, fmtMoney, fmtKickoff } from '@/lib/api';

export function ProductivityChart({
  points,
  hours,
  onHoursChange,
}: {
  points: StatPoint[];
  hours: number;
  onHoursChange: (h: number) => void;
}) {
  const [selectedPoint, setSelectedPoint] = useState<StatPoint | null>(null);
  const [selectedArbs, setSelectedArbs] = useState<HistoricalArb[]>([]);
  const [loadingArbs, setLoadingArbs] = useState(false);

  const withImplied = points.filter((p) => p.tightestImplied != null);
  const totalArbs = points.reduce((s, p) => s + p.arbCount, 0);
  const latest = points[points.length - 1];
  const currentTightest = [...points].reverse().find((p) => p.tightestImplied != null)?.tightestImplied ?? null;

  const ranges = [
    { label: '6h', h: 6 },
    { label: '24h', h: 24 },
    { label: '3d', h: 72 },
  ];

  async function handleDotClick(p: StatPoint) {
    if (selectedPoint?.t === p.t) {
      setSelectedPoint(null);
      setSelectedArbs([]);
      return;
    }
    setSelectedPoint(p);
    setSelectedArbs([]);
    if (p.arbCount > 0) {
      setLoadingArbs(true);
      try {
        const { arbs } = await api.arbsAround(p.t);
        setSelectedArbs(arbs);
      } finally {
        setLoadingArbs(false);
      }
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Productivity trend</h2>
        <div className="ml-auto flex gap-1">
          {ranges.map((r) => (
            <button
              key={r.h}
              onClick={() => onHoursChange(r.h)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition ${
                hours === r.h ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-4 text-xs">
        <Metric label="Closest now" value={currentTightest != null ? `${currentTightest.toFixed(2)}%` : '—'} tone={impliedTone(currentTightest)} />
        <Metric label={`Arbs (last ${hours}h)`} value={String(totalArbs)} tone={totalArbs > 0 ? 'text-emerald-400' : 'text-zinc-300'} />
        <Metric label="Matched now" value={latest ? String(latest.matchedFixtures) : '—'} tone="text-zinc-300" />
        <Metric label="Scans recorded" value={String(points.length)} tone="text-zinc-300" />
      </div>

      {withImplied.length < 2 ? (
        <div className="flex h-[160px] items-center justify-center rounded-lg border border-dashed border-zinc-800 text-center text-xs text-zinc-500">
          Collecting data… leave the engine running (it records one point per scan,
          ~every {60}s). The trend appears once there are a couple of points.
        </div>
      ) : (
        <Chart
          points={withImplied}
          arbPoints={points.filter((p) => p.arbCount > 0)}
          selectedPoint={selectedPoint}
          onDotClick={handleDotClick}
          W={800} H={240} padL={46} padR={14} padT={16} padB={28}
        />
      )}

      {selectedPoint && (
        <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium text-zinc-300">
              Scan at {new Date(selectedPoint.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {' · '}
              {selectedPoint.matchedFixtures} fixtures · {selectedPoint.tradableMarkets} markets
              {selectedPoint.tightestImplied != null && (
                <span className={impliedTone(selectedPoint.tightestImplied)}>
                  {' · '}tightest {selectedPoint.tightestImplied.toFixed(2)}%
                </span>
              )}
            </span>
            <button
              onClick={() => { setSelectedPoint(null); setSelectedArbs([]); }}
              className="ml-4 text-zinc-500 hover:text-zinc-300"
            >
              ✕ close
            </button>
          </div>

          {selectedPoint.arbCount === 0 ? (
            <p className="text-zinc-500">No arb detected in this scan — {selectedPoint.under101} market(s) were under 101%.</p>
          ) : loadingArbs ? (
            <p className="text-zinc-500">Loading arb details…</p>
          ) : selectedArbs.length === 0 ? (
            <p className="text-zinc-500">
              {selectedPoint.arbCount} arb(s) detected in this scan window — details not in log
              (may have been filtered as duplicates or engine restarted).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {selectedArbs.map((arb, i) => (
                <ArbCard key={i} arb={arb} />
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-zinc-600">
        Click any dot on the chart to inspect that scan. Green dots = arb detected — click to see details.
      </p>
    </div>
  );
}

function ArbCard({ arb }: { arb: HistoricalArb }) {
  // Old JSONL records pre-date the tax fields — fall back to pre-tax figures.
  const taxRate = arb.taxRate ?? 0;
  const afterTaxProfitPct = arb.afterTaxProfitPct ?? arb.profitPct;
  const afterTaxGuaranteedProfit = arb.afterTaxGuaranteedProfit ?? arb.guaranteedProfit;
  const afterTaxLoss = taxRate > 0 && afterTaxProfitPct <= 0;
  return (
    <div className={`rounded border p-2 ${arb.suspicious ? 'border-amber-700 bg-amber-900/20' : afterTaxLoss ? 'border-red-800 bg-red-900/10' : 'border-zinc-700 bg-zinc-900/50'}`}>
      <div className="mb-1 flex flex-wrap items-baseline gap-2">
        {arb.suspicious && <span className="text-amber-400">⚠ suspicious</span>}
        <span className={`font-bold ${afterTaxLoss ? 'text-red-400' : 'text-emerald-400'}`}>
          {afterTaxProfitPct.toFixed(2)}% {taxRate > 0 ? 'after tax' : 'profit'}
        </span>
        {taxRate > 0 && (
          <span className="text-zinc-600">({arb.profitPct.toFixed(2)}% pre-tax)</span>
        )}
        <span className="text-zinc-300">{arb.event.home} vs {arb.event.away}</span>
        <span className="text-zinc-500">{arb.event.league}</span>
        <span className="ml-auto text-zinc-500">kickoff {fmtKickoff(arb.event.startTime)}</span>
      </div>
      {afterTaxLoss && (
        <div className="mb-1 text-xs text-red-400">
          ⚠ Loss after {(taxRate * 100).toFixed(0)}% withholding tax
        </div>
      )}
      <div className="mb-1 text-zinc-400">
        Market: <span className="text-zinc-200">{arb.market}</span>
        <span className="ml-2 text-zinc-600">(implied {(arb.impliedSum * 100).toFixed(2)}%)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {arb.legs.map((leg, i) => (
          <div key={i} className="rounded bg-zinc-800 px-2 py-1">
            <span className="font-medium text-zinc-200">{leg.outcome}</span>
            <span className="mx-1 text-zinc-500">@</span>
            <span className="text-indigo-300">{leg.odds.toFixed(2)}</span>
            <span className="mx-1 text-zinc-500">on</span>
            <span className="text-zinc-300">{BOOK_LABELS[leg.bookmaker] ?? leg.bookmaker}</span>
            <span className="mx-1 text-zinc-500">→</span>
            <span className="text-zinc-200">{fmtMoney(leg.stake)} TZS</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-zinc-400">
        Total <span className="text-zinc-200">{fmtMoney(arb.totalStake)} TZS</span>
        {' → '}{taxRate > 0 ? 'after-tax ' : ''}
        <span className={`font-bold ${afterTaxLoss ? 'text-red-400' : 'text-emerald-400'}`}>
          {afterTaxLoss ? '−' : ''}{fmtMoney(Math.abs(Math.round(afterTaxGuaranteedProfit)))} TZS
        </span>
        {arb.note && <span className="ml-2 text-zinc-500">· {arb.note}</span>}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <div className="text-zinc-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function impliedTone(v: number | null): string {
  if (v == null) return 'text-zinc-300';
  if (v < 100) return 'text-emerald-400';
  if (v < 101) return 'text-amber-400';
  return 'text-zinc-300';
}

function Chart({
  points,
  arbPoints,
  selectedPoint,
  onDotClick,
  W, H, padL, padR, padT, padB,
}: {
  points: StatPoint[];
  arbPoints: StatPoint[];
  selectedPoint: StatPoint | null;
  onDotClick: (p: StatPoint) => void;
  W: number; H: number; padL: number; padR: number; padT: number; padB: number;
}) {
  const [hoveredT, setHoveredT] = useState<number | null>(null);

  const vals = points.map((p) => p.tightestImplied as number);
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const tSpan = Math.max(1, t1 - t0);

  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const yMin = Math.min(99.7, dataMin - 0.2);
  const yMax = Math.max(103, dataMax + 0.2);

  const x = (t: number) => padL + ((t - t0) / tSpan) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.tightestImplied as number).toFixed(1)}`).join(' ');
  const y100 = y(100);
  const arbZoneTop = Math.max(padT, y100);

  const gridVals: number[] = [];
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v++) gridVals.push(v);

  const ticks = 4;
  const xLabels = Array.from({ length: ticks + 1 }, (_, i) => t0 + (tSpan * i) / ticks);

  // All points as clickable dots (subtle), plus arb points (green)
  const arbSet = new Set(arbPoints.map((p) => p.t));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* arb zone */}
      {y100 < H - padB && (
        <rect x={padL} y={arbZoneTop} width={W - padL - padR} height={H - padB - arbZoneTop} fill="rgb(16 185 129 / 0.08)" />
      )}
      {/* gridlines */}
      {gridVals.map((v) => (
        <g key={v}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="rgb(63 63 70 / 0.4)" strokeWidth={1} />
          <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="rgb(113 113 122)">{v}%</text>
        </g>
      ))}
      {/* 100% threshold */}
      <line x1={padL} y1={y100} x2={W - padR} y2={y100} stroke="rgb(16 185 129 / 0.7)" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={W - padR} y={y100 - 4} textAnchor="end" fontSize={10} fill="rgb(52 211 153)">100% — arb line</text>
      {/* x labels */}
      {xLabels.map((t, i) => (
        <text key={i} x={x(t)} y={H - 8} textAnchor="middle" fontSize={10} fill="rgb(113 113 122)">
          {new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </text>
      ))}
      {/* trend line */}
      <path d={line} fill="none" stroke="rgb(129 140 248)" strokeWidth={2} strokeLinejoin="round" />

      {/* All scan dots — clickable, subtle by default */}
      {points.map((p) => {
        const isArb = arbSet.has(p.t);
        const isSelected = selectedPoint?.t === p.t;
        const isHovered = hoveredT === p.t;
        const cx = x(p.t);
        const cy = y(p.tightestImplied as number);

        return (
          <g
            key={p.t}
            onClick={() => onDotClick(p)}
            onMouseEnter={() => setHoveredT(p.t)}
            onMouseLeave={() => setHoveredT(null)}
            style={{ cursor: 'pointer' }}
          >
            {/* larger hit area */}
            <circle cx={cx} cy={cy} r={10} fill="transparent" />
            {/* selection ring */}
            {isSelected && (
              <circle cx={cx} cy={cy} r={isArb ? 9 : 7} fill="none" stroke="white" strokeWidth={1.5} opacity={0.6} />
            )}
            {/* the dot itself */}
            <circle
              cx={cx}
              cy={cy}
              r={isSelected ? (isArb ? 6 : 5) : isHovered ? (isArb ? 6 : 4) : (isArb ? 4 : 2.5)}
              fill={isArb ? 'rgb(16 185 129)' : 'rgb(99 102 241 / 0.5)'}
              stroke={isArb ? 'white' : 'none'}
              strokeWidth={isArb ? 1 : 0}
              opacity={isArb ? 1 : (isHovered || isSelected ? 0.9 : 0.4)}
            />
            {/* hover tooltip */}
            {isHovered && !isSelected && (
              <g>
                <rect
                  x={Math.min(cx - 44, W - padR - 88)}
                  y={cy - 32}
                  width={88}
                  height={22}
                  rx={4}
                  fill="rgb(24 24 27)"
                  stroke="rgb(63 63 70)"
                  strokeWidth={1}
                />
                <text
                  x={Math.min(cx, W - padR - 44)}
                  y={cy - 17}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isArb ? 'rgb(52 211 153)' : 'rgb(161 161 170)'}
                >
                  {isArb ? `✓ ${p.arbCount} arb${p.arbCount > 1 ? 's' : ''} — click` : `${(p.tightestImplied as number).toFixed(2)}% — click`}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
