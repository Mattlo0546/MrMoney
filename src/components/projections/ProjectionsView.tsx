'use client';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { formatMoney, gbp, project } from '@/lib/engine';
import type { EngineState, ProjectionAssumptions, ProjectionPoint, Scenario } from '@/lib/engine';
import { useAppSnapshot } from '@/lib/store';
import {
  BANK_PRODUCTS,
  DEFAULT_SELECTED_BANKS,
  DEFAULT_SELECTED_STOCKS,
  STOCK_PRODUCTS,
  decideArgonAllocation,
  extractSeedFromEngineState,
  type ArgonDecision,
  type ArgonRiskProfile,
} from '@/lib/finance/products';
import {
  Check,
  ChartLine,
  Landmark,
  Minus,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Card, Choice, Field, PageFrame, parsePounds } from '@/components/settings/kit';
import { IconBadge, WithIcon, type ValueKind } from '@/components/ui/Value';
import { BrandLogo } from './BrandLogos';
import { ProjectionDiagrams } from './ProjectionDiagrams';

const PERIODS = [3, 6, 12, 24] as const;
const RISK_OPTIONS: {
  id: ArgonRiskProfile;
  title: string;
  splitBadge: string;
  subtitle: string;
  icon: LucideIcon;
}[] = [
  {
    id: 'conservative',
    title: 'Conservative',
    splitBadge: '75/25',
    subtitle: '75% Bank Cash · 25% Stocks',
    icon: ShieldCheck,
  },
  {
    id: 'balanced',
    title: 'Balanced',
    splitBadge: '60/40',
    subtitle: '60% Bank Cash · 40% Stocks',
    icon: Scale,
  },
  {
    id: 'growth',
    title: 'Growth',
    splitBadge: '45/55',
    subtitle: '45% Bank Cash · 55% Stocks',
    icon: TrendingUp,
  },
];
const SCEN = [
  { key: 'low', label: 'Low', icon: TrendingDown },
  { key: 'base', label: 'Base', icon: Minus },
  { key: 'high', label: 'High', icon: TrendingUp },
] as const satisfies readonly { key: Scenario; label: string; icon: unknown }[];
const KEY = 'mrmoney.projections.v1';

export interface Inputs {
  months: number;
  lumpSum: string;
  monthlySurplus: string;
  riskProfile: ArgonRiskProfile;
  savingsNow: string;
  savingsAdd: string;
  invNow: string;
  invAdd: string;
  income: string;
  sLow: string;
  sBase: string;
  sHigh: string;
  iLow: string;
  iBase: string;
  iHigh: string;
  selectedBankIds: string[];
  selectedStockIds: string[];
  rationale: string;
  decidedBy: 'argon-engine' | 'gemini-4-argon';
  syncedPlanFundsPence?: number;
}

