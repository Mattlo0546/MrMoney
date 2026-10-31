'use client';
import { useState } from 'react';
import { formatMoney, type ProjectionPoint, type Scenario } from '@/lib/engine';
import type { ArgonDecision } from '@/lib/finance/products';
import { BrandLogo } from './BrandLogos';

interface ProjectionDiagramsProps {
  months: number;
  scenarios: Partial<Record<Scenario, ProjectionPoint[]>>;
  decision: ArgonDecision;
}

const SCENARIO_META: { key: Scenario; label: string; stroke: string; badgeClass: string }[] = [
  { key: 'low', label: 'Low', stroke: '#94A3B8', badgeClass: 'bg-surface-2 text-muted border-line' },
  { key: 'base', label: 'Base', stroke: '#10B981', badgeClass: 'bg-pos-soft text-pos border-pos/30' },
  { key: 'high', label: 'High', stroke: '#38BDF8', badgeClass: 'bg-accent-soft text-accent border-accent/30' },
];

function fmtShortPounds(pence: number): string {
  const pounds = Math.round(pence / 100);
  if (Math.abs(pounds) >= 10_000) return `£${(pounds / 1000).toFixed(1)}k`;
  return `£${pounds.toLocaleString('en-GB')}`;
}

export function ProjectionDiagrams({ months, scenarios, decision }: ProjectionDiagramsProps) {
  const basePts = scenarios.base ?? [];
  const lowPts = scenarios.low ?? basePts;
  const highPts = scenarios.high ?? basePts;

  const [inspectMonth, setInspectMonth] = useState<number | null>(null);
  const activeMonth = inspectMonth !== null && inspectMonth <= months ? inspectMonth : months;

  if (basePts.length === 0) return null;

  const allTotals = [
    ...basePts.map((p) => p.total.pence),
    ...lowPts.map((p) => p.total.pence),
    ...highPts.map((p) => p.total.pence),
  ];
  const minPence = Math.max(0, Math.min(...allTotals) * 0.88);
  const maxPence = Math.max(minPence + 10_000, Math.max(...allTotals) * 1.06);

  // SVG coordinate system
  const W = 680;
  const H = 260;
  const PAD_L = 62;
  const PAD_R = 20;
  const PAD_T = 18;
  const PAD_B = 34;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const xOf = (m: number) => PAD_L + (months > 0 ? (m / months) * plotW : 0);
  const yOf = (pence: number) => {
    const ratio = (pence - minPence) / Math.max(1, maxPence - minPence);
    return PAD_T + plotH - Math.max(0, Math.min(1, ratio)) * plotH;
  };

  const buildPath = (pts: ProjectionPoint[], pick: (p: ProjectionPoint) => number): string =>
    pts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.month).toFixed(1)},${yOf(pick(p)).toFixed(1)}`)
      .join(' ');

  const basePath = buildPath(basePts, (p) => p.total.pence);
  const lowPath = buildPath(lowPts, (p) => p.total.pence);
  const highPath = buildPath(highPts, (p) => p.total.pence);
  const contributedPath = buildPath(basePts, (p) => p.contributed.pence);
  const savingsPath = buildPath(basePts, (p) => p.savings.pence);

  // Confidence band polygon between Low and High
  const bandPolygon =
    highPts.length === lowPts.length && highPts.length > 1
      ? [
          ...highPts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.month).toFixed(1)},${yOf(p.total.pence).toFixed(1)}`),
          ...[...lowPts].reverse().map((p) => `L${xOf(p.month).toFixed(1)},${yOf(p.total.pence).toFixed(1)}`),
          'Z',
        ].join(' ')
      : '';

  const baseArea =
    basePts.length > 1
      ? `${basePath} L${xOf(months).toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${xOf(0).toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`
      : '';

  // Y-axis ticks (4 steps)
  const yTicks = [0, 0.33, 0.67, 1].map((t) => {
    const pence = Math.round(minPence + t * (maxPence - minPence));
    return { pence, y: yOf(pence) };
  });

  // X-axis ticks
  const xStep = months <= 6 ? 1 : months <= 12 ? 2 : 4;
  const xTicks: number[] = [];
  for (let m = 0; m <= months; m += xStep) xTicks.push(m);
  if (xTicks[xTicks.length - 1] !== months) xTicks.push(months);

  const ptBase = basePts[activeMonth] ?? basePts[basePts.length - 1];
  const ptLow = lowPts[activeMonth] ?? lowPts[lowPts.length - 1];
  const ptHigh = highPts[activeMonth] ?? highPts[highPts.length - 1];

  // Ending points for stacked composition diagram
  const endLow = lowPts[lowPts.length - 1] ?? ptBase;
  const endBase = basePts[basePts.length - 1] ?? ptBase;
  const endHigh = highPts[highPts.length - 1] ?? ptBase;
  const maxScenarioEnd = Math.max(1, endHigh.total.pence, endBase.total.pence, endLow.total.pence);

  // Combined product slices for Lump-Sum Delivery Diagram
  const productSlices = [
    ...decision.bankAllocations.map((b) => ({
      id: b.product.id,
      logoId: b.product.logoId,
      label: b.product.provider,
      sub: b.product.name,
      kind: 'savings' as const,
      lumpPounds: b.lumpSumPounds,
      monthlyPounds: b.monthlyPounds,
      rateLabel: `${b.product.aerBase.toFixed(2)}% AER`,
    })),
    ...decision.stockAllocations.map((s) => ({
      id: s.product.id,
      logoId: s.product.logoId,
      label: `${s.product.provider} (${s.product.ticker})`,
      sub: s.product.name,
      kind: 'investments' as const,
      lumpPounds: s.lumpSumPounds,
      monthlyPounds: s.monthlyPounds,
      rateLabel: `${s.product.returnBase.toFixed(1)}% Base`,
    })),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12" data-testid="projection-diagrams">
      {/* Diagram 1: Multi-Scenario Wealth Trajectory Chart */}
      <div
        data-testid="projection-trajectory-chart"
        className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-4 shadow-soft lg:p-6 xl:col-span-7"
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Wealth Trajectory Diagram ({months} months)
              </p>
              <h3 className="mt-0.5 font-display text-lg font-extrabold tracking-tight">
                Low, Base & High Growth Curves
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-pos/30 bg-pos-soft px-2.5 py-1 text-pos">
                <span className="h-2 w-2 rounded-full bg-pos" /> Base ({decision.rates.sBase.toFixed(1)}% / {decision.rates.iBase.toFixed(1)}%)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" /> High
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-muted">
                <span className="h-2 w-2 rounded-full bg-slate-400" /> Contributed
              </span>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="mt-3 w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="h-auto w-full select-none"
              role="img"
              aria-label={`Projected wealth chart over ${months} months`}
            >
              <defs>
                <linearGradient id="projBaseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="projBandGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.06" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines & Y labels */}
              {yTicks.map((t, idx) => (
                <g key={idx}>
                  <line
                    x1={PAD_L}
                    y1={t.y}
                    x2={W - PAD_R}
                    y2={t.y}
                    stroke="currentColor"
                    strokeOpacity="0.1"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={PAD_L - 8}
                    y={t.y + 4}
                    textAnchor="end"
                    className="fill-muted text-[11px] font-semibold"
                  >
                    {fmtShortPounds(t.pence)}
                  </text>
                </g>
              ))}

              {/* X-axis month labels */}
              {xTicks.map((m) => (
                <g key={m}>
                  <line
                    x1={xOf(m)}
                    y1={PAD_T + plotH}
                    x2={xOf(m)}
                    y2={PAD_T + plotH + 5}
                    stroke="currentColor"
                    strokeOpacity="0.2"
                  />
                  <text
                    x={xOf(m)}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted text-[11px] font-semibold"
                  >
                    {m === 0 ? 'Now' : `M${m}`}
                  </text>
                </g>
              ))}

              {/* Shaded confidence fan between Low and High */}
              {bandPolygon && <path d={bandPolygon} fill="url(#projBandGrad)" />}

              {/* Shaded area under Base trajectory */}
              {baseArea && <path d={baseArea} fill="url(#projBaseGrad)" />}

              {/* Contributed baseline (dotted) */}
              <path
                d={contributedPath}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="1.75"
                strokeDasharray="4 4"
              />

              {/* Savings-only trajectory (subtle teal) */}
              <path
                d={savingsPath}
                fill="none"
                stroke="#14B8A6"
                strokeWidth="1.6"
                strokeOpacity="0.65"
              />

              {/* Low scenario curve */}
              <path
                d={lowPath}
                fill="none"
                stroke="#94A3B8"
                strokeWidth="2"
              />

              {/* High scenario curve */}
              <path
                d={highPath}
                fill="none"
                stroke="#38BDF8"
                strokeWidth="2.2"
                strokeDasharray="6 3"
              />

              {/* Base scenario primary curve */}
              <path
                d={basePath}
                fill="none"
                stroke="#10B981"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Active inspected month vertical marker & dots */}
              {ptBase && (
                <g>
                  <line
                    x1={xOf(activeMonth)}
                    y1={PAD_T}
                    x2={xOf(activeMonth)}
                    y2={PAD_T + plotH}
                    stroke="#10B981"
                    strokeOpacity="0.45"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  {ptHigh && (
                    <circle
                      cx={xOf(activeMonth)}
                      cy={yOf(ptHigh.total.pence)}
                      r="4.5"
                      fill="#38BDF8"
                      stroke="#0F172A"
                      strokeWidth="1.5"
                    />
                  )}
                  <circle
                    cx={xOf(activeMonth)}
                    cy={yOf(ptBase.total.pence)}
                    r="5.5"
                    fill="#10B981"
                    stroke="#0F172A"
                    strokeWidth="2"
                  />
                  {ptLow && (
                    <circle
                      cx={xOf(activeMonth)}
                      cy={yOf(ptLow.total.pence)}
                      r="4.5"
                      fill="#94A3B8"
                      stroke="#0F172A"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              )}

              {/* Invisible hover columns for month scrubbing */}
              {basePts.map((p) => {
                const colW = plotW / Math.max(1, months + 1);
                return (
                  <rect
                    key={p.month}
                    x={xOf(p.month) - colW / 2}
                    y={PAD_T}
                    width={colW}
                    height={plotH}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setInspectMonth(p.month)}
                    onClick={() => setInspectMonth(p.month)}
                  />
                );
              })}
            </svg>
          </div>
        </div>

        {/* Inspected Month Readout Bar */}
        {ptBase && (
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface-2/70 p-3 text-xs sm:grid-cols-4">
            <div>
              <span className="font-bold text-muted">
                {activeMonth === 0 ? 'Start (Month 0)' : `Month ${activeMonth} Base`}
              </span>
              <p className="mt-0.5 font-mono text-sm font-extrabold text-pos tabular-nums">
                {formatMoney(ptBase.total.pence)}
              </p>
            </div>
            <div>
              <span className="font-bold text-muted">Savings / Invested</span>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                {formatMoney(ptBase.savings.pence)} / {formatMoney(ptBase.investments.pence)}
              </p>
            </div>
            <div>
              <span className="font-bold text-muted">Compound Growth</span>
              <p className="mt-0.5 font-mono text-sm font-bold text-pos tabular-nums">
                +{formatMoney(ptBase.growth.pence)}
              </p>
            </div>
            <div>
              <span className="font-bold text-muted">Low — High Range</span>
              <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">
                {fmtShortPounds(ptLow?.total.pence ?? ptBase.total.pence)} – {fmtShortPounds(ptHigh?.total.pence ?? ptBase.total.pence)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Diagram 2: Argon Lump-Sum Product Delivery & Scenario Breakdown */}
      <div
        data-testid="projection-allocation-diagram"
        className="flex flex-col justify-between gap-4 rounded-3xl border border-line bg-surface p-4 shadow-soft lg:p-6 xl:col-span-5"
      >
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Argon Lump-Sum Delivery Diagram
          </p>
          <h3 className="mt-0.5 font-display text-lg font-extrabold tracking-tight">
            £{decision.lumpSumPounds.toLocaleString('en-GB')} Split Across Real Products
          </h3>

          {/* Top-level Savings vs Investments Split Bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-pos">
                Bank Savings: £{decision.savingsNowPounds.toLocaleString('en-GB')} ({decision.savingsSharePercent}%)
              </span>
              <span className="text-accent">
                Stock/ETF Investing: £{decision.invNowPounds.toLocaleString('en-GB')} ({decision.investmentsSharePercent}%)
              </span>
            </div>
            <div className="mt-1.5 flex h-4 w-full overflow-hidden rounded-full border border-line bg-surface-2">
              <div
                style={{ width: `${decision.savingsSharePercent}%` }}
                className="bg-pos transition-all duration-300"
                title={`Savings: £${decision.savingsNowPounds}`}
              />
              <div
                style={{ width: `${decision.investmentsSharePercent}%` }}
                className="bg-accent transition-all duration-300"
                title={`Investments: £${decision.invNowPounds}`}
              />
            </div>
          </div>

          {/* Exact Product Delivery Bars with Real-Life Logos */}
          <div className="mt-4 space-y-2.5">
            {productSlices.map((s) => {
              const pctOfLump =
                decision.lumpSumPounds > 0
                  ? Math.round((s.lumpPounds / decision.lumpSumPounds) * 100)
                  : 0;
              return (
                <div
                  key={s.id}
                  className="rounded-2xl border border-line bg-surface-2/50 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <BrandLogo id={s.logoId} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold">{s.label}</p>
                        <p className="truncate text-[11px] text-muted">{s.rateLabel}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-xs font-extrabold tabular-nums">
                      <span>£{s.lumpPounds.toLocaleString('en-GB')}</span>
                      <span className="ml-1.5 text-[11px] font-semibold text-muted">
                        +£{s.monthlyPounds}/mo
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      style={{ width: `${Math.max(4, pctOfLump)}%` }}
                      className={`h-full rounded-full ${s.kind === 'savings' ? 'bg-pos' : 'bg-accent'}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scenario Comparison Horizontal Bar Diagram at Month N */}
        <div className="border-t border-line pt-3">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
            Month {months} Scenario Outcome Comparison
          </p>
          <div className="mt-2 space-y-2">
            {SCENARIO_META.map((sc) => {
              const pt = scenarios[sc.key]?.[months] ?? endBase;
              const widthPct = Math.max(8, Math.round((pt.total.pence / maxScenarioEnd) * 100));
              const contribPct = pt.total.pence > 0 ? Math.min(100, Math.round((pt.contributed.pence / pt.total.pence) * 100)) : 100;
              const growthPct = Math.max(0, 100 - contribPct);
              return (
                <div key={sc.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold">
                      {sc.label} Scenario
                    </span>
                    <span className="font-mono font-extrabold tabular-nums">
                      {formatMoney(pt.total.pence)}{' '}
                      <span className="text-[11px] font-semibold text-pos">
                        ({pt.growth.pence >= 0 ? '+' : ''}{formatMoney(pt.growth.pence)} growth)
                      </span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      style={{ width: `${widthPct}%` }}
                      className="flex h-full overflow-hidden rounded-full"
                    >
                      <div
                        style={{ width: `${contribPct}%` }}
                        className="h-full bg-slate-500/70"
                        title={`Contributed: ${formatMoney(pt.contributed.pence)}`}
                      />
                      <div
                        style={{ width: `${growthPct}%` }}
                        className="h-full bg-pos"
                        title={`Growth: ${formatMoney(pt.growth.pence)}`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
