'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { formatMoney, gbp, project } from '@/lib/engine';
import type { ProjectionAssumptions, ProjectionPoint, Scenario } from '@/lib/engine';
import { Card, Field, PageFrame, parsePounds } from '@/components/settings/kit';

const PERIODS = [3, 6, 12, 24] as const;
const SCEN: { key: Scenario; label: string }[] = [
  { key: 'low', label: 'Low' },
  { key: 'base', label: 'Base' },
  { key: 'high', label: 'High' },
];
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
  return EMPTY;
}

export function ProjectionsView() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  return mounted ? <Projections /> : <PageFrame title="Projections"><span /></PageFrame>;
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

  const rows: { label: string; get: (p: ProjectionPoint) => { pence: number }; strong?: boolean }[] = [
    { label: 'Savings', get: (p) => p.savings },
    { label: 'Investments', get: (p) => p.investments },
    { label: 'Total', get: (p) => p.total, strong: true },
    { label: 'You put in', get: (p) => p.contributed },
    { label: 'Growth', get: (p) => gbp(p.total.pence - p.contributed.pence) },
    { label: 'Income received', get: (p) => p.cumulativeIncome },
  ];

  return (
    <PageFrame title="Projections">
      <p className="-mt-3 mb-1 inline-flex w-fit rounded-full bg-[var(--p-surface2)] px-3 py-1 text-sm font-semibold text-[var(--p-muted)]">
        Projection, not advice or a guarantee
      </p>

      <Card title="How far ahead?">
        <div role="radiogroup" aria-label="Period" className="grid grid-cols-4 gap-2">
          {PERIODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={v.months === m}
              onClick={() => setV((p) => ({ ...p, months: m }))}
              className={`min-h-12 rounded-full text-base font-bold transition-transform active:scale-95 ${v.months === m ? 'bg-[var(--p-accent)] text-[var(--p-accent-ink)]' : 'border border-[var(--p-line)] bg-[var(--p-surface2)]'}`}
            >
              {m} mo
            </button>
          ))}
        </div>
      </Card>

      <section aria-live="polite" className="rounded-[24px] border border-[var(--p-line)] bg-[var(--p-surface)] p-5 sm:p-6">
        {showTable && base ? (
          <>
            <p className="text-sm font-semibold text-[var(--p-muted)]">Base total after {v.months} months</p>
            <p data-testid="hero" className="font-[family-name:var(--font-display,inherit)] text-6xl font-extrabold tabular-nums tracking-tight text-[var(--p-lime)] sm:text-7xl">
              {formatMoney(base.total.pence)}
            </p>
          </>
        ) : showTable ? (
          <>
            <p className="text-sm font-semibold text-[var(--p-muted)]">Base total after {v.months} months</p>
            <p className="text-3xl font-extrabold text-[var(--p-muted)]">Enter a base rate to see this</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--p-muted)]">Base total after {v.months} months</p>
            <p data-testid="empty" className="text-3xl font-extrabold">Enter rates to see this</p>
            <p className="mt-2 text-sm text-[var(--p-muted)]">
              Add your savings or investments below, then your own low, base and high rates. Nothing is pre-filled.
            </p>
          </>
        )}
        {showTable && (
          <div className="mt-5">
            <table className="w-full table-fixed text-right text-[13px] tabular-nums sm:text-base">
              <caption className="sr-only">Projected values after {v.months} months</caption>
              <thead>
                <tr className="text-sm text-[var(--p-muted)]">
                  <th scope="col" className="w-[26%] py-2 text-left font-semibold"><span className="sr-only">Line</span></th>
                  {SCEN.map((s) => <th key={s.key} scope="col" className="py-2 font-semibold">{s.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-[var(--p-line)]">
                    <th scope="row" className={`py-3 pr-1 text-left leading-tight ${r.strong ? 'font-bold' : 'font-semibold text-[var(--p-muted)]'}`}>{r.label}</th>
                    {SCEN.map((s) => {
                      const p = last(s.key);
                      return (
                        <td key={s.key} className={`py-3 ${r.strong ? 'text-sm font-extrabold sm:text-lg' : 'font-semibold'}`}>
                          {p ? money(r.get(p)) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {result?.status === 'ok' && result.missing.length > 0 && (
              <p className="mt-3 text-sm text-[var(--p-muted)]">Columns marked — need a rate for each of the amounts you entered.</p>
            )}
          </div>
        )}
        {result?.status === 'invalid' && <p role="alert" className="mt-3 text-[var(--p-coral)]">{result.message}</p>}
      </section>

      <Card title="Savings" hint="Money kept in a savings account.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="savingsNow" label="Savings now" prefix="£" inputMode="decimal" placeholder="0" value={v.savingsNow} onChange={set('savingsNow')} error={errors.savingsNow} />
          <Field id="savingsAdd" label="Add per month" prefix="£" inputMode="decimal" placeholder="0" value={v.savingsAdd} onChange={set('savingsAdd')} error={errors.savingsAdd} />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-[var(--p-muted)]">Savings AER (yearly)</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="sLow" label="Low" suffix="%" inputMode="decimal" value={v.sLow} onChange={set('sLow')} error={errors.sLow} />
          <Field id="sBase" label="Base" suffix="%" inputMode="decimal" value={v.sBase} onChange={set('sBase')} error={errors.sBase} />
          <Field id="sHigh" label="High" suffix="%" inputMode="decimal" value={v.sHigh} onChange={set('sHigh')} error={errors.sHigh} />
        </div>
      </Card>

      <Card title="Investments" hint="Returns can fall as well as rise. Use your own range.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="invNow" label="Investments now" prefix="£" inputMode="decimal" placeholder="0" value={v.invNow} onChange={set('invNow')} error={errors.invNow} />
          <Field id="invAdd" label="Add per month" prefix="£" inputMode="decimal" placeholder="0" value={v.invAdd} onChange={set('invAdd')} error={errors.invAdd} />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-[var(--p-muted)]">Expected annual return</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="iLow" label="Low" suffix="%" inputMode="decimal" value={v.iLow} onChange={set('iLow')} error={errors.iLow} />
          <Field id="iBase" label="Base" suffix="%" inputMode="decimal" value={v.iBase} onChange={set('iBase')} error={errors.iBase} />
          <Field id="iHigh" label="High" suffix="%" inputMode="decimal" value={v.iHigh} onChange={set('iHigh')} error={errors.iHigh} />
        </div>
      </Card>

      <Card title="Income">
        <Field id="income" label="Expected monthly income" prefix="£" inputMode="decimal" placeholder="0" value={v.income} onChange={set('income')} error={errors.income} hint="Counted once a month for the period." />
      </Card>
    </PageFrame>
  );
}
