/**
 * setup_plan args -> the onboarding Form -> the existing onboarding builder (`buildPayload`), so the chat builds the
 * Profile exactly as the form did. Pure; no arithmetic beyond pence<->string formatting.
 * UI: `const { profile, commitments, incomes, extras } = buildSetupPayload(args, today)` then `store.completeOnboarding(...)`.
 */
import { buildPayload, defaultForm, type Form } from '@/components/onboarding/model';
import type { SetupPlanArgs } from './types';

const pounds = (p: number) => (p / 100).toFixed(2);

export function setupArgsToForm(a: SetupPlanArgs, today: string): Form {
  const base = defaultForm(today);
  const rank = (id: string) => {
    const i = (a.priorities as string[]).indexOf(id);
    return i === -1 ? 100 : i;
  };
  const flex = [...base.flex].sort((x, y) => rank(x.id) - rank(y.id));
  return {
    ...base,
    fundsType: a.fundsType,
    funds: pounds(a.funds),
    allowanceDay: String(a.allowanceDay ?? 1),
    openingBalance: '0',
    horizonEnd: a.horizonEnd,
    hasJob: false,
    jobDates: [],
    others: a.incomes.map((inc, i) => ({ id: `inc-${i}`, amount: pounds(inc.amountPence), date: inc.date, confirmed: inc.confirmed })),
    commits: a.commitments.map((c, i) => ({
      id: i === 0 && /rent/i.test(c.name) ? 'rent' : `commit-${i}`,
      name: c.name,
      amount: pounds(c.amountPence),
      recurrence: c.recurrence,
      day: String(c.dayOfMonth ?? 1),
      date: c.date ?? '',
    })),
    reserve: pounds(a.minimumReserve),
    goal: pounds(a.savingsGoal),
    food: pounds(a.foodWeeklyPence),
    transport: pounds(a.transportWeeklyPence),
    flex,
    city: a.city ?? '',
  };
}

export function buildSetupPayload(a: SetupPlanArgs, today: string) {
  const payload = buildPayload(setupArgsToForm(a, today), today);
  // Keep the model's income labels and job/other source (the form builder has no per-row label).
  payload.incomes = payload.incomes.map((inc, i) => ({ ...inc, source: a.incomes[i]?.source ?? 'other', note: a.incomes[i]?.label }));
  payload.profile.hasJob = a.incomes.some((i) => i.source === 'job');
  return payload;
}
