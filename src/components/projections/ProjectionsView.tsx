'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { formatMoney, gbp, project } from '@/lib/engine';
import type { ProjectionAssumptions, ProjectionPoint, Scenario } from '@/lib/engine';
import { ChartLine, Info, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, Choice, Field, PageFrame, parsePounds } from '@/components/settings/kit';
import { IconBadge, WithIcon, type ValueKind } from '@/components/ui/Value';

const PERIODS = [3, 6, 12, 24] as const;
const SCEN = [
  { key: 'low', label: 'Low', icon: TrendingDown },
  { key: 'base', label: 'Base', icon: Minus },
  { key: 'high', label: 'High', icon: TrendingUp },
] as const satisfies readonly { key: Scenario; label: string; icon: unknown }[];
const KEY = 'studentplan.projections.v1';

interface Inputs {
  months: number;
  savingsNow: string; savingsAdd: string; invNow: string; invAdd: string; income: string;
  sLow: string; sBase: string; sHigh: string; iLow: string; iBase: string; iHigh: string;
}
const EMPTY: Inputs = {
  months: 12, savingsNow: '', savingsAdd: '', invNow: '', invAdd: '', income: '',
  sLow: '', sBase: '', sHigh: '', iLow: '', iBase: '', iHigh: '',
};

/** Percent text -> number, null when empty/invalid. */
function pct(raw: string): number | null {
  const t = raw.trim().replace(/%$/, '');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function load(): Inputs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Inputs>) };
  } catch { /* storage unavailable: keep defaults */ }
  return { ...EMPTY, ...prefill() };
}

/** Pence (number or {pence}) -> pounds text; empty when missing or zero. */
function poundsText(v: unknown): string {
  const pence = typeof v === 'number' ? v : (v as { pence?: unknown } | null)?.pence;
  if (typeof pence !== 'number' || !Number.isFinite(pence) || pence <= 0) return '';
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}

/** Starting balances from onboarding; rates are never pre-filled. */
function prefill(): Partial<Inputs> {
  try {
    const raw = localStorage.getItem('studentplan.onboardingExtras');
    if (!raw) return {};
    const x = JSON.parse(raw) as { currentSavings?: unknown; currentInvestments?: unknown };
    return { savingsNow: poundsText(x.currentSavings), invNow: poundsText(x.currentInvestments) };
  } catch { return {}; }
}

export function ProjectionsView() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return mounted ? <Projections /> : <PageFrame title="Projections" icon={ChartLine}><span /></PageFrame>;
}

