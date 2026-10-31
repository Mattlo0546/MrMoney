/**
 * Finance agent ("Money") types. The profile lives in the browser (localStorage) and is sent with every turn;
 * the server never stores it. All money is integer pence (GBP); rates are percent AER (3.25 = 3.25%).
 */
import { z } from 'zod';
import { isoDateSchema, MAX_AGENT_PENCE, type ResearchResult } from '@/lib/agent/types';

const pence = z.number().int('Amount must be whole pence').min(0).max(MAX_AGENT_PENCE);
const rate = z.number().min(0).max(25);
const shortText = (max = 80) => z.string().trim().min(1).max(max);

export const ShortGoalSchema = z.object({
  label: shortText(60),
  amountPence: pence,
  byDate: isoDateSchema,
});
export type ShortGoal = z.infer<typeof ShortGoalSchema>;

export const FinanceProfileSchema = z.object({
  age: z.number().int().min(16).max(80).optional(),
  /** Cash in savings (not the current account float). */
  cashSavingsPence: pence,
  /** AER the cash currently earns. */
  cashRatePercent: rate,
  /** Paid bank plan (e.g. Monzo Perks £9 = 900). 0 = none. */
  bankPlanFeeMonthlyPence: pence,
  /** AER the same cash would earn without the paid plan. */
  freePlanRatePercent: rate,
  /** Left over each month after rent, bills and food. */
  monthlySurplusPence: pence,
  /** Rent + bills + food per month: sizes the emergency fund. */
  essentialMonthlyCostsPence: pence,
  emergencyMonths: z.number().int().min(1).max(6),
  investedPence: pence,
  monthlyInvestPence: pence,
  investWrapper: z.enum(['isa', 'gia', 'unknown']),
  /** Platform + fund fees, % a year. */
  investFeePercent: z.number().min(0).max(5),
  investFund: z.string().trim().max(60).optional(),
  cryptoPence: pence,
  /** Credit cards, BNPL, loans with interest (not the student loan). */
  highInterestDebtPence: pence,
  usingOverdraft: z.boolean(),
  houseGoal: z.boolean(),
  shortGoals: z.array(ShortGoalSchema).max(5),
});
export type FinanceProfile = z.infer<typeof FinanceProfileSchema>;

/** The user's setup at the time of the research brief (Monzo Perks 3.25%, £100/month S&P 500, ~1% crypto). */
export const DEFAULT_PROFILE: FinanceProfile = {
  cashSavingsPence: 500000,
  cashRatePercent: 3.25,
  bankPlanFeeMonthlyPence: 900,
  freePlanRatePercent: 2.75,
  monthlySurplusPence: 25000,
  essentialMonthlyCostsPence: 90000,
  emergencyMonths: 2,
  investedPence: 120000,
  monthlyInvestPence: 10000,
  investWrapper: 'unknown',
  investFeePercent: 0.07,
  investFund: 'S&P 500 index fund',
  cryptoPence: 7000,
  highInterestDebtPence: 0,
  usingOverdraft: false,
  houseGoal: false,
  shortGoals: [],
};

// ---------------------------------------------------------------- allocation engine output

export type Bucket = 'debt' | 'overdraft' | 'emergency_fund' | 'short_goals' | 'lifetime_isa' | 'index_fund' | 'speculative';

export interface AllocationLine {
  bucket: Bucket;
  label: string;
  pence: number;
  reason: string;
}

export type CheckLevel = 'ok' | 'warn' | 'act';
export interface Check {
  id: 'bank_plan' | 'wrapper' | 'fees' | 'crypto' | 'emergency_fund' | 'debt' | 'overdraft' | 'lifetime_isa';
  level: CheckLevel;
  title: string;
  detail: string;
  /** £ per year at stake, when there is one (positive = you'd gain by acting). */
  yearlyPence?: number;
}

export interface Allocation {
  monthlySurplusPence: number;
  lines: AllocationLine[];
  emergencyTargetPence: number;
  emergencyGapPence: number;
  /** Months to fill the emergency fund at this split (null = already full or nothing going in). */
  emergencyMonthsToFill: number | null;
  /** Crypto as % of invested + crypto. */
  cryptoSharePercent: number;
  checks: Check[];
  /** Cash interest a year at the current rate, net of any paid plan fee. */
  cashInterestYearlyPence: number;
  note: string;
}

export interface Comparison {
  label: string;
  balancePence: number;
  fromRatePercent: number;
  toRatePercent: number;
  /** Net change in £ a year (interest difference + fee change). */
  yearlyGainPence: number;
  worthSwitching: boolean;
  sourceRef?: string;
  detail: string;
}

// ---------------------------------------------------------------- tool args

export const FINANCE_RESEARCH_TOPICS = [
  'easy_access_savings', 'cash_isa', 'regular_savers', 'lifetime_isa', 'investment_platforms', 'index_funds', 'crypto_rules', 'bank_plans',
] as const;
export type FinanceResearchTopic = (typeof FINANCE_RESEARCH_TOPICS)[number];

export const FinanceResearchArgsSchema = z.object({
  topic: z.enum(FINANCE_RESEARCH_TOPICS),
  /** Extra detail for the search, e.g. "Monzo Perks price" or "accumulating FTSE All-World". */
  query: z.string().trim().max(200).optional(),
});

export const AllocateArgsSchema = z.object({
  /** What-if overrides; omit to use the saved profile. */
  monthlySurplusPence: pence.optional(),
  emergencyMonths: z.number().int().min(1).max(6).optional(),
});

export const CompareSavingsArgsSchema = z.object({
  label: shortText(80),
  toRatePercent: rate,
  /** Monthly fee of the new option (default 0). */
  toMonthlyFeePence: pence.optional(),
  /** Default: the profile's cash savings. */
  balancePence: pence.optional(),
  /** Research item ref the rate came from. */
  sourceRef: z.string().trim().max(80).optional(),
});

/** Partial profile update from what the user said in chat. */
export const UpdateProfileArgsSchema = FinanceProfileSchema.partial();

export const AskUserArgsSchema = z.object({
  question: shortText(300),
  options: z.array(shortText(40)).max(5).optional(),
});

// ---------------------------------------------------------------- request / response

export const MoneyMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(4000),
  /** Model-only summary of the cards on an assistant message (research refs, allocation), built by the client. */
  notes: z.string().max(1500).optional(),
});
export type MoneyMessage = z.infer<typeof MoneyMessageSchema>;

export const MoneyRequestSchema = z.object({
  messages: z.array(MoneyMessageSchema).min(1).max(40),
  profile: FinanceProfileSchema,
  today: isoDateSchema,
  stream: z.boolean().optional(),
});
export type MoneyRequest = z.infer<typeof MoneyRequestSchema>;

export type MoneyCard =
  | ({ id: string; type: 'research_results' } & ResearchResult)
  | { id: string; type: 'allocation'; allocation: Allocation }
  | { id: string; type: 'comparison'; comparison: Comparison }
  | { id: string; type: 'profile_updated'; fields: string[] }
  | { id: string; type: 'clarify'; question: string; chips: string[] }
  | { id: string; type: 'error'; message: string; retryable: boolean };

export interface MoneyResponse {
  text: string;
  cards: MoneyCard[];
  /** Present when the agent changed the profile; the client saves it. */
  profile?: FinanceProfile;
  phase: 'done' | 'error';
}

export type MoneyStatus = { phase: 'thinking' | 'researching' | 'calculating'; label: string; step: number };
