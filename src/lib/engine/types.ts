/**
 * StudentPlan engine types. Pure data, JSON-safe (structuredClone-able).
 * Money is always integer pence with an explicit currency.
 * Dates are ISO calendar days (YYYY-MM-DD, Europe/London), never times.
 */

export type Currency = 'GBP';
export interface Money {
  readonly pence: number;
  readonly currency: Currency;
}
export type ISODate = string;
export type CategoryId = string;

/** A flexible spending category. priority 1 = most protected. */
export interface Category {
  id: CategoryId;
  name: string;
  /** Non-negative relative weight; the daily amount is split by weight. */
  weight: number;
  /** 1 = most protected; reallocation takes from the highest number first. */
  priority: number;
  /** Essentials (e.g. groceries, transport) are taken from last. */
  essential: boolean;
  /** Optional daily floor for essentials; automatic reallocation never goes below it. */
  minimumDaily?: Money;
}

export interface Profile {
  /** Lump sum (lump) or the amount of each monthly allowance (monthly). */
  funds: Money;
  fundsType: 'lump' | 'monthly';
  /** Monthly mode: day of month the allowance arrives (clamped to month length). Default 1. */
  allowanceDay?: number;
  /** Monthly mode: cash already in hand at planStart. Default 0. */
  openingBalance?: Money;
  /** First day of the plan. Commitments before it are treated as already paid. */
  planStart: ISODate;
  /** Last day the money must last (inclusive). */
  horizonEnd: ISODate;
  minimumReserve: Money;
  savingsGoal: Money;
  categories: Category[];
  hasJob: boolean;
}

export type Recurrence =
  | { kind: 'once'; date: ISODate }
  | { kind: 'monthly'; dayOfMonth: number; startDate?: ISODate; endDate?: ISODate };

export interface Commitment {
  id: string;
  name: string;
  amount: Money;
  recurrence: Recurrence;
  locked: boolean;
  /** Amount changes effective from a date (inclusive), sorted by `from`. */
  amountChanges?: { from: ISODate; amount: Money }[];
}

export interface Income {
  id: string;
  amount: Money;
  date: ISODate;
  source: 'job' | 'other';
  /** Only confirmed income feeds the plan. */
  confirmed: boolean;
  note?: string;
}

export interface Transaction {
  id: string;
  idempotencyKey: string;
  date: ISODate;
  amount: Money;
  kind: 'expense' | 'income';
  /** Expense category: a flexible category id or any other label (e.g. 'household'). */
  category?: CategoryId;
  note?: string;
}

/** "Keep £X available for <date>": that day's unspent allowance stays >= amount. */
export interface Preference {
  id: string;
  kind: 'keepAvailable';
  date: ISODate;
  amount: Money;
  label?: string;
}

/** An applied hypothetical: money set aside on a day for a planned purchase. */
export interface PlannedPurchase {
  id: string;
  date: ISODate;
  category: CategoryId;
  amount: Money;
  label: string;
}

export interface Allocation {
  day: ISODate;
  category: CategoryId;
  /** Flexible money planned for this day and category (>= what is used). */
  planned: Money;
  /** Sum of ledger expenses for this day and category. */
  actual: Money;
}

export type DeficitKind =
  | 'savings-unfunded'
  | 'reserve-short'
  | 'bills-short'
  | 'cash-timing'
  | 'essentials';

export interface DeficitItem {
  kind: DeficitKind;
  amount: Money;
  date?: ISODate;
  reason: string;
}

export interface Summary {
  /** Cash now: start-of-today balance plus today's inflows minus today's bills and actuals. */
  balance: Money;
  reservedForCommitments: Money;
  reserve: Money;
  /** Savings goal that the plan funds (goal minus any unfunded part). */
  plannedSavings: Money;
  /** Flexible money not yet spent from today on (planned purchases still count as unspent). */
  flexibleRemaining: Money;
  /** Money set aside for planned purchases from today on. */
  earmarked: Money;
  todayAllowance: Money;
  /** Today's allowance minus today's actuals and planned purchases. */
  todayRemaining: Money;
  todaySpent: Money;
  futureIncome: Money;
}

export interface Plan {
  computedFor: ISODate;
  allocations: Allocation[];
  summary: Summary;
  unallocated: Money;
  unallocatedReasons: string[];
  /** Money missing overall (protected + spent > funds). Enters invariant I1. */
  fundingGap: Money;
  deficits: DeficitItem[];
}

export interface EngineState {
  schemaVersion: 1;
  profile: Profile;
  commitments: Commitment[];
  incomes: Income[];
  ledger: Transaction[];
  preferences: Preference[];
  plannedPurchases: PlannedPurchase[];
  /** Idempotency keys of every applied intent. */
  processedKeys: string[];
  plan: Plan | null;
}

