import { describe, expect, it } from 'vitest';
import { gbp, project, type ProjectionAssumptions } from '@/lib/engine';
import { demoFixture } from '@/lib/engine/fixture';
import {
  BANK_PRODUCTS,
  STOCK_PRODUCTS,
  decideArgonAllocation,
  extractSeedFromEngineState,
  type ArgonRiskProfile,
} from './products';
import { POST as decideRoutePost } from '@/app/api/projections/decide/route';

describe('Argon lump-sum allocator & real bank/stock catalog', () => {
  it('contains real UK bank savings products and real stock/ETF investments with valid rate bands', () => {
    expect(BANK_PRODUCTS.length).toBeGreaterThanOrEqual(6);
    for (const bank of BANK_PRODUCTS) {
      expect(bank.id).toBeTruthy();
      expect(bank.logoId).toBeTruthy();
      expect(bank.aerLow).toBeLessThanOrEqual(bank.aerBase);
      expect(bank.aerBase).toBeLessThanOrEqual(bank.aerHigh);
      expect(bank.fscsProtected).toBe(true);
    }

    expect(STOCK_PRODUCTS.length).toBeGreaterThanOrEqual(6);
    for (const stock of STOCK_PRODUCTS) {
      expect(stock.id).toBeTruthy();
      expect(stock.logoId).toBeTruthy();
      expect(stock.ticker).toBeTruthy();
      expect(stock.returnLow).toBeLessThanOrEqual(stock.returnBase);
      expect(stock.returnBase).toBeLessThanOrEqual(stock.returnHigh);
    }
  });

  it('allocates the exact lump sum to savings and investments with zero rounding drift', () => {
    const lumpSums = [0, 250, 1000, 3900, 5432, 12_345, 45_000];
    const risks: ArgonRiskProfile[] = ['conservative', 'balanced', 'growth'];

    for (const lumpSumPounds of lumpSums) {
      for (const riskProfile of risks) {
        const d = decideArgonAllocation({
          lumpSumPounds,
          monthlySurplusPounds: 255,
          monthlyIncomePounds: 450,
          riskProfile,
        });

        // 1. Exact split of lump sum between savings and investments
        expect(d.savingsNowPounds + d.invNowPounds).toBe(lumpSumPounds);
        expect(d.savingsAddPounds + d.invAddPounds).toBe(255);

        // 2. Exact delivery of savings across chosen real UK bank products
        const bankLumpSum = d.bankAllocations.reduce((s, b) => s + b.lumpSumPounds, 0);
        const bankMonthlySum = d.bankAllocations.reduce((s, b) => s + b.monthlyPounds, 0);
        expect(bankLumpSum).toBe(d.savingsNowPounds);
        expect(bankMonthlySum).toBe(d.savingsAddPounds);

        // 3. Exact delivery of investments across chosen real stock/ETF products
        const stockLumpSum = d.stockAllocations.reduce((s, st) => s + st.lumpSumPounds, 0);
        const stockMonthlySum = d.stockAllocations.reduce((s, st) => s + st.monthlyPounds, 0);
        expect(stockLumpSum).toBe(d.invNowPounds);
        expect(stockMonthlySum).toBe(d.invAddPounds);

        // 4. All rates are finite and ordered Low <= Base <= High
        expect(d.rates.sLow).toBeLessThanOrEqual(d.rates.sBase);
        expect(d.rates.sBase).toBeLessThanOrEqual(d.rates.sHigh);
        expect(d.rates.iLow).toBeLessThanOrEqual(d.rates.iBase);
        expect(d.rates.iBase).toBeLessThanOrEqual(d.rates.iHigh);
        expect(d.rationaleBullets.length).toBe(4);
      }
    }
  });

  it('extracts the user lump sum budget from EngineState and feeds project() with complete scenarios', () => {
    const state = demoFixture().state;
    const seed = extractSeedFromEngineState(state);
    expect(seed.lumpSumPounds).toBe(3900);
    expect(seed.monthlyIncomePounds).toBeGreaterThan(0);

    const customState = {
      ...state,
      profile: {
        ...state.profile!,
        funds: gbp(540_000),
      },
    };
    const customSeed = extractSeedFromEngineState(customState);
    expect(customSeed.lumpSumPounds).toBe(5400);

    const d = decideArgonAllocation(seed);
    expect(d.savingsNowPounds).toBe(2340);
    expect(d.invNowPounds).toBe(1560);
    expect(d.savingsNowPounds + d.invNowPounds).toBe(3900);

    const assumptions: ProjectionAssumptions = {
      startSavings: gbp(d.savingsNowPounds * 100),
      startInvestments: gbp(d.invNowPounds * 100),
      monthlySavingsContribution: gbp(d.savingsAddPounds * 100),
      monthlyInvestmentContribution: gbp(d.invAddPounds * 100),
      confirmedIncome: gbp(0),
      expectedMonthlyIncome: gbp(d.monthlyIncomePounds * 100),
      savingsRatePct: { low: d.rates.sLow, base: d.rates.sBase, high: d.rates.sHigh },
      investmentReturnPct: { low: d.rates.iLow, base: d.rates.iBase, high: d.rates.iHigh },
    };

    const res = project(assumptions, 12);
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.missing).toEqual([]);
      const lowEnd = res.scenarios.low?.[12];
      const baseEnd = res.scenarios.base?.[12];
      const highEnd = res.scenarios.high?.[12];
      expect(lowEnd).toBeDefined();
      expect(baseEnd).toBeDefined();
      expect(highEnd).toBeDefined();
      expect(lowEnd!.total.pence).toBeLessThan(baseEnd!.total.pence);
      expect(baseEnd!.total.pence).toBeLessThan(highEnd!.total.pence);
      expect(baseEnd!.growth.pence).toBeGreaterThan(0);
    }
  });

  it('handles POST /api/projections/decide and returns an exact ArgonDecision', async () => {
    const req = new Request('http://localhost:3210/api/projections/decide', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lumpSumPounds: 5000,
        monthlySurplusPounds: 300,
        monthlyIncomePounds: 600,
        riskProfile: 'balanced',
        months: 12,
      }),
    });
    const res = await decideRoutePost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lumpSumPounds).toBe(5000);
    expect(body.savingsNowPounds + body.invNowPounds).toBe(5000);
    expect(body.bankAllocations.length).toBeGreaterThan(0);
    expect(body.stockAllocations.length).toBeGreaterThan(0);
  });
});