/** Percent text -> number, null when empty/invalid. */
function pct(raw: string): number | null {
  const t = raw.trim().replace(/%$/, '');
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function decisionToInputs(
  d: ArgonDecision,
  months = 12,
  syncedPlanFundsPence?: number,
): Inputs {
  return {
    months,
    lumpSum: String(d.lumpSumPounds),
    monthlySurplus: String(d.monthlySurplusPounds),
    riskProfile: d.riskProfile,
    savingsNow: String(d.savingsNowPounds),
    savingsAdd: String(d.savingsAddPounds),
    invNow: String(d.invNowPounds),
    invAdd: String(d.invAddPounds),
    income: String(d.monthlyIncomePounds),
    sLow: String(d.rates.sLow),
    sBase: String(d.rates.sBase),
    sHigh: String(d.rates.sHigh),
    iLow: String(d.rates.iLow),
    iBase: String(d.rates.iBase),
    iHigh: String(d.rates.iHigh),
    selectedBankIds: d.selectedBankIds,
    selectedStockIds: d.selectedStockIds,
    rationale: d.rationale,
    decidedBy: d.decidedBy,
    syncedPlanFundsPence,
  };
}

function isPopulated(x: Partial<Inputs> | null | undefined): boolean {
  if (!x) return false;
  return (
    typeof x.savingsNow === 'string' &&
    x.savingsNow.trim() !== '' &&
    typeof x.invNow === 'string' &&
    x.invNow.trim() !== '' &&
    typeof x.sBase === 'string' &&
    x.sBase.trim() !== '' &&
    typeof x.iBase === 'string' &&
    x.iBase.trim() !== ''
  );
}

function load(state: EngineState | null): Inputs {
  const seed = extractSeedFromEngineState(state);
  const currentPlanFundsPence = state?.profile.funds?.pence;
  const fallbackDecision = decideArgonAllocation(seed);
  const fallback = decisionToInputs(fallbackDecision, 12, currentPlanFundsPence);

  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Inputs>;
      // If stored state was from the old empty template, or if the user's plan lump sum changed, re-seed via Argon
      const planChanged =
        currentPlanFundsPence !== undefined &&
        parsed.syncedPlanFundsPence !== undefined &&
        parsed.syncedPlanFundsPence !== currentPlanFundsPence;

      if (isPopulated(parsed) && !planChanged) {
        return {
          ...fallback,
          ...parsed,
          selectedBankIds:
            Array.isArray(parsed.selectedBankIds) && parsed.selectedBankIds.length > 0
              ? parsed.selectedBankIds
              : fallback.selectedBankIds,
          selectedStockIds:
            Array.isArray(parsed.selectedStockIds) && parsed.selectedStockIds.length > 0
              ? parsed.selectedStockIds
              : fallback.selectedStockIds,
          lumpSum:
            typeof parsed.lumpSum === 'string' && parsed.lumpSum.trim() !== ''
              ? parsed.lumpSum
              : String(
                  Math.round(
                    ((parsePounds(parsed.savingsNow ?? '0') ?? 0) + (parsePounds(parsed.invNow ?? '0') ?? 0)) / 100,
                  ) || seed.lumpSumPounds,
                ),
          syncedPlanFundsPence: currentPlanFundsPence ?? parsed.syncedPlanFundsPence,
        };
      }
    }
  } catch {
    /* storage unavailable: keep Argon defaults */
  }
  return fallback;
}

export function ProjectionsView() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const snap = useAppSnapshot();
  if (!mounted || !snap.hydrated) {
    return (
      <PageFrame title="Projections" icon={ChartLine}>
        <span />
      </PageFrame>
    );
  }
  const fundsKey = snap.state?.profile.funds?.pence ?? 'default';
  return <Projections key={String(fundsKey)} snapState={snap.state} />;
}

