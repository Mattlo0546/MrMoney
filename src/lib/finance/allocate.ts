/**
 * Deterministic allocation engine for the Money agent. The model never does arithmetic: it calls `allocate` and
 * `compareSavings` and quotes their figures. Rules follow the research brief's priority ladder:
 * debt → overdraft → emergency fund → short goals → Lifetime ISA → index fund → speculative (≤5%).
 * Pure functions; shared by the server tools and the /money page.
 */
import type { Allocation, AllocationLine, Check, Comparison, FinanceProfile } from './types';

/** Share of the surplus that goes to the emergency fund while it is below target. */
export const EMERGENCY_SHARE = 0.7;
/** Share of what's left that goes to a Lifetime ISA when there is a house goal. */
export const LISA_SHARE = 0.3;
/** £4,000 a year limit / 12, rounded down to whole pounds. */
export const LISA_MONTHLY_CAP_PENCE = 33300;
export const SPECULATIVE_SHARE = 0.05;
export const CRYPTO_MAX_SHARE_PERCENT = 5;
/** Combined platform + fund fee above which we flag the cost. */
export const FEE_WARN_PERCENT = 0.25;
/** Below this yearly gain a switch isn't worth the hassle. */
export const SWITCH_MIN_GAIN_PENCE = 2500;

const floorPounds = (p: number) => Math.max(0, Math.floor(p / 100) * 100);
const ceilPounds = (p: number) => Math.max(0, Math.ceil(p / 100) * 100);
const fmt = (p: number) => {
  const abs = Math.abs(Math.round(p));
  const pounds = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const pen = abs % 100;
  return `${p < 0 ? '-' : ''}£${pounds}${pen ? `.${String(pen).padStart(2, '0')}` : ''}`;
};

/** Whole months from `today` to `iso` (at least 1). */
export function monthsUntil(today: string, iso: string): number {
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = iso.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  return Math.max(1, months);
}

export const lisaEligible = (age: number | undefined) => age === undefined || (age >= 18 && age <= 39);

export function yearlyInterestPence(balancePence: number, ratePercent: number): number {
  return Math.round((balancePence * ratePercent) / 100);
}

export interface AllocateOverrides {
  monthlySurplusPence?: number;
  emergencyMonths?: number;
}

