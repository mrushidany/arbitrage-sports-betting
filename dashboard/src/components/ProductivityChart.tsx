'use client';

import { StatPoint } from '@/lib/api';

/**
 * Productivity trend: the lower the "tightest implied %" line dips toward the
 * dashed 100% arb line, the closer the books are to a surebet. Dips below
 * 100% (green zone) are actual arbs. Green dots mark scans that found arbs.
 */
export function ProductivityChart({
  points,
  hours,
  onHoursChange,
}: {
  points: StatPoint[];
  hours: number;
  onHoursChange: (h: number) => void;
}) {
  const W = 800;
  const H = 240;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 28;

  const withImplied = points.filter((p) => p.tightestImplied != null);
  const totalArbs = points.reduce((s, p) => s + p.arbCount, 0);
  const latest = points[points.length - 1];
  const currentTightest = [...points].reverse().find((p) => p.tightestImplied != null)?.tightestImplied ?? null;

  const ranges = [
    { label: '6h', h: 6 },
    { label: '24h', h: 24 },
    { label: '3d', h: 72 },
  ];

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
        <Chart points={withImplied} W={W} H={H} padL={padL} padR={padR} padT={padT} padB={padB} arbPoints={points.filter((p) => p.arbCount > 0)} />
      )}
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
  W,
  H,
  padL,
  padR,
  padT,
  padB,
}: {
  points: StatPoint[];
  arbPoints: StatPoint[];
  W: number;
  H: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
}) {
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

  // y gridlines at whole percents
  const gridVals: number[] = [];
  for (let v = Math.ceil(yMin); v <= Math.floor(yMax); v++) gridVals.push(v);

  // x labels: a few evenly spaced timestamps
  const ticks = 4;
  const xLabels = Array.from({ length: ticks + 1 }, (_, i) => t0 + (tSpan * i) / ticks);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* arb zone (below 100%) */}
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
      {/* 100% arb threshold */}
      <line x1={padL} y1={y100} x2={W - padR} y2={y100} stroke="rgb(16 185 129 / 0.7)" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={W - padR} y={y100 - 4} textAnchor="end" fontSize={10} fill="rgb(52 211 153)">100% — arb line</text>
      {/* x labels */}
      {xLabels.map((t, i) => (
        <text key={i} x={x(t)} y={H - 8} textAnchor="middle" fontSize={10} fill="rgb(113 113 122)">
          {new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </text>
      ))}
      {/* the trend line */}
      <path d={line} fill="none" stroke="rgb(129 140 248)" strokeWidth={2} strokeLinejoin="round" />
      {/* arb markers */}
      {arbPoints.map((p, i) => (
        <circle key={i} cx={x(p.t)} cy={y(p.tightestImplied ?? 100)} r={4} fill="rgb(16 185 129)" stroke="white" strokeWidth={1} />
      ))}
    </svg>
  );
}
