/**
 * quick_plan args (+ the server-attached menu) -> a 12-month itemised engine plan: income arrives monthly from today,
 * rent goes out the same day, and every day's food is a planned purchase traced to a real deal. Pure.
 */
import { gbp, type Category, type Commitment, type ISODate, type Profile } from '@/lib/engine';
import { lifestyleNumbers, lifestyleSchedule, yearEnd } from './schedule';
import type { Lifestyle, LifestyleMenu } from './types';

export interface LifestylePlanInput {
  monthlyIncomePence: number;
  monthlyRentPence: number;
  lifestyle: Lifestyle;
  menu: LifestyleMenu;
}

const CATEGORIES: Category[] = [
  { id: 'groceries', name: 'Groceries', weight: 1, priority: 1, essential: true },
  { id: 'eating-out', name: 'Eating out', weight: 1, priority: 2, essential: false },
  { id: 'transport', name: 'Transport', weight: 1, priority: 3, essential: false },
  { id: 'shopping', name: 'Shopping', weight: 1, priority: 4, essential: false },
  { id: 'social', name: 'Social', weight: 1, priority: 5, essential: false },
];

export function buildLifestylePlan(a: LifestylePlanInput, today: ISODate) {
  const end = yearEnd(today);
  const day = Number(today.slice(8, 10));
  const profile: Profile = {
    funds: gbp(a.monthlyIncomePence), fundsType: 'monthly', allowanceDay: day, openingBalance: gbp(0),
    planStart: today, horizonEnd: end, minimumReserve: gbp(0), savingsGoal: gbp(0),
    categories: CATEGORIES.map((c) => ({ ...c })), hasJob: false, allocationMode: 'itemised',
  };
  const commitments: Commitment[] = a.monthlyRentPence > 0
    ? [{ id: 'rent', name: 'Rent', amount: gbp(a.monthlyRentPence), locked: true, recurrence: { kind: 'monthly', dayOfMonth: day } }]
    : [];
  const purchases = lifestyleSchedule(a.menu, a.lifestyle, today, end, { groceries: 'groceries', eatingOut: 'eating-out' });
  const numbers = lifestyleNumbers(a.menu, a.lifestyle, a.monthlyIncomePence, a.monthlyRentPence, today, end);
  return { profile, commitments, purchases, numbers };
}
