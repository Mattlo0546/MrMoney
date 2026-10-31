import type { Category, Commitment, Income, Profile } from '@/lib/engine';

export interface IncomeRow { id: string; amount: string; date: string; confirmed: boolean }
export interface CommitRow { id: string; name: string; amount: string; recurrence: 'monthly' | 'once'; day: string; date: string }
export interface FlexCat { id: string; name: string; on: boolean; weight: number }

export interface Form {
  fundsType: 'lump' | 'monthly';
  funds: string;
  allowanceDay: string;
  openingBalance: string;
  horizonEnd: string;
  hasJob: boolean;
  jobAmount: string;
  jobDates: { id: string; date: string }[];
  jobConfirmed: boolean;
  others: IncomeRow[];
  commits: CommitRow[]; // commits[0] is always rent
  reserve: string;
  goal: string;
  savings: string;
  investments: string;
  food: string;
  transport: string;
  flex: FlexCat[]; // order = priority order
  city: string;
  diet: string;
  memberships: string[];
}

export type Errors = Record<string, string>;

export const STEPS = [
  { slug: 'welcome', title: 'Know what you can spend today.' },
  { slug: 'funds', title: 'How much money do you have?' },
  { slug: 'last-until', title: 'When does it need to last until?' },
  { slug: 'job', title: 'Do you have a job?' },
  { slug: 'other-income', title: 'Any other money coming in?' },
  { slug: 'rent', title: 'What goes out every month?' },
  { slug: 'reserve', title: 'What is your minimum safety cushion?' },
  { slug: 'savings', title: 'Saving for something?' },
  { slug: 'food-transport', title: 'What do food and travel usually cost?' },
  { slug: 'priorities', title: 'What matters most to you?' },
] as const;

export const MEMBERSHIPS = ['UNiDAYS', 'Student Beans', 'TOTUM card', '16-25 Railcard', 'Amazon Prime Student'];
export const DIETS = ['', 'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free'];

let counter = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Pounds string to integer pence; null when not a valid amount. Parsing only, no budget maths. */
export function toPence(s: string): number | null {
  const t = s.trim().replace(/^£/, '').replace(/,/g, '');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
}
const gbp = (pence: number) => ({ pence, currency: 'GBP' as const });

export function defaultForm(today: string): Form {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 5);
  return {
    fundsType: 'lump', funds: '3000', allowanceDay: '1', openingBalance: '0',
    horizonEnd: d.toISOString().slice(0, 10),
    hasJob: false, jobAmount: '600', jobDates: [{ id: uid('jd'), date: '' }], jobConfirmed: false,
    others: [],
    commits: [{ id: 'rent', name: 'Rent', amount: '500', recurrence: 'monthly', day: '1', date: '' }],
    reserve: '200', goal: '300', savings: '0', investments: '0', food: '35', transport: '12',
    flex: [
      { id: 'eating-out', name: 'Eating out', on: true, weight: 3850 },
      { id: 'shopping', name: 'Shopping', on: true, weight: 4300 },
      { id: 'books', name: 'Books and course costs', on: true, weight: 1500 },
      { id: 'social', name: 'Social and fun', on: true, weight: 2500 },
    ],
    city: '', diet: '', memberships: [],
  };
}

const validMoney = (s: string) => toPence(s) !== null;
const validDay = (s: string) => /^\d+$/.test(s.trim()) && +s >= 1 && +s <= 31;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const MONEY = 'Enter an amount in pounds, like 25 or 25.50.';

export function validateStep(step: number, f: Form, today: string): Errors {
  const e: Errors = {};
  if (step === 1) {
    if (!validMoney(f.funds)) e.funds = MONEY;
    if (f.fundsType === 'monthly') {
      if (!validDay(f.allowanceDay)) e.allowanceDay = 'Pick a day between 1 and 31.';
      if (f.openingBalance.trim() && !validMoney(f.openingBalance)) e.openingBalance = MONEY;
    }
  } else if (step === 2) {
    if (!validDate(f.horizonEnd)) e.horizonEnd = 'Choose the date your money needs to last until.';
    else if (f.horizonEnd <= today) e.horizonEnd = 'Choose a date after today.';
  } else if (step === 3 && f.hasJob) {
    if (!validMoney(f.jobAmount)) e.jobAmount = MONEY;
    f.jobDates.forEach((d, i) => { if (!validDate(d.date)) e[`jobDate.${i}`] = 'Choose a pay date.'; });
  } else if (step === 4) {
    f.others.forEach((r, i) => {
      if (!validMoney(r.amount)) e[`other.${i}.amount`] = MONEY;
      if (!validDate(r.date)) e[`other.${i}.date`] = 'Choose a date.';
    });
  } else if (step === 5) {
    f.commits.forEach((c, i) => {
      if (!c.name.trim()) e[`commit.${i}.name`] = 'Give this a name.';
      if (!validMoney(c.amount)) e[`commit.${i}.amount`] = MONEY;
      if (c.recurrence === 'monthly' && !validDay(c.day)) e[`commit.${i}.day`] = 'Pick a day, 1 to 31.';
      if (c.recurrence === 'once' && !validDate(c.date)) e[`commit.${i}.date`] = 'Choose a due date.';
    });
  } else if (step === 6) {
    if (!validMoney(f.reserve)) e.reserve = MONEY;
  } else if (step === 7) {
    if (!validMoney(f.goal)) e.goal = MONEY;
    if (f.savings.trim() && !validMoney(f.savings)) e.savings = MONEY;
    if (f.investments.trim() && !validMoney(f.investments)) e.investments = MONEY;
  } else if (step === 8) {
    if (!validMoney(f.food)) e.food = MONEY;
    if (!validMoney(f.transport)) e.transport = MONEY;
  }
  return e;
}

