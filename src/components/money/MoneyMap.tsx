'use client';
/**
 * Animated "money map": the monthly surplus pot on the left flows into buckets on the right. Bars and curves
 * animate whenever the allocation changes, so the user sees their money being reallocated.
 */
import type { Allocation, Bucket, FinanceProfile } from '@/lib/finance/types';
import { formatPence } from '@/lib/finance/allocate';

export type RowKey = Bucket | 'cash';

interface Row { key: RowKey; label: string; pence: number; color: string; }

const COLORS: Record<RowKey, string> = {
  cash: '#94a3b8',
  debt: '#e11d48',
  overdraft: '#f97316',
  emergency_fund: '#059669',
  short_goals: '#0ea5e9',
  lifetime_isa: '#8b5cf6',
  index_fund: '#4f46e5',
  speculative: '#d946ef',
};
const LABELS: Record<RowKey, string> = {
  cash: 'Sitting in cash',
  debt: 'Pay off debt',
  overdraft: 'Clear overdraft',
  emergency_fund: 'Emergency fund',
  short_goals: 'Short-term goals',
  lifetime_isa: 'Lifetime ISA',
  index_fund: 'Index fund (S&S ISA)',
  speculative: 'Crypto / fun money',
};
export const ROW_ORDER: RowKey[] = ['debt', 'overdraft', 'emergency_fund', 'short_goals', 'lifetime_isa', 'index_fund', 'speculative', 'cash'];

/** What the user does today, before any recommendation: monthly investing, the rest sits in cash. */
export function currentRows(profile: FinanceProfile): Row[] {
  const invest = Math.min(profile.monthlyInvestPence, profile.monthlySurplusPence);
  const cash = Math.max(0, profile.monthlySurplusPence - invest);
  return [
    { key: 'index_fund', label: LABELS.index_fund, pence: invest, color: COLORS.index_fund },
    { key: 'cash', label: LABELS.cash, pence: cash, color: COLORS.cash },
  ];
}

export function allocationRows(a: Allocation): Row[] {
  const byBucket = new Map<RowKey, number>();
  for (const l of a.lines) byBucket.set(l.bucket, (byBucket.get(l.bucket) ?? 0) + l.pence);
  const used = a.lines.reduce((s, l) => s + l.pence, 0);
  const cash = Math.max(0, a.monthlySurplusPence - used);
  if (cash > 0) byBucket.set('cash', cash);
  return ROW_ORDER.filter((k) => byBucket.has(k)).map((k) => ({ key: k, label: LABELS[k], pence: byBucket.get(k)!, color: COLORS[k] }));
}

const W = 680;
const ROW_H = 68;
const TOP = 20;
const POT_X = 16;
const POT_W = 176;
const X0 = 300;
const BAR_X1 = W - 16;

export function MoneyMap({ rows, keys, surplusPence, title, animKey }: { rows: Row[]; keys: RowKey[]; surplusPence: number; title: string; animKey: number }) {
  const shown = ROW_ORDER.filter((k) => keys.includes(k));
  const H = TOP + Math.max(shown.length, 2) * ROW_H + 12;
  const potY = H / 2;
  const total = Math.max(1, surplusPence);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: monthly surplus ${formatPence(surplusPence)} split across ${rows.length} buckets`} className="w-full" style={{ maxHeight: H }}>
      <defs>
        <linearGradient id="money-pot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      {/* Pot */}
      <g className="money-pot">
        <rect x={POT_X} y={potY - 52} width={POT_W} height={104} rx={22} fill="url(#money-pot)" />
        <text x={POT_X + 18} y={potY - 22} fill="rgba(255,255,255,.85)" fontSize="12" fontWeight="700">Spare each month</text>
        <text x={POT_X + 18} y={potY + 14} fill="#fff" fontSize="30" fontWeight="800" className="num" fontFamily="inherit">{formatPence(surplusPence)}</text>
        <text x={POT_X + 18} y={potY + 36} fill="rgba(255,255,255,.8)" fontSize="11" fontWeight="600">{title}</text>
      </g>
      {shown.map((key, i) => {
        const row = rows.find((r) => r.key === key);
        const pence = row?.pence ?? 0;
        const share = Math.min(1, pence / total);
        const y = TOP + i * ROW_H;
        const barY = y + 38;
        const endX = X0 - 10;
        const endY = barY + 7;
        const mid = (POT_X + POT_W + endX) / 2;
        const d = `M ${POT_X + POT_W} ${potY} C ${mid} ${potY}, ${mid} ${endY}, ${endX} ${endY}`;
        const color = COLORS[key];
        const active = pence > 0;
        return (
          <g key={key} className={active ? 'money-row money-row-on' : 'money-row'} style={{ ['--row-delay' as string]: `${i * 120}ms` }}>
            <path d={d} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" className="money-curve" style={{ opacity: active ? 0.55 : 0.12 }} />
            {active && [0, 1, 2].map((n) => (
              <circle
                key={`${animKey}-${n}`}
                r={5}
                fill={color}
                className="money-dot"
                style={{ offsetPath: `path("${d}")`, animationDelay: `${i * 120 + n * 520}ms` }}
              />
            ))}
            <text x={X0} y={y + 22} fontSize="14" fontWeight="700" fill="currentColor">{LABELS[key]}</text>
            <text x={BAR_X1} y={y + 22} fontSize="16" fontWeight="800" fill={active ? color : 'currentColor'} textAnchor="end" className="num money-amount" opacity={active ? 1 : 0.4}>
              {formatPence(pence)}
            </text>
            <rect x={X0} y={barY} width={BAR_X1 - X0} height={14} rx={7} fill="currentColor" opacity={0.08} />
            <rect x={X0} y={barY} width={Math.max(0, (BAR_X1 - X0) * share)} height={14} rx={7} fill={color} className="money-bar" />
            <text x={X0} y={y + 64} fontSize="11" fontWeight="600" fill="currentColor" opacity={0.55}>{Math.round(share * 100)}% of spare money</text>
          </g>
        );
      })}
    </svg>
  );
}
