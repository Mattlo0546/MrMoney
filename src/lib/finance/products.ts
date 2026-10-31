/**
 * Real UK Bank Savings Products & Real Stock/ETF Investments catalog, plus Argon's
 * exact lump-sum & monthly capital allocation engine.
 *
 * Guarantees exact pound conservation:
 *   savingsNowPounds + invNowPounds === lumpSumPounds
 *   sum(bankAllocations.lumpSumPounds) === savingsNowPounds
 *   sum(stockAllocations.lumpSumPounds) === invNowPounds
 */
import type { EngineState } from '@/lib/engine/types';

export type BankProductCategory = 'cash_isa' | 'easy_access' | 'regular_saver';
export type StockProductCategory = 'global_index' | 'core_index' | 'growth_etf' | 'blue_chip_stock';
export type ArgonRiskProfile = 'conservative' | 'balanced' | 'growth';

export type BrandLogoId =
  | 'trading212'
  | 'chase'
  | 'firstdirect'
  | 'santander'
  | 'barclays'
  | 'monzo'
  | 'chip'
  | 'vanguard'
  | 'ishares'
  | 'invesco'
  | 'apple'
  | 'microsoft'
  | 'nvidia';

export interface BankProduct {
  id: string;
  logoId: BrandLogoId;
  provider: string;
  name: string;
  category: BankProductCategory;
  categoryLabel: string;
  aerLow: number;
  aerBase: number;
  aerHigh: number;
  maxLumpSumPounds: number;
  maxMonthlyPounds: number;
  fscsProtected: boolean;
  tag: string;
  summary: string;
  defaultWeight: number;
}

export interface StockProduct {
  id: string;
  logoId: BrandLogoId;
  provider: string;
  ticker: string;
  name: string;
  category: StockProductCategory;
  categoryLabel: string;
  wrapper: string;
  ocfPercent: number;
  returnLow: number;
  returnBase: number;
  returnHigh: number;
  tag: string;
  summary: string;
  defaultWeight: number;
}