export function allocate(profile: FinanceProfile, today: string, overrides: AllocateOverrides = {}): Allocation {
  const p = { ...profile, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) } as FinanceProfile;
  const surplus = p.monthlySurplusPence;
  const lines: AllocationLine[] = [];
  let left = surplus;
  const take = (line: Omit<AllocationLine, 'pence'>, pence: number) => {
    const amount = Math.min(left, pence);
    if (amount <= 0) return 0;
    lines.push({ ...line, pence: amount });
    left -= amount;
    return amount;
  };

  const emergencyTarget = p.essentialMonthlyCostsPence * p.emergencyMonths;
  const emergencyGap = Math.max(0, emergencyTarget - p.cashSavingsPence);
  const invested = p.investedPence + p.cryptoPence;
  const cryptoShare = invested > 0 ? Math.round((p.cryptoPence / invested) * 1000) / 10 : 0;
  let emergencyMonthly = 0;

  if (p.highInterestDebtPence > 0) {
    take({ bucket: 'debt', label: 'Pay off debt', reason: `Clear the ${fmt(p.highInterestDebtPence)} of interest-charging debt first; no investment reliably beats card or BNPL interest.` }, surplus);
  } else if (p.usingOverdraft) {
    take({ bucket: 'overdraft', label: 'Clear the overdraft', reason: 'Get back above £0 before investing. The student overdraft is interest-free now, but not after graduation.' }, surplus);
  } else {
    if (emergencyGap > 0) {
      emergencyMonthly = take(
        { bucket: 'emergency_fund', label: 'Emergency fund', reason: `Build ${p.emergencyMonths} months of essentials (${fmt(emergencyTarget)}) in easy-access cash or a regular saver. ${fmt(emergencyGap)} to go.` },
        Math.min(emergencyGap, floorPounds(surplus * EMERGENCY_SHARE)),
      );
    }

    // Cash above the emergency target counts towards short goals first.
    let spareCash = Math.max(0, p.cashSavingsPence - emergencyTarget);
    let goalsMonthly = 0;
    const goalNames: string[] = [];
    for (const g of [...p.shortGoals].sort((a, b) => a.byDate.localeCompare(b.byDate))) {
      const covered = Math.min(spareCash, g.amountPence);
      spareCash -= covered;
      const need = g.amountPence - covered;
      if (need <= 0) continue;
      goalsMonthly += ceilPounds(need / monthsUntil(today, g.byDate));
      goalNames.push(`${g.label} (${fmt(g.amountPence)} by ${g.byDate})`);
    }
    if (goalsMonthly > 0) {
      take({ bucket: 'short_goals', label: 'Short-term goals', reason: `Money needed within 5 years stays in cash: ${goalNames.join(', ')}.` }, goalsMonthly);
    }

    if (emergencyGap === 0) {
      if (p.houseGoal && lisaEligible(p.age)) {
        take(
          { bucket: 'lifetime_isa', label: 'Lifetime ISA', reason: 'First-home savings get a 25% government bonus (up to £1,000 a year). Only for a first home under £450,000, or 25% is lost.' },
          Math.min(LISA_MONTHLY_CAP_PENCE, floorPounds(left * LISA_SHARE)),
        );
      }
      if (cryptoShare < CRYPTO_MAX_SHARE_PERCENT) {
        take({ bucket: 'speculative', label: 'Crypto / fun money', reason: `Capped at ${Math.round(SPECULATIVE_SHARE * 100)}% of new money; only what you could lose entirely.` }, floorPounds(left * SPECULATIVE_SHARE));
      }
    }
    if (left > 0) {
      take(
        { bucket: 'index_fund', label: 'Index fund (Stocks & Shares ISA)', reason: `Monthly into a low-cost global or S&P 500 fund in a Stocks & Shares ISA${p.investFund ? ` (now: ${p.investFund})` : ''}. Only money you won't need for 5+ years.` },
        left,
      );
    }
  }

  const checks = checksFor(p, { emergencyTarget, emergencyGap, cryptoShare });
  const feeYear = p.bankPlanFeeMonthlyPence * 12;
  return {
    monthlySurplusPence: surplus,
    lines,
    emergencyTargetPence: emergencyTarget,
    emergencyGapPence: emergencyGap,
    emergencyMonthsToFill: emergencyGap > 0 && emergencyMonthly > 0 ? Math.ceil(emergencyGap / emergencyMonthly) : null,
    cryptoSharePercent: cryptoShare,
    checks,
    cashInterestYearlyPence: yearlyInterestPence(p.cashSavingsPence, p.cashRatePercent) - feeYear,
    note: 'Rules of thumb from the priority ladder, not regulated financial advice.',
  };
}