// ---------- Intents (the six R-nl intents, plus explicit settings edits) ----------

interface IntentBase {
  idempotencyKey: string;
}
export interface ExpenseIntent extends IntentBase {
  kind: 'expense';
  amount: Money;
  date: ISODate;
  category: CategoryId;
  note?: string;
}
export interface HypotheticalIntent extends IntentBase {
  kind: 'hypothetical';
  amount: Money;
  date: ISODate;
  category: CategoryId;
  label?: string;
  /** Chosen trade-off option id when the request does not fit. */
  tradeoffOptionId?: string;
}
export interface IncomeIntent extends IntentBase {
  kind: 'income';
  amount: Money;
  date: ISODate;
  note?: string;
}
export type CommitmentChangeOp =
  | { op: 'adjust'; target: string; delta: Money; effectiveFrom: ISODate }
  | { op: 'set'; target: string; amount: Money; effectiveFrom: ISODate }
  | { op: 'add'; name: string; amount: Money; recurrence: Recurrence }
  | { op: 'remove'; target: string; effectiveFrom: ISODate };
export interface CommitmentChangeIntent extends IntentBase {
  kind: 'commitmentChange';
  change: CommitmentChangeOp;
}
export interface PreferenceIntent extends IntentBase {
  kind: 'preference';
  date: ISODate;
  amount: Money;
  label?: string;
}
export interface GoalIntent extends IntentBase {
  kind: 'goal';
  /** Additional amount to save. */
  amount: Money;
  byDate?: ISODate;
}
export interface SettingsEditIntent extends IntentBase {
  kind: 'settingsEdit';
  patch: Partial<Pick<Profile, 'minimumReserve' | 'savingsGoal' | 'horizonEnd' | 'categories'>>;
}

export type Intent =
  | ExpenseIntent
  | HypotheticalIntent
  | IncomeIntent
  | CommitmentChangeIntent
  | PreferenceIntent
  | GoalIntent
  | SettingsEditIntent;

// ---------- Diff / results ----------

export interface CellChange {
  day: ISODate;
  category: CategoryId;
  field: 'planned' | 'actual';
  from: Money;
  to: Money;
}

export interface CategoryMove {
  category: CategoryId;
  categoryName: string;
  amount: Money;
  days: ISODate[];
}

export interface ProtectedSnapshot {
  commitments: { id: string; name: string; total: Money }[];
  minimumReserve: Money;
  savingsGoal: Money;
}

export interface ChangeSet {
  intentKind: Intent['kind'];
  today: ISODate;
  noop: boolean;
  /** The amount the intent carried (expense, request, income, goal, preference). */
  amount?: Money;
  target?: { day: ISODate; category: CategoryId; categoryName: string; label?: string };
  cellChanges: CellChange[];
  changedDays: ISODate[];
  /** Flexible money removed on OTHER days than the target day, by category. */
  sources: CategoryMove[];
  /** Flexible money added on other days than the target day, by category. */
  additions: CategoryMove[];
  /** Target day's other categories that were reduced (or increased) to make room. */
  sameDaySources: CategoryMove[];
  sameDayAdditions: CategoryMove[];
  /** Expense: part covered by the day's own allowance. */
  absorbed?: Money;
  /** Expense: part taken from later days. */
  overspend?: Money;
  /** Hypothetical: the day's remaining allowance before / after. */
  dayRemainingBefore?: Money;
  dayRemainingAfter?: Money;
  shortfall?: Money;
  commitment?: { name: string; before: Money; after: Money; effectiveFrom: ISODate; totalDelta: Money };
  savingsGoal?: { before: Money; after: Money };
  ledgerAdded: Transaction[];
  summaryBefore: Summary;
  summaryAfter: Summary;
  fundingGapBefore: Money;
  fundingGapAfter: Money;
  protectedBefore: ProtectedSnapshot;
  protectedAfter: ProtectedSnapshot;
  protectedUnchanged: boolean;
  /** True when the incremental change fell back to a full re-plan (cash constraint). */
  replanned: boolean;
}

export interface ExplanationFact {
  key: string;
  label: string;
  value?: Money;
  text?: string;
}
export interface Explanation {
  facts: ExplanationFact[];
  sentence: string;
}

export interface EngineError {
  code:
    | 'invalid'
    | 'out-of-range'
    | 'shortfall'
    | 'insufficient-flexible'
    | 'cash-constraint'
    | 'unknown-option';
  message: string;
  details?: unknown;
}
export interface Clarification {
  field: string;
  question: string;
}

export type ApplyResult =
  | { ok: true; nextState: EngineState; diff: ChangeSet; explanationFacts: Explanation }
  | { ok: false; error: EngineError; needsClarification?: undefined }
  | { ok: false; needsClarification: Clarification; error?: undefined };