export const BANK_PRODUCTS: readonly BankProduct[] = [
  {
    id: 'trading212-cash-isa',
    logoId: 'trading212',
    provider: 'Trading 212',
    name: 'Flexible Cash ISA',
    category: 'cash_isa',
    categoryLabel: 'Tax-Free Cash ISA',
    aerLow: 3.85,
    aerBase: 4.90,
    aerHigh: 5.15,
    maxLumpSumPounds: 20_000,
    maxMonthlyPounds: 1_666,
    fscsProtected: true,
    tag: 'Top Tax-Free AER',
    summary: '4.90% AER variable paid daily · £1 min · Instant withdrawals · FSCS protected via Barclays, NatWest & JPMorgan.',
    defaultWeight: 0.55,
  },
  {
    id: 'chase-saver-boosted',
    logoId: 'chase',
    provider: 'Chase UK',
    name: 'Chase Saver (Boosted)',
    category: 'easy_access',
    categoryLabel: 'Easy-Access Buffer',
    aerLow: 3.60,
    aerBase: 4.75,
    aerHigh: 5.00,
    maxLumpSumPounds: 85_000,
    maxMonthlyPounds: 10_000,
    fscsProtected: true,
    tag: 'Best Instant Buffer',
    summary: '4.75% AER variable (includes 1.25% 6-month boost) · Instant access + 1% debit cashback on essentials.',
    defaultWeight: 0.45,
  },
  {
    id: 'first-direct-regular',
    logoId: 'firstdirect',
    provider: 'first direct',
    name: 'Regular Saver Account',
    category: 'regular_saver',
    categoryLabel: '12m Fixed Regular Saver',
    aerLow: 6.00,
    aerBase: 7.00,
    aerHigh: 7.00,
    maxLumpSumPounds: 300,
    maxMonthlyPounds: 300,
    fscsProtected: true,
    tag: '7.00% Fixed Drip',
    summary: '7.00% AER/gross fixed for 12 months · Save £25–£300/month from a linked current account.',
    defaultWeight: 0.25,
  },
  {
    id: 'santander-edge-saver',
    logoId: 'santander',
    provider: 'Santander',
    name: 'Edge Saver',
    category: 'easy_access',
    categoryLabel: 'High-Rate Tiered Saver',
    aerLow: 4.50,
    aerBase: 6.00,
    aerHigh: 6.00,
    maxLumpSumPounds: 4_000,
    maxMonthlyPounds: 4_000,
    fscsProtected: true,
    tag: '6.00% up to £4k',
    summary: '6.00% AER variable on balances up to £4,000 (includes 2.50% bonus for 12 months) · Instant access.',
    defaultWeight: 0.35,
  },
  {
    id: 'barclays-rainy-day',
    logoId: 'barclays',
    provider: 'Barclays',
    name: 'Rainy Day Saver',
    category: 'easy_access',
    categoryLabel: 'Emergency Pot',
    aerLow: 4.00,
    aerBase: 5.12,
    aerHigh: 5.25,
    maxLumpSumPounds: 5_000,
    maxMonthlyPounds: 5_000,
    fscsProtected: true,
    tag: '5.12% up to £5k',
    summary: '5.12% AER variable on balances up to £5,000 with Blue Rewards · Instant penalty-free access.',
    defaultWeight: 0.30,
  },
  {
    id: 'monzo-instant-saver',
    logoId: 'monzo',
    provider: 'Monzo',
    name: 'Instant Access Savings Pot',
    category: 'easy_access',
    categoryLabel: 'In-App Savings Pot',
    aerLow: 3.35,
    aerBase: 4.60,
    aerHigh: 4.85,
    maxLumpSumPounds: 85_000,
    maxMonthlyPounds: 10_000,
    fscsProtected: true,
    tag: 'Instant Student Pot',
    summary: '4.60% AER variable · Instant round-ups & automated bill splitting inside the Monzo app.',
    defaultWeight: 0.25,
  },
  {
    id: 'chip-instant-access',
    logoId: 'chip',
    provider: 'Chip',
    name: 'Chip Instant Access',
    category: 'easy_access',
    categoryLabel: 'ClearBank Powered Saver',
    aerLow: 3.50,
    aerBase: 4.58,
    aerHigh: 4.85,
    maxLumpSumPounds: 85_000,
    maxMonthlyPounds: 10_000,
    fscsProtected: true,
    tag: 'Fast Auto-Save',
    summary: '4.58% AER variable · Powered by ClearBank with full £85k FSCS protection and same-day withdrawals.',
    defaultWeight: 0.20,
  },
] as const;