function checksFor(p: FinanceProfile, c: { emergencyTarget: number; emergencyGap: number; cryptoShare: number }): Check[] {
  const out: Check[] = [];
  if (p.highInterestDebtPence > 0) {
    out.push({ id: 'debt', level: 'act', title: 'Interest-charging debt', detail: `Pay off ${fmt(p.highInterestDebtPence)} before saving extra or investing.` });
  }
  if (p.usingOverdraft) {
    out.push({ id: 'overdraft', level: 'act', title: 'In your overdraft', detail: 'Don\'t invest borrowed money. Clear the overdraft first.' });
  }

  if (p.bankPlanFeeMonthlyPence > 0) {
    const feeYear = p.bankPlanFeeMonthlyPence * 12;
    const uplift = p.cashRatePercent - p.freePlanRatePercent;
    const extra = yearlyInterestPence(p.cashSavingsPence, uplift);
    const net = extra - feeYear;
    if (uplift <= 0) {
      out.push({ id: 'bank_plan', level: 'act', title: 'Paid plan adds no interest', detail: `You pay ${fmt(feeYear)} a year and get no better rate.`, yearlyPence: feeYear });
    } else if (net < 0) {
      const breakEven = Math.ceil(feeYear / (uplift / 100) / 10000) * 10000;
      out.push({
        id: 'bank_plan', level: 'act', title: 'Paid plan costs more than it earns',
        detail: `It adds ${fmt(extra)} of interest a year for ${fmt(feeYear)} in fees. It only pays off above about ${fmt(breakEven)} saved, unless you use its other perks.`,
        yearlyPence: -net,
      });
    } else {
      out.push({ id: 'bank_plan', level: 'ok', title: 'Paid plan pays for itself', detail: `Extra interest ${fmt(extra)} a year vs ${fmt(feeYear)} in fees.` });
    }
  }

  if (p.investedPence > 0 || p.monthlyInvestPence > 0) {
    if (p.investWrapper === 'gia') {
      out.push({ id: 'wrapper', level: 'act', title: 'Investing outside an ISA', detail: 'Send new contributions to a Stocks & Shares ISA so growth and dividends are tax-free.' });
    } else if (p.investWrapper === 'unknown') {
      out.push({ id: 'wrapper', level: 'warn', title: 'Check the wrapper', detail: 'Make sure the monthly investment goes into a Stocks & Shares ISA.' });
    } else {
      out.push({ id: 'wrapper', level: 'ok', title: 'In a Stocks & Shares ISA', detail: 'Growth and dividends are tax-free.' });
    }
    if (p.investFeePercent > FEE_WARN_PERCENT) {
      const excess = yearlyInterestPence(p.investedPence, p.investFeePercent - 0.1);
      out.push({
        id: 'fees', level: 'warn', title: `Fees of ${p.investFeePercent}% a year`,
        detail: `Zero-fee platforms with a 0.03–0.14% fund would save about ${fmt(excess)} a year on today's balance, and more as it grows.`,
        yearlyPence: excess,
      });
    } else {
      out.push({ id: 'fees', level: 'ok', title: `Fees of ${p.investFeePercent}% a year`, detail: 'Low cost. Nothing to change.' });
    }
  }

  if (c.cryptoShare > CRYPTO_MAX_SHARE_PERCENT) {
    out.push({ id: 'crypto', level: 'warn', title: `Crypto is ${c.cryptoShare}% of investments`, detail: `Above the ${CRYPTO_MAX_SHARE_PERCENT}% cap. Stop adding until it's back under.` });
  } else if (p.cryptoPence > 0) {
    out.push({ id: 'crypto', level: 'ok', title: `Crypto is ${c.cryptoShare}% of investments`, detail: `Within the ${CRYPTO_MAX_SHARE_PERCENT}% cap.` });
  }

  if (c.emergencyGap > 0) {
    out.push({ id: 'emergency_fund', level: 'warn', title: 'Emergency fund not full', detail: `${fmt(c.emergencyGap)} short of ${fmt(c.emergencyTarget)} (${p.emergencyMonths} months of essentials).` });
  } else if (c.emergencyTarget > 0) {
    out.push({ id: 'emergency_fund', level: 'ok', title: 'Emergency fund full', detail: `${fmt(c.emergencyTarget)} covers ${p.emergencyMonths} months of essentials.` });
  }

  if (p.houseGoal && !lisaEligible(p.age)) {
    out.push({ id: 'lifetime_isa', level: 'warn', title: 'Lifetime ISA not available', detail: 'You can only open one between 18 and 39.' });
  }
  return out;
}

export interface CompareInput {
  label: string;
  toRatePercent: number;
  toMonthlyFeePence?: number;
  balancePence?: number;
  sourceRef?: string;
}

/** Moving cash from the current setup to another account: interest difference plus the change in fees, per year. */
export function compareSavings(profile: FinanceProfile, a: CompareInput): Comparison {
  const balance = a.balancePence ?? profile.cashSavingsPence;
  const interestDiff = yearlyInterestPence(balance, a.toRatePercent) - yearlyInterestPence(balance, profile.cashRatePercent);
  const feeNow = profile.bankPlanFeeMonthlyPence * 12;
  const feeNew = (a.toMonthlyFeePence ?? 0) * 12;
  const gain = interestDiff + feeNow - feeNew;
  const feeNote = feeNow > 0 ? ` Includes dropping the ${fmt(feeNow)} a year paid plan; keep it only if you use its other perks.` : '';
  return {
    label: a.label,
    balancePence: balance,
    fromRatePercent: profile.cashRatePercent,
    toRatePercent: a.toRatePercent,
    yearlyGainPence: gain,
    worthSwitching: gain >= SWITCH_MIN_GAIN_PENCE,
    ...(a.sourceRef ? { sourceRef: a.sourceRef } : {}),
    detail: `${fmt(balance)} at ${a.toRatePercent}% instead of ${profile.cashRatePercent}%: ${gain >= 0 ? '+' : ''}${fmt(gain)} a year.${feeNote}`,
  };
}

export { fmt as formatPence };
