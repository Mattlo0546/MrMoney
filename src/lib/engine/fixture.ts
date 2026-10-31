/** Demo student (brief open decision 4; design spec §7). */
import { gbp } from './money';
import { generatePlan } from './plan';
import type { EngineState, ISODate } from './types';

export const DEMO_TODAY: ISODate = '2026-11-10';

export function demoBaseState(): EngineState {
  return {
    schemaVersion: 1,
    profile: {
      funds: gbp(390_000),
      fundsType: 'lump',
      planStart: DEMO_TODAY,
      horizonEnd: '2027-01-31',
      minimumReserve: gbp(50_000),
      savingsGoal: gbp(15_000),
      hasJob: false,
      // Weights are the onboarding daily amounts in pence (£9.00, £5.20, £5.50, £6.14).
      // Protect-first order: transport, groceries, eating out, shopping.
      // D16: essentials keep their full planned daily amount as a floor (£9.00 groceries,
      // £5.20 transport), so automatic reallocation and same-day "make room" never fund
      // other spending from food or travel.
      categories: [
        { id: 'groceries', name: 'Groceries', weight: 900, priority: 2, essential: true, minimumDaily: gbp(900) },
        { id: 'transport', name: 'Transport', weight: 520, priority: 1, essential: true, minimumDaily: gbp(520) },
        { id: 'eating-out', name: 'Eating out', weight: 550, priority: 3, essential: false },
        { id: 'shopping', name: 'Shopping', weight: 614, priority: 4, essential: false },
      ],
    },
    commitments: [
      // November rent (1 Nov) is before planStart, so it counts as already paid.
      { id: 'rent', name: 'Rent', amount: gbp(62_000), recurrence: { kind: 'monthly', dayOfMonth: 1 }, locked: true },
      { id: 'utilities', name: 'Utilities', amount: gbp(5_500), recurrence: { kind: 'monthly', dayOfMonth: 15 }, locked: true },
    ],
    incomes: [
      { id: 'family-transfer', amount: gbp(30_000), date: '2026-12-18', source: 'other', confirmed: true, note: 'Family transfer' },
    ],
    ledger: [],
    preferences: [],
    plannedPurchases: [],
    processedKeys: [],
    plan: null,
  };
}

/** The demo state with its plan computed for the demo date. */
export function demoFixture(): { today: ISODate; state: EngineState } {
  const state = demoBaseState();
  state.plan = generatePlan(state, DEMO_TODAY);
  return { today: DEMO_TODAY, state };
}