export const STOCK_PRODUCTS: readonly StockProduct[] = [
  {
    id: 'vanguard-vwrp',
    logoId: 'vanguard',
    provider: 'Vanguard',
    ticker: 'VWRP.L',
    name: 'FTSE All-World UCITS ETF (Acc)',
    category: 'global_index',
    categoryLabel: 'Global All-Cap Core',
    wrapper: 'Stocks & Shares ISA (0% platform fee)',
    ocfPercent: 0.22,
    returnLow: 3.0,
    returnBase: 8.0,
    returnHigh: 12.5,
    tag: 'Core Global (3,600+ stocks)',
    summary: 'Tracks ~3,600 large & mid-cap companies across developed and emerging markets. Dividends auto-reinvested in GBP.',
    defaultWeight: 0.50,
  },
  {
    id: 'vanguard-vuag',
    logoId: 'vanguard',
    provider: 'Vanguard',
    ticker: 'VUAG.L',
    name: 'S&P 500 UCITS ETF (Acc)',
    category: 'core_index',
    categoryLabel: 'US 500 Core Index',
    wrapper: 'Stocks & Shares ISA (0% platform fee)',
    ocfPercent: 0.07,
    returnLow: 2.5,
    returnBase: 8.8,
    returnHigh: 13.8,
    tag: 'Ultra-Low 0.07% OCF',
    summary: 'Tracks the 500 largest US companies in GBP accumulating units with an ultra-low 0.07% ongoing charge.',
    defaultWeight: 0.40,
  },
  {
    id: 'ishares-swda',
    logoId: 'ishares',
    provider: 'BlackRock iShares',
    ticker: 'SWDA.L',
    name: 'Core MSCI World UCITS ETF',
    category: 'global_index',
    categoryLabel: 'Developed World Index',
    wrapper: 'Stocks & Shares ISA (0% platform fee)',
    ocfPercent: 0.20,
    returnLow: 2.8,
    returnBase: 7.9,
    returnHigh: 12.2,
    tag: '23 Developed Markets',
    summary: 'Broad exposure to 1,400+ developed-market equities across the US, Europe, and Japan. Accumulating GBP line.',
    defaultWeight: 0.35,
  },
  {
    id: 'invesco-eqqq',
    logoId: 'invesco',
    provider: 'Invesco',
    ticker: 'EQQQ.L',
    name: 'NASDAQ-100 UCITS ETF',
    category: 'growth_etf',
    categoryLabel: 'Tech & Innovation Index',
    wrapper: 'Stocks & Shares ISA',
    ocfPercent: 0.30,
    returnLow: -1.5,
    returnBase: 10.2,
    returnHigh: 16.0,
    tag: 'High-Growth Tech Index',
    summary: 'Tracks the 100 largest non-financial companies on NASDAQ. Higher volatility with strong long-term compound growth.',
    defaultWeight: 0.20,
  },
  {
    id: 'apple-aapl',
    logoId: 'apple',
    provider: 'Apple Inc.',
    ticker: 'AAPL',
    name: 'Apple Fractional Shares (S&S ISA)',
    category: 'blue_chip_stock',
    categoryLabel: 'Blue-Chip Satellite (≤5%)',
    wrapper: 'Trading 212 S&S ISA',
    ocfPercent: 0.00,
    returnLow: -2.0,
    returnBase: 10.5,
    returnHigh: 16.5,
    tag: 'Satellite Equity',
    summary: 'Global consumer ecosystem & silicon leader. Held as a capped ≤5% satellite slice alongside core index ETFs.',
    defaultWeight: 0.05,
  },
  {
    id: 'microsoft-msft',
    logoId: 'microsoft',
    provider: 'Microsoft Corp.',
    ticker: 'MSFT',
    name: 'Microsoft Fractional Shares (S&S ISA)',
    category: 'blue_chip_stock',
    categoryLabel: 'Blue-Chip Satellite (≤5%)',
    wrapper: 'Trading 212 S&S ISA',
    ocfPercent: 0.00,
    returnLow: -1.5,
    returnBase: 11.0,
    returnHigh: 17.0,
    tag: 'Cloud & AI Leader',
    summary: 'Enterprise cloud (Azure) & AI compounder. Held as a capped ≤5% satellite slice inside a tax-free ISA.',
    defaultWeight: 0.05,
  },
  {
    id: 'nvidia-nvda',
    logoId: 'nvidia',
    provider: 'NVIDIA Corp.',
    ticker: 'NVDA',
    name: 'NVIDIA Fractional Shares (S&S ISA)',
    category: 'blue_chip_stock',
    categoryLabel: 'Growth Satellite (≤5%)',
    wrapper: 'Trading 212 S&S ISA',
    ocfPercent: 0.00,
    returnLow: -5.0,
    returnBase: 12.5,
    returnHigh: 20.0,
    tag: 'AI Compute Satellite',
    summary: 'Accelerated computing & AI infrastructure leader. Capped at ≤5% of portfolio to keep single-stock risk controlled.',
    defaultWeight: 0.05,
  },
] as const;

export const DEFAULT_SELECTED_BANKS: readonly string[] = [
  'trading212-cash-isa',
  'chase-saver-boosted',
  'first-direct-regular',
];

export const DEFAULT_SELECTED_STOCKS: readonly string[] = [
  'vanguard-vwrp',
  'vanguard-vuag',
  'microsoft-msft',
];

