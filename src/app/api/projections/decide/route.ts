import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CHAT_MODEL, generateContent, visibleText } from '@/lib/agent/gemini';
import {
  BANK_PRODUCTS,
  STOCK_PRODUCTS,
  decideArgonAllocation,
  type ArgonDecision,
} from '@/lib/finance/products';

// NOTE: no `runtime` / `dynamic` exports: next.config has cacheComponents, which rejects them.

const RequestSchema = z.object({
  lumpSumPounds: z.number().min(0).max(1_000_000),
  monthlySurplusPounds: z.number().min(0).max(100_000).optional(),
  monthlyIncomePounds: z.number().min(0).max(200_000).optional(),
  riskProfile: z.enum(['conservative', 'balanced', 'growth']).optional().default('balanced'),
  months: z.number().int().min(1).max(600).optional().default(12),
});

const ModelChoiceSchema = z.object({
  savingsShare: z.number().min(0.15).max(0.90),
  selectedBankIds: z.array(z.string()).min(1).max(4),
  selectedStockIds: z.array(z.string()).min(1).max(4),
  rationale: z.string().min(10).max(420),
});

export async function POST(req: Request) {
  let rawJson: unknown;
  try {
    rawJson = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(rawJson);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid projection decision request' }, { status: 400 });
  }

  const { lumpSumPounds, monthlySurplusPounds, monthlyIncomePounds, riskProfile, months } = parsed.data;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (apiKey) {
    try {
      const bankList = BANK_PRODUCTS.map(
        (b) => `- ${b.id}: ${b.provider} ${b.name} (${b.aerBase}% AER, max lump £${b.maxLumpSumPounds}, max monthly £${b.maxMonthlyPounds})`,
      ).join('\n');
      const stockList = STOCK_PRODUCTS.map(
        (s) => `- ${s.id}: ${s.provider} ${s.ticker} ${s.name} (Base ${s.returnBase}%/yr, OCF ${s.ocfPercent}%)`,
      ).join('\n');

      const prompt = [
        'You are Argon (gemini-4-argon), the main financial deciding agent for MrMoney.',
        `The user has a £${lumpSumPounds} lump sum budget, £${monthlySurplusPounds ?? 250}/month contribution capacity, £${monthlyIncomePounds ?? 450}/month expected income, a ${months}-month horizon, and "${riskProfile}" risk profile.`,
        'Decide:',
        '1. savingsShare (fraction between 0.25 and 0.85 of the lump sum to allocate to UK bank savings; the exact remainder goes to stock/ETF investments).',
        '2. selectedBankIds: choose 2 to 3 real UK bank products from the catalog below.',
        '3. selectedStockIds: choose 2 to 3 real stock/ETF investments from the catalog below.',
        '4. rationale: 2 concise sentences explaining the exact pound split and why you selected those specific banks and stock/ETF investments.',
        '',
        'Available UK Bank Products:',
        bankList,
        '',
        'Available Stock/ETF Investments:',
        stockList,
      ].join('\n');

      const res = await generateContent({
        apiKey,
        model: CHAT_MODEL,
        timeoutMs: 14_000,
        body: {
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
            thinkingConfig: { thinkingLevel: 'low' },
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                savingsShare: { type: 'NUMBER' },
                selectedBankIds: { type: 'ARRAY', items: { type: 'STRING' } },
                selectedStockIds: { type: 'ARRAY', items: { type: 'STRING' } },
                rationale: { type: 'STRING' },
              },
              required: ['savingsShare', 'selectedBankIds', 'selectedStockIds', 'rationale'],
            },
          },
        },
      });

      const text = visibleText(res.candidates?.[0]?.content?.parts ?? []);
      const choice = ModelChoiceSchema.safeParse(JSON.parse(text));
      if (choice.success) {
        const validBanks = choice.data.selectedBankIds.filter((id) => BANK_PRODUCTS.some((b) => b.id === id));
        const validStocks = choice.data.selectedStockIds.filter((id) => STOCK_PRODUCTS.some((s) => s.id === id));
        const baseDecision = decideArgonAllocation({
          lumpSumPounds,
          monthlySurplusPounds,
          monthlyIncomePounds,
          riskProfile,
          selectedBankIds: validBanks.length ? validBanks : undefined,
          selectedStockIds: validStocks.length ? validStocks : undefined,
          customSavingsShare: choice.data.savingsShare,
        });
        const cleanRationale = choice.data.rationale.trim();
        const decision: ArgonDecision = {
          ...baseDecision,
          rationale: cleanRationale,
          rationaleBullets: [
            ...baseDecision.rationaleBullets.slice(0, 3),
            `Strategy Rationale: ${cleanRationale}`,
          ],
          decidedBy: 'gemini-4-argon',
        };
        return NextResponse.json(decision);
      }
    } catch {
      /* fall through to deterministic Argon engine */
    }
  }

  const decision = decideArgonAllocation({
    lumpSumPounds,
    monthlySurplusPounds,
    monthlyIncomePounds,
    riskProfile,
  });
  return NextResponse.json(decision);
}