function Projections() {
  // The store has no projection-assumptions slot, so they persist locally under their own key.
  const [v, setV] = useState<Inputs>(load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
  }, [v]);

  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const errors = useMemo(() => {
    const e: Partial<Record<keyof Inputs, string>> = {};
    (['savingsNow', 'savingsAdd', 'invNow', 'invAdd', 'income'] as const).forEach((k) => {
      if (parsePounds(v[k]) === null) e[k] = 'Enter an amount in pounds, e.g. 250';
    });
    (['sLow', 'sBase', 'sHigh', 'iLow', 'iBase', 'iHigh'] as const).forEach((k) => {
      if (v[k].trim() !== '' && pct(v[k]) === null) e[k] = 'Enter a number, e.g. 3.5';
    });
    return e;
  }, [v]);

  const result = useMemo(() => {
    if (Object.keys(errors).length) return null;
    const m = (s: string) => gbp(parsePounds(s) ?? 0);
    const a: ProjectionAssumptions = {
      startSavings: m(v.savingsNow), startInvestments: m(v.invNow),
      monthlySavingsContribution: m(v.savingsAdd), monthlyInvestmentContribution: m(v.invAdd),
      confirmedIncome: gbp(0), expectedMonthlyIncome: m(v.income),
      savingsRatePct: { low: pct(v.sLow), base: pct(v.sBase), high: pct(v.sHigh) },
      investmentReturnPct: { low: pct(v.iLow), base: pct(v.iBase), high: pct(v.iHigh) },
    };
    const anyMoney = [v.savingsNow, v.savingsAdd, v.invNow, v.invAdd, v.income].some((s) => (parsePounds(s) ?? 0) > 0);
    return anyMoney ? project(a, v.months) : null;
  }, [v, errors]);

  const last = (s: Scenario): ProjectionPoint | undefined => {
    if (!result || result.status !== 'ok') return undefined;
    const pts = result.scenarios[s];
    return pts?.[pts.length - 1];
  };
  const base = last('base');
  const showTable = result?.status === 'ok';
  const money = (m?: { pence: number }) => (m ? formatMoney(m.pence) : '—');

  const rows: { label: string; icon: ValueKind; get: (p: ProjectionPoint) => { pence: number } | undefined; strong?: boolean }[] = [
    { label: 'Savings', icon: 'savings', get: (p) => p.savings },
    { label: 'Investments', icon: 'investments', get: (p) => p.investments },
    { label: 'Total', icon: 'total', get: (p) => p.total, strong: true },
    { label: 'You put in', icon: 'contributed', get: (p) => p.contributed },
    { label: 'Growth', icon: 'growth', get: (p) => p.growth },
    { label: 'Income received', icon: 'income', get: (p) => p.cumulativeIncome },
  ];

  return (
    <PageFrame title="Projections" icon={ChartLine}>
      <p className="-mt-3 mb-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-muted shadow-soft">
        <Info aria-hidden="true" size={14} className="shrink-0 text-accent" />
        Projection, not advice or a guarantee
      </p>

      <Card title="How far ahead?" icon="days">
        <Choice label="Period" cols={4} value={String(v.months)} onPick={(m) => setV((p) => ({ ...p, months: Number(m) }))}
          options={PERIODS.map((m) => ({ id: String(m), label: `${m} mo`, icon: 'days' as const }))} />
      </Card>

      <section aria-live="polite" className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-soft">
        <div className="flex items-start gap-4 border-b border-line bg-grad-primary-soft p-5 sm:p-6">
          <IconBadge icon="total" tone="primary" size="lg" solid />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <WithIcon icon="days" tone="primary" size={14}>Base total after {v.months} months</WithIcon>
            </p>
            {showTable && base ? (
              <p data-testid="hero" className="font-display text-5xl font-extrabold tabular-nums tracking-tight text-grad-primary sm:text-7xl">
                {formatMoney(base.total.pence)}
              </p>
            ) : showTable ? (
              <p className="text-2xl font-extrabold text-muted sm:text-3xl">Enter a base rate to see this</p>
            ) : (
              <p data-testid="empty" className="text-2xl font-extrabold sm:text-3xl">Enter rates to see this</p>
            )}
          </div>
        </div>
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
        {showTable && (
          <div className="mt-5">
            <table className="w-full table-fixed text-right text-[13px] tabular-nums sm:text-base">
              <caption className="sr-only">Projected values after {v.months} months</caption>
              <thead>
                <tr className="text-sm text-muted">
                  <th scope="col" className="w-[30%] py-2 text-left font-semibold"><span className="sr-only">Line</span></th>
                  {SCEN.map((s) => (
                    <th key={s.key} scope="col" className="py-2 font-semibold">
                      <span className="inline-flex items-center justify-end gap-1"><s.icon aria-hidden="true" size={14} className={s.key === 'base' ? 'text-accent' : s.key === 'high' ? 'text-pos' : 'text-warn'} />{s.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className={`border-t border-line ${r.strong ? 'bg-accent-soft/60' : ''}`}>
                    <th scope="row" className={`py-3 pr-1 text-left leading-tight ${r.strong ? 'font-bold' : 'font-semibold text-muted'}`}>
                      <span className="flex items-center gap-1.5 sm:gap-2"><IconBadge icon={r.icon} tone={r.strong ? 'primary' : r.icon === 'growth' || r.icon === 'income' ? 'positive' : 'neutral'} size="xs" solid={r.strong} />{r.label}</span>
                    </th>
                    {SCEN.map((s) => {
                      const p = last(s.key);
                      return (
                        <td key={s.key} className={`py-3 ${r.strong ? 'text-sm font-extrabold text-accent sm:text-lg' : 'font-semibold'}`}>
                          {p ? money(r.get(p)) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {result?.status === 'ok' && result.missing.length > 0 && (
              <p className="mt-3 text-sm text-muted">Columns marked — need a rate for each of the amounts you entered.</p>
            )}
          </div>
        )}
        {result?.status === 'invalid' && <p role="alert" className="mt-3 text-neg">{result.message}</p>}
        </div>
      </section>

      <Card title="Savings" icon="savings" hint="Money kept in a savings account.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="savingsNow" icon="savings" iconTone="positive" label="Savings now" prefix="£" inputMode="decimal" placeholder="0" value={v.savingsNow} onChange={set('savingsNow')} error={errors.savingsNow} />
          <Field id="savingsAdd" icon="contributed" label="Add per month" prefix="£" inputMode="decimal" placeholder="0" value={v.savingsAdd} onChange={set('savingsAdd')} error={errors.savingsAdd} />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-muted">Savings AER (yearly)</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="sLow" label="Low" suffix="%" inputMode="decimal" value={v.sLow} onChange={set('sLow')} error={errors.sLow} />
          <Field id="sBase" label="Base" suffix="%" inputMode="decimal" value={v.sBase} onChange={set('sBase')} error={errors.sBase} />
          <Field id="sHigh" label="High" suffix="%" inputMode="decimal" value={v.sHigh} onChange={set('sHigh')} error={errors.sHigh} />
        </div>
      </Card>

      <Card title="Investments" icon="investments" hint="Returns can fall as well as rise. Use your own range.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="invNow" icon="investments" label="Investments now" prefix="£" inputMode="decimal" placeholder="0" value={v.invNow} onChange={set('invNow')} error={errors.invNow} />
          <Field id="invAdd" icon="contributed" label="Add per month" prefix="£" inputMode="decimal" placeholder="0" value={v.invAdd} onChange={set('invAdd')} error={errors.invAdd} />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-muted">Expected annual return</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="iLow" label="Low" suffix="%" inputMode="decimal" value={v.iLow} onChange={set('iLow')} error={errors.iLow} />
          <Field id="iBase" label="Base" suffix="%" inputMode="decimal" value={v.iBase} onChange={set('iBase')} error={errors.iBase} />
          <Field id="iHigh" label="High" suffix="%" inputMode="decimal" value={v.iHigh} onChange={set('iHigh')} error={errors.iHigh} />
        </div>
      </Card>

      <Card title="Income" icon="income">
        <Field id="income" icon="income" iconTone="positive" label="Expected monthly income" prefix="£" inputMode="decimal" placeholder="0" value={v.income} onChange={set('income')} error={errors.income} hint="Counted once a month for the period." />
      </Card>
    </PageFrame>
  );
}