export interface BankAllocationItem {
  product: BankProduct;
  lumpSumPounds: number;
  monthlyPounds: number;
  sharePercent: number;
  reason: string;
}

export interface StockAllocationItem {
  product: StockProduct;
  lumpSumPounds: number;
  monthlyPounds: number;
  sharePercent: number;
  reason: string;
}

export interface ArgonDecisionInput {
  lumpSumPounds: number;
  monthlySurplusPounds?: number;
  monthlyIncomePounds?: number;
  riskProfile?: ArgonRiskProfile;
  selectedBankIds?: readonly string[];
  selectedStockIds?: readonly string[];
  customSavingsShare?: number;
}

export interface ArgonDecision {
  lumpSumPounds: number;
  monthlySurplusPounds: number;
  monthlyIncomePounds: number;
  riskProfile: ArgonRiskProfile;
  savingsSharePercent: number;
  investmentsSharePercent: number;
  savingsNowPounds: number;
  invNowPounds: number;
  savingsAddPounds: number;
  invAddPounds: number;
  rates: {
    sLow: number;
    sBase: number;
    sHigh: number;
    iLow: number;
    iBase: number;
    iHigh: number;
  };
  selectedBankIds: string[];
  selectedStockIds: string[];
  bankAllocations: BankAllocationItem[];
  stockAllocations: StockAllocationItem[];
  rationale: string;
  rationaleBullets: string[];
  decidedBy: 'argon-engine' | 'gemini-4-argon';
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Splits an integer pound total across weighted buckets so the integer amounts
 * sum to `totalPounds` with zero rounding drift.
 */
function splitExactPounds(totalPounds: number, weights: number[], caps?: number[]): number[] {
  const cleanTotal = Math.max(0, Math.round(totalPounds));
  const n = weights.length;
  if (n === 0) return [];
  if (cleanTotal === 0) return new Array(n).fill(0);

  const safeWeights = weights.map((w) => Math.max(0.01, Number.isFinite(w) ? w : 1));
  const weightSum = safeWeights.reduce((a, b) => a + b, 0);

  const raw = safeWeights.map((w) => (cleanTotal * w) / weightSum);
  const out = raw.map((x) => Math.floor(x));
  let rem = cleanTotal - out.reduce((a, b) => a + b, 0);

  const order = raw
    .map((x, idx) => ({ idx, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);

  for (const item of order) {
    if (rem <= 0) break;
    out[item.idx] += 1;
    rem -= 1;
  }

  // Respect per-product caps if provided and redistribute overflow to uncapped buckets
  if (caps && caps.some((c) => Number.isFinite(c))) {
    let overflow = 0;
    for (let i = 0; i < n; i++) {
      const cap = caps[i];
      if (cap !== undefined && out[i] > cap) {
        overflow += out[i] - cap;
        out[i] = cap;
      }
    }
    if (overflow > 0) {
      for (let pass = 0; pass < 3 && overflow > 0; pass++) {
        for (let i = 0; i < n && overflow > 0; i++) {
          const cap = caps[i] ?? Infinity;
          const room = Math.max(0, cap - out[i]);
          if (room > 0) {
            const add = Math.min(room, overflow);
            out[i] += add;
            overflow -= add;
          }
        }
      }
      // If all chosen buckets hit caps, put remainder in the first bucket so total is still exact
      if (overflow > 0) out[0] += overflow;
    }
  }

  return out;
}

const SAVINGS_SHARE_BY_RISK: Record<ArgonRiskProfile, number> = {
  conservative: 0.75,
  balanced: 0.60,
  growth: 0.45,
};

/**
 * Deterministic Argon decision engine: takes the user's lump sum budget (and optional monthly
 * surplus/income) and computes the exact pound split across Savings and Investments, the
 * exact delivery to real UK bank products and real stock/ETF investments, and the resulting
 * weighted Low/Base/High rates.
 */
export function decideArgonAllocation(input: ArgonDecisionInput): ArgonDecision {
  const lumpSumPounds = Math.max(0, Math.round(Number.isFinite(input.lumpSumPounds) ? input.lumpSumPounds : 3900));
  const riskProfile: ArgonRiskProfile = input.riskProfile ?? 'balanced';

  // Default monthly surplus scales sensibly with lump sum if not explicitly provided
  const defaultMonthlySurplus = lumpSumPounds > 0 ? Math.min(600, Math.max(100, Math.round((lumpSumPounds * 0.064) / 10) * 10)) : 250;
  const monthlySurplusPounds = Math.max(
    0,
    Math.round(input.monthlySurplusPounds !== undefined && Number.isFinite(input.monthlySurplusPounds) ? input.monthlySurplusPounds : defaultMonthlySurplus),
  );
  const monthlyIncomePounds = Math.max(
    0,
    Math.round(input.monthlyIncomePounds !== undefined && Number.isFinite(input.monthlyIncomePounds) ? input.monthlyIncomePounds : 450),
  );

  const rawSavingsShare = input.customSavingsShare !== undefined
    ? Math.min(0.95, Math.max(0.05, input.customSavingsShare))
    : SAVINGS_SHARE_BY_RISK[riskProfile];

  const savingsNowPounds = Math.round(lumpSumPounds * rawSavingsShare);
  const invNowPounds = lumpSumPounds - savingsNowPounds;

  const savingsAddPounds = Math.round(monthlySurplusPounds * rawSavingsShare);
  const invAddPounds = monthlySurplusPounds - savingsAddPounds;

  const savingsSharePercent = lumpSumPounds > 0 ? Math.round((savingsNowPounds / lumpSumPounds) * 100) : Math.round(rawSavingsShare * 100);
  const investmentsSharePercent = 100 - savingsSharePercent;

  // Resolve selected bank products (at least 1)
  const chosenBanks = BANK_PRODUCTS.filter((b) => (input.selectedBankIds ?? DEFAULT_SELECTED_BANKS).includes(b.id));
  const activeBanks = chosenBanks.length > 0 ? chosenBanks : BANK_PRODUCTS.slice(0, 3);

  // Resolve selected stock products (at least 1)
  const chosenStocks = STOCK_PRODUCTS.filter((s) => (input.selectedStockIds ?? DEFAULT_SELECTED_STOCKS).includes(s.id));
  const activeStocks = chosenStocks.length > 0 ? chosenStocks : STOCK_PRODUCTS.slice(0, 3);

  // Allocate lump sum savings across active banks (respecting regular saver lump-sum caps)
  const bankLumpWeights = activeBanks.map((b) => (b.category === 'regular_saver' && activeBanks.length > 1 ? 0.05 : b.defaultWeight));
  const bankLumpCaps = activeBanks.map((b) => b.maxLumpSumPounds);
  const bankLumpAmounts = splitExactPounds(savingsNowPounds, bankLumpWeights, bankLumpCaps);

  // Allocate monthly savings across active banks (prioritising high-rate regular savers)
  const bankMonthlyWeights = activeBanks.map((b) => (b.category === 'regular_saver' ? b.defaultWeight * 2.4 : b.defaultWeight));
  const bankMonthlyCaps = activeBanks.map((b) => b.maxMonthlyPounds);
  const bankMonthlyAmounts = splitExactPounds(savingsAddPounds, bankMonthlyWeights, bankMonthlyCaps);

  const bankAllocations: BankAllocationItem[] = activeBanks.map((product, i) => {
    const lump = bankLumpAmounts[i] ?? 0;
    const monthly = bankMonthlyAmounts[i] ?? 0;
    const weightDenom = savingsNowPounds + savingsAddPounds * 12;
    const itemWeight = weightDenom > 0 ? ((lump + monthly * 12) / weightDenom) * 100 : 100 / activeBanks.length;
    const reason =
      product.category === 'cash_isa'
        ? `Holds £${lump.toLocaleString('en-GB')} tax-free at ${product.aerBase.toFixed(2)}% AER with instant access.`
        : product.category === 'regular_saver'
          ? `Drips £${monthly.toLocaleString('en-GB')}/mo into a fixed ${product.aerBase.toFixed(2)}% AER 12-month saver.`
          : `Instant-access emergency buffer (£${lump.toLocaleString('en-GB')}) earning ${product.aerBase.toFixed(2)}% AER.`;
    return {
      product,
      lumpSumPounds: lump,
      monthlyPounds: monthly,
      sharePercent: Math.round(itemWeight),
      reason,
    };
  });

  // Allocate lump sum & monthly investments across active stocks/ETFs
  const stockWeights = activeStocks.map((s) => s.defaultWeight);
  const stockLumpAmounts = splitExactPounds(invNowPounds, stockWeights);
  const stockMonthlyAmounts = splitExactPounds(invAddPounds, stockWeights);

  const stockAllocations: StockAllocationItem[] = activeStocks.map((product, i) => {
    const lump = stockLumpAmounts[i] ?? 0;
    const monthly = stockMonthlyAmounts[i] ?? 0;
    const weightDenom = invNowPounds + invAddPounds * 12;
    const itemWeight = weightDenom > 0 ? ((lump + monthly * 12) / weightDenom) * 100 : 100 / activeStocks.length;
    const reason =
      product.category === 'blue_chip_stock'
        ? `Capped satellite slice (£${lump.toLocaleString('en-GB')} now + £${monthly}/mo) for higher upside.`
        : `Core ${product.ticker} index holding (£${lump.toLocaleString('en-GB')} now + £${monthly}/mo, ${product.ocfPercent}% OCF).`;
    return {
      product,
      lumpSumPounds: lump,
      monthlyPounds: monthly,
      sharePercent: Math.round(itemWeight),
      reason,
    };
  });

  // Compute capital-weighted Low / Base / High annual rates across 12-month deployed capital
  const totalBankDeployed = bankAllocations.reduce((s, a) => s + a.lumpSumPounds + a.monthlyPounds * 6, 0);
  const weightedBankRate = (pick: (p: BankProduct) => number): number => {
    if (totalBankDeployed <= 0) {
      return round2(activeBanks.reduce((s, b) => s + pick(b), 0) / activeBanks.length);
    }
    const sum = bankAllocations.reduce((s, a) => s + (a.lumpSumPounds + a.monthlyPounds * 6) * pick(a.product), 0);
    return round2(sum / totalBankDeployed);
  };

  const totalStockDeployed = stockAllocations.reduce((s, a) => s + a.lumpSumPounds + a.monthlyPounds * 6, 0);
  const weightedStockRate = (pick: (p: StockProduct) => number): number => {
    if (totalStockDeployed <= 0) {
      return round2(activeStocks.reduce((s, st) => s + pick(st), 0) / activeStocks.length);
    }
    const sum = stockAllocations.reduce((s, a) => s + (a.lumpSumPounds + a.monthlyPounds * 6) * pick(a.product), 0);
    return round2(sum / totalStockDeployed);
  };

  const rates = {
    sLow: weightedBankRate((b) => b.aerLow),
    sBase: weightedBankRate((b) => b.aerBase),
    sHigh: weightedBankRate((b) => b.aerHigh),
    iLow: weightedStockRate((s) => s.returnLow),
    iBase: weightedStockRate((s) => s.returnBase),
    iHigh: weightedStockRate((s) => s.returnHigh),
  };

  const bankSummaryParts = bankAllocations.map((b) => {
    const amt =
      b.lumpSumPounds > 0
        ? `£${b.lumpSumPounds.toLocaleString('en-GB')}${b.monthlyPounds > 0 ? ` + £${b.monthlyPounds}/mo` : ''}`
        : `+£${b.monthlyPounds}/mo`;
    return `${b.product.provider} (${amt} @ ${b.product.aerBase.toFixed(2)}% AER)`;
  });
  const stockSummaryParts = stockAllocations.map((s) => {
    const amt = `£${s.lumpSumPounds.toLocaleString('en-GB')}${s.monthlyPounds > 0 ? ` + £${s.monthlyPounds}/mo` : ''}`;
    return `${s.product.provider} ${s.product.ticker} (${amt} @ ${s.product.returnBase.toFixed(1)}% base)`;
  });

  const strategyNote =
    riskProfile === 'conservative'
      ? 'Prioritises capital preservation with 75% in FSCS-protected UK cash and 25% in global index trackers.'
      : riskProfile === 'growth'
        ? 'Tilts toward long-term compounding (55% equities) while keeping a 45% instant-access cash buffer.'
        : 'Balances liquid emergency savings (60% FSCS-protected cash) with tax-free ISA equity growth (40%).';

  const rationaleBullets = [
    `Capital Split: £${savingsNowPounds.toLocaleString('en-GB')} (${savingsSharePercent}%) to UK bank savings and £${invNowPounds.toLocaleString('en-GB')} (${investmentsSharePercent}%) to stock/ETF investments (+£${savingsAddPounds}/mo savings, +£${invAddPounds}/mo investing).`,
    `Bank Delivery (${rates.sBase.toFixed(2)}% blended AER): ${bankSummaryParts.join(' · ')}.`,
    `Equity Delivery (${rates.iBase.toFixed(2)}% base return): ${stockSummaryParts.join(' · ')}.`,
    `Strategy Rationale: ${strategyNote}`,
  ];

  const rationale = rationaleBullets.join(' ');

  return {
    lumpSumPounds,
    monthlySurplusPounds,
    monthlyIncomePounds,
    riskProfile,
    savingsSharePercent,
    investmentsSharePercent,
    savingsNowPounds,
    invNowPounds,
    savingsAddPounds,
    invAddPounds,
    rates,
    selectedBankIds: activeBanks.map((b) => b.id),
    selectedStockIds: activeStocks.map((s) => s.id),
    bankAllocations,
    stockAllocations,
    rationale,
    rationaleBullets,
    decidedBy: 'argon-engine',
  };
}

/**
 * Extracts the user's lump sum budget, monthly surplus, and expected monthly income
 * from the active `EngineState` (or `mrmoney.onboardingExtras` fallback).
 */
export function extractSeedFromEngineState(state: EngineState | null): {
  lumpSumPounds: number;
  monthlySurplusPounds: number;
  monthlyIncomePounds: number;
} {
  if (state) {
    const fundsPounds = Math.round((state.profile.funds?.pence ?? 0) / 100);
    const lumpSumPounds = fundsPounds > 0 ? fundsPounds : 3900;

    // Sum monthly incomes or estimate from state.incomes
    const totalIncomesPounds = state.incomes.reduce((acc, inc) => acc + Math.round(inc.amount.pence / 100), 0);
    const monthlyIncomePounds = totalIncomesPounds > 0 ? totalIncomesPounds : 450;

    // Derive monthly contribution capacity from planned savings goal or 6.5% of lump sum
    const goalPounds = Math.round((state.profile.savingsGoal?.pence ?? 0) / 100);
    const monthlySurplusPounds = goalPounds >= 50 ? goalPounds : Math.min(600, Math.max(120, Math.round((lumpSumPounds * 0.064) / 10) * 10));

    return { lumpSumPounds, monthlySurplusPounds, monthlyIncomePounds };
  }

  // Fallback when no EngineState is hydrated yet: check localStorage onboardingExtras
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('mrmoney.onboardingExtras');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const cs = Number(parsed.currentSavings ?? 0);
        const ci = Number(parsed.currentInvestments ?? 0);
        const combined = Math.round((Number.isFinite(cs) ? cs : 0) + (Number.isFinite(ci) ? ci : 0));
        if (combined >= 100) {
          return {
            lumpSumPounds: combined,
            monthlySurplusPounds: Math.max(100, Math.round(combined * 0.065)),
            monthlyIncomePounds: 450,
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {
    lumpSumPounds: 3900,
    monthlySurplusPounds: 250,
    monthlyIncomePounds: 450,
  };
}