function Projections({ snapState }: { snapState: EngineState | null }) {
  const [v, setV] = useState<Inputs>(() => load(snapState));
  const [argonBusy, setArgonBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  }, [v]);

  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  // Current Argon allocation breakdown reflecting the active lump sum, risk profile, and selected products
  const decision = useMemo<ArgonDecision>(() => {
    const lumpPounds = Math.round((parsePounds(v.lumpSum) ?? 0) / 100);
    const surplusPounds = Math.round((parsePounds(v.monthlySurplus) ?? 0) / 100);
    const incomePounds = Math.round((parsePounds(v.income) ?? 0) / 100);
    const computed = decideArgonAllocation({
      lumpSumPounds: lumpPounds > 0 ? lumpPounds : 3900,
      monthlySurplusPounds: surplusPounds,
      monthlyIncomePounds: incomePounds,
      riskProfile: v.riskProfile,
      selectedBankIds: v.selectedBankIds,
      selectedStockIds: v.selectedStockIds,
    });
    return {
      ...computed,
      rationale: v.rationale || computed.rationale,
      decidedBy: v.decidedBy ?? 'argon-engine',
    };
  }, [v.lumpSum, v.monthlySurplus, v.income, v.riskProfile, v.selectedBankIds, v.selectedStockIds, v.rationale, v.decidedBy]);

  function applyArgonReallocation(nextPatch: Partial<{
    lumpSum: string;
    monthlySurplus: string;
    riskProfile: ArgonRiskProfile;
    selectedBankIds: string[];
    selectedStockIds: string[];
  }>) {
    const nextLumpStr = nextPatch.lumpSum ?? v.lumpSum;
    const nextSurplusStr = nextPatch.monthlySurplus ?? v.monthlySurplus;
    const nextRisk = nextPatch.riskProfile ?? v.riskProfile;
    const nextBanks = nextPatch.selectedBankIds ?? v.selectedBankIds;
    const nextStocks = nextPatch.selectedStockIds ?? v.selectedStockIds;

    const lumpPounds = Math.round((parsePounds(nextLumpStr) ?? 0) / 100);
    const surplusPounds = Math.round((parsePounds(nextSurplusStr) ?? 0) / 100);
    const incomePounds = Math.round((parsePounds(v.income) ?? 0) / 100);

    const d = decideArgonAllocation({
      lumpSumPounds: lumpPounds,
      monthlySurplusPounds: surplusPounds,
      monthlyIncomePounds: incomePounds,
      riskProfile: nextRisk,
      selectedBankIds: nextBanks,
      selectedStockIds: nextStocks,
    });

    setV((prev) => ({
      ...prev,
      lumpSum: nextLumpStr,
      monthlySurplus: nextSurplusStr,
      riskProfile: nextRisk,
      selectedBankIds: d.selectedBankIds,
      selectedStockIds: d.selectedStockIds,
      savingsNow: String(d.savingsNowPounds),
      savingsAdd: String(d.savingsAddPounds),
      invNow: String(d.invNowPounds),
      invAdd: String(d.invAddPounds),
      sLow: String(d.rates.sLow),
      sBase: String(d.rates.sBase),
      sHigh: String(d.rates.sHigh),
      iLow: String(d.rates.iLow),
      iBase: String(d.rates.iBase),
      iHigh: String(d.rates.iHigh),
      rationale: d.rationale,
      decidedBy: 'argon-engine',
    }));
  }

  async function askArgonAgent() {
    const lumpPounds = Math.round((parsePounds(v.lumpSum) ?? 390_000) / 100);
    const surplusPounds = Math.round((parsePounds(v.monthlySurplus) ?? 25_000) / 100);
    const incomePounds = Math.round((parsePounds(v.income) ?? 45_000) / 100);
    setArgonBusy(true);
    try {
      const res = await fetch('/api/projections/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lumpSumPounds: lumpPounds > 0 ? lumpPounds : 3900,
          monthlySurplusPounds: surplusPounds,
          monthlyIncomePounds: incomePounds,
          riskProfile: v.riskProfile,
          months: v.months,
        }),
      });
      if (res.ok) {
        const d = (await res.json()) as ArgonDecision;
        setV((prev) => decisionToInputs(d, prev.months, prev.syncedPlanFundsPence));
      } else {
        applyArgonReallocation({});
      }
    } catch {
      applyArgonReallocation({});
    } finally {
      setArgonBusy(false);
    }
  }

  function toggleBank(id: string) {
    const exists = v.selectedBankIds.includes(id);
    const next = exists
      ? v.selectedBankIds.length > 1
        ? v.selectedBankIds.filter((x) => x !== id)
        : v.selectedBankIds
      : [...v.selectedBankIds, id];
    applyArgonReallocation({ selectedBankIds: next });
  }

  function toggleStock(id: string) {
    const exists = v.selectedStockIds.includes(id);
    const next = exists
      ? v.selectedStockIds.length > 1
        ? v.selectedStockIds.filter((x) => x !== id)
        : v.selectedStockIds
      : [...v.selectedStockIds, id];
    applyArgonReallocation({ selectedStockIds: next });
  }

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
      startSavings: m(v.savingsNow),
      startInvestments: m(v.invNow),
      monthlySavingsContribution: m(v.savingsAdd),
      monthlyInvestmentContribution: m(v.invAdd),
      confirmedIncome: gbp(0),
      expectedMonthlyIncome: m(v.income),
      savingsRatePct: { low: pct(v.sLow), base: pct(v.sBase), high: pct(v.sHigh) },
      investmentReturnPct: { low: pct(v.iLow), base: pct(v.iBase), high: pct(v.iHigh) },
    };
    const anyMoney = [v.savingsNow, v.savingsAdd, v.invNow, v.invAdd, v.income].some(
      (s) => (parsePounds(s) ?? 0) > 0,
    );
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

  const rows: {
    label: string;
    icon: ValueKind;
    get: (p: ProjectionPoint) => { pence: number } | undefined;
    strong?: boolean;
  }[] = [
    { label: 'Savings', icon: 'savings', get: (p) => p.savings },
    { label: 'Investments', icon: 'investments', get: (p) => p.investments },
    { label: 'Total', icon: 'total', get: (p) => p.total, strong: true },
    { label: 'You put in', icon: 'contributed', get: (p) => p.contributed },
    { label: 'Growth', icon: 'growth', get: (p) => p.growth },
    { label: 'Income received', icon: 'income', get: (p) => p.cumulativeIncome },
  ];

  const bankAllocMap = useMemo(
    () => new Map(decision.bankAllocations.map((b) => [b.product.id, b])),
    [decision.bankAllocations],
  );
  const stockAllocMap = useMemo(
    () => new Map(decision.stockAllocations.map((s) => [s.product.id, s])),
    [decision.stockAllocations],
  );

  return (
    <PageFrame title="Projections" icon={ChartLine}>
      {/* Argon Main Deciding Agent: Lump Sum Budget -> Exact Savings & Investments Split */}
      <section
        data-testid="argon-allocator"
        className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-soft"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-grad-primary-soft px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-grad-primary text-white shadow-glow">
              <Scale aria-hidden="true" size={20} strokeWidth={2.2} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-extrabold tracking-tight">
                  Argon Lump-Sum Capital Allocator
                </h2>
                <span className="rounded-full border border-pos/30 bg-pos-soft px-2.5 py-0.5 text-[11px] font-extrabold text-pos">
                  {decision.decidedBy === 'gemini-4-argon' ? 'Decided by gemini-4-argon' : 'Argon Decision Engine Active'}
                </span>
              </div>
              <p className="text-xs font-medium text-muted">
                Enter your lump sum budget — Argon allocates the exact amount to UK bank savings and stock/ETF investments.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={askArgonAgent}
            disabled={argonBusy}
            data-testid="argon-decide-btn"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-grad-primary px-4 py-2 text-xs font-extrabold shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            <SlidersHorizontal aria-hidden="true" size={14} strokeWidth={2.3} />
            {argonBusy ? 'Argon is deciding…' : 'Ask Argon to Optimise Split'}
          </button>
        </div>

        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="lumpSum"
              icon="total"
              iconTone="primary"
              label="Lump sum budget given"
              prefix="£"
              inputMode="decimal"
              placeholder="3900"
              value={v.lumpSum}
              onChange={(e) => applyArgonReallocation({ lumpSum: e.target.value })}
              hint="Split 100% across savings & investments."
            />
            <Field
              id="monthlySurplus"
              icon="contributed"
              label="Monthly contribution budget"
              prefix="£"
              inputMode="decimal"
              placeholder="250"
              value={v.monthlySurplus}
              onChange={(e) => applyArgonReallocation({ monthlySurplus: e.target.value })}
              hint="Added monthly across your chosen products."
            />
          </div>

          {/* Spacious Argon Allocation Strategy Tabs (Conservative / Balanced / Growth) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-text">Argon allocation strategy</span>
              <span className="text-xs font-semibold text-muted">Savings / Investing split</span>
            </div>
            <div
              role="radiogroup"
              aria-label="Argon allocation strategy"
              data-testid="argon-strategy-tabs"
              className="grid grid-cols-1 gap-2 rounded-2xl border border-line bg-surface-2/70 p-1.5 sm:grid-cols-3"
            >
              {RISK_OPTIONS.map((opt) => {
                const active = v.riskProfile === opt.id;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    data-testid={`risk-tab-${opt.id}`}
                    onClick={() => applyArgonReallocation({ riskProfile: opt.id })}
                    className={`flex flex-col justify-between gap-1 rounded-xl px-3.5 py-2.5 text-left transition-all active:scale-[0.99] ${
                      active
                        ? 'bg-grad-primary text-white shadow-glow'
                        : 'border border-transparent bg-surface/80 text-text hover:border-line hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-extrabold">
                        <Icon
                          aria-hidden="true"
                          size={16}
                          strokeWidth={2.3}
                          className={active ? 'text-white' : 'text-accent'}
                        />
                        {opt.title}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold tabular-nums ${
                          active ? 'bg-white/20 text-white' : 'bg-surface-2 text-muted'
                        }`}
                      >
                        {opt.splitBadge}
                      </span>
                    </div>
                    <span className={`text-[11px] font-medium ${active ? 'text-white/85' : 'text-muted'}`}>
                      {opt.subtitle}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Argon Decision Summary Pills */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface-2/60 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Total Lump Sum</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums">
                £{decision.lumpSumPounds.toLocaleString('en-GB')}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                +£{decision.monthlySurplusPounds.toLocaleString('en-GB')}/mo recurring
              </p>
            </div>
            <div className="rounded-2xl border border-pos/30 bg-pos-soft/40 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-pos">
                Allocated to Bank Savings ({decision.savingsSharePercent}%)
              </p>
              <p data-testid="argon-savings-allocated" className="mt-1 font-mono text-2xl font-extrabold text-pos tabular-nums">
                £{decision.savingsNowPounds.toLocaleString('en-GB')}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted">
                +£{decision.savingsAddPounds}/mo · Blended {decision.rates.sBase.toFixed(2)}% AER
              </p>
            </div>
            <div className="rounded-2xl border border-accent/30 bg-accent-soft/40 p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-accent">
                Allocated to Stock/ETF Investing ({decision.investmentsSharePercent}%)
              </p>
              <p data-testid="argon-investments-allocated" className="mt-1 font-mono text-2xl font-extrabold text-accent tabular-nums">
                £{decision.invNowPounds.toLocaleString('en-GB')}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-muted">
                +£{decision.invAddPounds}/mo · Blended {decision.rates.iBase.toFixed(2)}% Base Return
              </p>
            </div>
          </div>

          {/* Argon Decision — Concise Bullet-Point Breakdown */}
          <div
            data-testid="argon-decision-summary"
            className="rounded-2xl border border-line bg-surface-2/80 px-4 py-3.5 sm:px-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold uppercase tracking-wider text-text sm:text-[13px]">
                Argon Decision Breakdown
              </p>
              <span className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[11px] font-bold text-muted">
                {decision.savingsSharePercent}% Cash · {decision.investmentsSharePercent}% Equities
              </span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-muted sm:text-[13px]">
              {decision.rationaleBullets.map((bullet, idx) => {
                const colonIdx = bullet.indexOf(':');
                const lead = colonIdx > 0 ? bullet.slice(0, colonIdx + 1) : '';
                const rest = colonIdx > 0 ? bullet.slice(colonIdx + 1) : bullet;
                return (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    />
                    <span>
                      {lead && <strong className="font-bold text-text">{lead}</strong>}
                      {rest}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <Card title="How far ahead?" icon="days">
        <Choice
          label="Period"
          cols={4}
          value={String(v.months)}
          onPick={(m) => setV((p) => ({ ...p, months: Number(m) }))}
          options={PERIODS.map((m) => ({ id: String(m), label: `${m} mo`, icon: 'days' as const }))}
        />
      </Card>

      {/* Hero + Multi-Scenario Table */}
      <section aria-live="polite" className="overflow-hidden rounded-[24px] border border-line bg-surface shadow-soft">
        <div className="flex items-start gap-4 border-b border-line bg-grad-primary-soft p-5 sm:p-6">
          <IconBadge icon="total" tone="primary" size="lg" solid />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <WithIcon icon="days" tone="primary" size={14}>
                Base total after {v.months} months
              </WithIcon>
            </p>
            {showTable && base ? (
              <p
                data-testid="hero"
                className="font-display text-5xl font-extrabold tabular-nums tracking-tight text-grad-primary sm:text-7xl"
              >
                {formatMoney(base.total.pence)}
              </p>
            ) : showTable ? (
              <p className="text-2xl font-extrabold text-muted sm:text-3xl">Enter a base rate to see this</p>
            ) : (
              <p data-testid="empty" className="text-2xl font-extrabold sm:text-3xl">
                Enter rates to see this
              </p>
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
                    <th scope="col" className="w-[30%] py-2 text-left font-semibold">
                      <span className="sr-only">Line</span>
                    </th>
                    {SCEN.map((s) => (
                      <th key={s.key} scope="col" className="py-2 font-semibold">
                        <span className="inline-flex items-center justify-end gap-1">
                          <s.icon
                            aria-hidden="true"
                            size={14}
                            className={
                              s.key === 'base' ? 'text-accent' : s.key === 'high' ? 'text-pos' : 'text-warn'
                            }
                          />
                          {s.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.label} className={`border-t border-line ${r.strong ? 'bg-accent-soft/60' : ''}`}>
                      <th
                        scope="row"
                        className={`py-3 pr-1 text-left leading-tight ${
                          r.strong ? 'font-bold' : 'font-semibold text-muted'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 sm:gap-2">
                          <IconBadge
                            icon={r.icon}
                            tone={
                              r.strong
                                ? 'primary'
                                : r.icon === 'growth' || r.icon === 'income'
                                  ? 'positive'
                                  : 'neutral'
                            }
                            size="xs"
                            solid={r.strong}
                          />
                          {r.label}
                        </span>
                      </th>
                      {SCEN.map((s) => {
                        const p = last(s.key);
                        return (
                          <td
                            key={s.key}
                            className={`py-3 ${
                              r.strong ? 'text-sm font-extrabold text-accent sm:text-lg' : 'font-semibold'
                            }`}
                          >
                            {p ? money(r.get(p)) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result?.status === 'ok' && result.missing.length > 0 && (
                <p className="mt-3 text-sm text-muted">
                  Columns marked — need a rate for each of the amounts you entered.
                </p>
              )}
            </div>
          )}
          {result?.status === 'invalid' && (
            <p role="alert" className="mt-3 text-neg">
              {result.message}
            </p>
          )}
        </div>
      </section>

      {/* Accurate Projection Diagrams */}
      {showTable && result && (
        <ProjectionDiagrams
          months={v.months}
          scenarios={result.scenarios}
          decision={decision}
        />
      )}

      {/* Selection of Real UK Bank Products with Real-Life Logos */}
      <Card
        title="Real UK Bank Savings Products Argon Chooses From"
        icon={Landmark}
        hint="Click any bank product to include or remove it from Argon's savings delivery mix. Rates and pound splits update automatically."
      >
        <div
          data-testid="bank-selection-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {BANK_PRODUCTS.map((bank) => {
            const selected = v.selectedBankIds.includes(bank.id);
            const alloc = bankAllocMap.get(bank.id);
            return (
              <button
                key={bank.id}
                type="button"
                onClick={() => toggleBank(bank.id)}
                aria-pressed={selected}
                data-testid={`bank-card-${bank.id}`}
                className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                  selected
                    ? 'border-pos bg-pos-soft/25 shadow-soft'
                    : 'border-line bg-surface-2/40 opacity-80 hover:border-pos/40 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandLogo id={bank.logoId} size={40} />
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-extrabold">{bank.provider}</p>
                        <p className="truncate text-xs font-semibold text-muted">{bank.name}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        selected
                          ? 'border-transparent bg-grad-positive'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      {selected ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : '+'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-pos/15 px-2.5 py-0.5 font-mono text-xs font-extrabold text-pos">
                      {bank.aerBase.toFixed(2)}% AER
                    </span>
                    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                      {bank.categoryLabel}
                    </span>
                    {bank.fscsProtected && (
                      <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                        FSCS £85k
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted">{bank.summary}</p>
                </div>

                <div className="mt-3 border-t border-line/70 pt-2.5">
                  {selected && alloc ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-pos">Argon Delivers:</span>
                      <span className="font-mono font-extrabold tabular-nums">
                        £{alloc.lumpSumPounds.toLocaleString('en-GB')} now + £{alloc.monthlyPounds}/mo
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-muted">
                      Available · Low {bank.aerLow}% / Base {bank.aerBase}% / High {bank.aerHigh}%
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selection of Real Stock & ETF Investments with Real-Life Logos */}
      <Card
        title="Real Stock & ETF Investments Argon Chooses From"
        icon="investments"
        hint="Click any index ETF or fractional stock to include or remove it from Argon's investment portfolio."
      >
        <div
          data-testid="stock-selection-grid"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {STOCK_PRODUCTS.map((stock) => {
            const selected = v.selectedStockIds.includes(stock.id);
            const alloc = stockAllocMap.get(stock.id);
            return (
              <button
                key={stock.id}
                type="button"
                onClick={() => toggleStock(stock.id)}
                aria-pressed={selected}
                data-testid={`stock-card-${stock.id}`}
                className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                  selected
                    ? 'border-accent bg-accent-soft/25 shadow-soft'
                    : 'border-line bg-surface-2/40 opacity-80 hover:border-accent/40 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <BrandLogo id={stock.logoId} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-display text-sm font-extrabold">{stock.provider}</p>
                          <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-accent">
                            {stock.ticker}
                          </span>
                        </div>
                        <p className="truncate text-xs font-semibold text-muted">{stock.name}</p>
                      </div>
                    </div>
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                        selected
                          ? 'border-transparent bg-grad-primary'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      {selected ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : '+'}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-xs font-extrabold text-accent">
                      {stock.returnBase.toFixed(1)}% Base / yr
                    </span>
                    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                      OCF {stock.ocfPercent.toFixed(2)}%
                    </span>
                    <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                      {stock.categoryLabel}
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-muted">{stock.summary}</p>
                </div>

                <div className="mt-3 border-t border-line/70 pt-2.5">
                  {selected && alloc ? (
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-accent">Argon Delivers:</span>
                      <span className="font-mono font-extrabold tabular-nums">
                        £{alloc.lumpSumPounds.toLocaleString('en-GB')} now + £{alloc.monthlyPounds}/mo
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-muted">
                      Range · Low {stock.returnLow}% / Base {stock.returnBase}% / High {stock.returnHigh}%
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Populated & Editable Assumptions Cards */}
      <Card title="Savings" icon="savings" hint="Allocated by Argon from your lump sum and blended across your selected UK bank accounts.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="savingsNow"
            icon="savings"
            iconTone="positive"
            label="Savings now"
            prefix="£"
            inputMode="decimal"
            placeholder="0"
            value={v.savingsNow}
            onChange={set('savingsNow')}
            error={errors.savingsNow}
          />
          <Field
            id="savingsAdd"
            icon="contributed"
            label="Add per month"
            prefix="£"
            inputMode="decimal"
            placeholder="0"
            value={v.savingsAdd}
            onChange={set('savingsAdd')}
            error={errors.savingsAdd}
          />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-muted">Savings AER (yearly)</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="sLow" label="Low" suffix="%" inputMode="decimal" value={v.sLow} onChange={set('sLow')} error={errors.sLow} />
          <Field id="sBase" label="Base" suffix="%" inputMode="decimal" value={v.sBase} onChange={set('sBase')} error={errors.sBase} />
          <Field id="sHigh" label="High" suffix="%" inputMode="decimal" value={v.sHigh} onChange={set('sHigh')} error={errors.sHigh} />
        </div>
      </Card>

      <Card title="Investments" icon="investments" hint="Allocated by Argon across your selected index ETFs and fractional stocks. Returns can fall as well as rise.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="invNow"
            icon="investments"
            label="Investments now"
            prefix="£"
            inputMode="decimal"
            placeholder="0"
            value={v.invNow}
            onChange={set('invNow')}
            error={errors.invNow}
          />
          <Field
            id="invAdd"
            icon="contributed"
            label="Add per month"
            prefix="£"
            inputMode="decimal"
            placeholder="0"
            value={v.invAdd}
            onChange={set('invAdd')}
            error={errors.invAdd}
          />
        </div>
        <p className="mb-2 mt-5 text-sm font-semibold text-muted">Expected annual return</p>
        <div className="grid grid-cols-3 gap-3">
          <Field id="iLow" label="Low" suffix="%" inputMode="decimal" value={v.iLow} onChange={set('iLow')} error={errors.iLow} />
          <Field id="iBase" label="Base" suffix="%" inputMode="decimal" value={v.iBase} onChange={set('iBase')} error={errors.iBase} />
          <Field id="iHigh" label="High" suffix="%" inputMode="decimal" value={v.iHigh} onChange={set('iHigh')} error={errors.iHigh} />
        </div>
      </Card>

      <Card title="Income" icon="income">
        <Field
          id="income"
          icon="income"
          iconTone="positive"
          label="Expected monthly income"
          prefix="£"
          inputMode="decimal"
          placeholder="0"
          value={v.income}
          onChange={set('income')}
          error={errors.income}
          hint="Counted once a month for the period."
        />
      </Card>

      <p className="px-2 text-center text-xs text-muted">
        Projections are illustrative estimates, not advice or a guarantee of future performance. Capital at risk when investing.
      </p>
    </PageFrame>
  );
}

export { DEFAULT_SELECTED_BANKS, DEFAULT_SELECTED_STOCKS };
