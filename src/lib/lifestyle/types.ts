/**
 * Lifestyle quick plan: the chat asks three things (monthly income, monthly rent, lifestyle) and the app does the
 * rest. The server finds real food prices (meal deals first) plus the best savings account, the client seeds every
 * calendar day with meals from those prices, and the engine checks it all. Money is integer pence (GBP).
 */
import { z } from 'zod';

export const LIFESTYLES = ['brokie', 'balanced', 'comfy', 'baller'] as const;
export type Lifestyle = (typeof LIFESTYLES)[number];

export const LIFESTYLE_LABEL: Record<Lifestyle, string> = {
  brokie: 'Brokie (meal deals only)',
  balanced: 'Balanced',
  comfy: 'Comfy',
  baller: 'Baller',
};

/** What a deal is used for in the meal plan. */
export const DEAL_KINDS = ['meal_deal', 'cheap_dinner', 'coffee', 'lunch_out', 'takeaway', 'dinner_out'] as const;
export type DealKind = (typeof DEAL_KINDS)[number];

const pence = z.number().int().min(1).max(10_000);
const text = (max: number) => z.string().trim().min(1).max(max);

export const FoodDealSchema = z.object({
  id: text(80),
  kind: z.enum(DEAL_KINDS),
  merchant: text(60),
  domain: z.string().trim().max(80).optional(),
  /** e.g. "Meal Deal (Clubcard price)". */
  name: text(80),
  pricePence: pence,
  /** e.g. "Clubcard price", "per portion". */
  condition: z.string().trim().max(80).optional(),
  url: z.string().trim().max(600),
  sourceTitle: z.string().trim().max(120).optional(),
  checked: text(10),
  origin: z.enum(['research', 'catalogue']),
  confidence: z.enum(['low', 'medium']).optional(),
});
export type FoodDeal = z.infer<typeof FoodDealSchema>;

export const SavingsPickSchema = z.object({
  ref: text(80),
  provider: text(80),
  product: z.string().trim().max(120),
  ratePercent: z.number().min(0).max(25),
  headline: z.string().trim().max(160),
  sourceUrl: z.string().trim().max(600),
});
export type SavingsPick = z.infer<typeof SavingsPickSchema>;

/** Attached by the server to a quick_plan call (the model never writes it). */
export const LifestyleMenuSchema = z.object({
  deals: z.array(FoodDealSchema).min(1).max(40),
  /** Best easy-access savings account from live research; absent when none was found (rates never come from memory). */
  savings: SavingsPickSchema.optional(),
  live: z.boolean(),
});
export type LifestyleMenu = z.infer<typeof LifestyleMenuSchema>;