export function stepOfField(key: string): number {
  if (/^(funds|fundsType|allowanceDay|openingBalance)$/.test(key)) return 1;
  if (/^(horizonEnd|planStart)$/.test(key)) return 2;
  if (/^job/.test(key)) return 3;
  if (/^other\./.test(key)) return 4;
  if (/^commit\./.test(key)) return 5;
  if (key === 'minimumReserve' || key === 'reserve') return 6;
  if (key === 'savingsGoal' || key === 'goal') return 7;
  if (key === 'categories') return 8;
  return 9;
}

/** Map engine error keys (profile fields, commitments.i.x, incomes.i.x) to form field ids. */
export function mapEngineErrors(errs: Record<string, string>, jobCount: number): Errors {
  const out: Errors = {};
  for (const [k, msg] of Object.entries(errs)) {
    let m: RegExpExecArray | null;
    if ((m = /^commitments\.(\d+)\.(amount|date|dayOfMonth)$/.exec(k))) out[`commit.${m[1]}.${m[2] === 'dayOfMonth' ? 'day' : m[2]}`] = msg;
    else if ((m = /^incomes\.(\d+)\.(amount|date)$/.exec(k))) {
      const i = +m[1];
      out[i < jobCount ? (m[2] === 'amount' ? 'jobAmount' : `jobDate.${i}`) : `other.${i - jobCount}.${m[2]}`] = msg;
    } else if (k === 'minimumReserve') out.reserve = msg;
    else if (k === 'savingsGoal') out.goal = msg;
    else out[k] = msg;
  }
  return out;
}

export function buildPayload(f: Form, today: string): { profile: Profile; commitments: Commitment[]; incomes: Income[]; extras: Record<string, unknown> } {
  const p = (s: string) => toPence(s) ?? 0;
  const flexOn = f.flex.filter((c) => c.on);
  const categories: Category[] = [
    { id: 'transport', name: 'Transport', weight: p(f.transport), priority: 1, essential: true },
    { id: 'groceries', name: 'Groceries', weight: p(f.food), priority: 2, essential: true },
    ...flexOn.map((c, i) => ({ id: c.id, name: c.name, weight: c.weight, priority: 3 + i, essential: false })),
  ];
  const monthly = f.fundsType === 'monthly';
  const profile: Profile = {
    funds: gbp(p(f.funds)), fundsType: f.fundsType,
    ...(monthly ? { allowanceDay: Number(f.allowanceDay), openingBalance: gbp(p(f.openingBalance)) } : {}),
    planStart: today, horizonEnd: f.horizonEnd,
    minimumReserve: gbp(p(f.reserve)), savingsGoal: gbp(p(f.goal)), categories, hasJob: f.hasJob,
  };
  const commitments: Commitment[] = f.commits.map((c) => ({
    id: c.id, name: c.name.trim(), amount: gbp(p(c.amount)), locked: true,
    recurrence: c.recurrence === 'monthly' ? { kind: 'monthly', dayOfMonth: Number(c.day) } : { kind: 'once', date: c.date },
  }));
  const incomes: Income[] = [
    ...(f.hasJob ? f.jobDates.map((d): Income => ({ id: uid('job'), amount: gbp(p(f.jobAmount)), date: d.date, source: 'job', confirmed: f.jobConfirmed, note: 'Job pay' })) : []),
    ...f.others.map((r): Income => ({ id: uid('inc'), amount: gbp(p(r.amount)), date: r.date, source: 'other', confirmed: r.confirmed })),
  ];
  return {
    profile, commitments, incomes,
    extras: { currentSavings: gbp(p(f.savings)), currentInvestments: gbp(p(f.investments)), city: f.city.trim(), diet: f.diet, memberships: f.memberships },
  };
}
