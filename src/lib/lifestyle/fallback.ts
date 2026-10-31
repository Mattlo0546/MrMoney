/**
 * Curated fallback food prices, used when live search is unavailable or misses a kind. Prices are estimates
 * (confidence 'low') with the merchant's own page as the source; live research results replace them.
 */
import type { FoodDeal } from './types';

const CHECKED = '2026-10-01';

const d = (id: string, kind: FoodDeal['kind'], merchant: string, domain: string, name: string, pricePence: number, url: string, condition?: string): FoodDeal => ({
  id, kind, merchant, domain, name, pricePence, url, checked: CHECKED, origin: 'catalogue', confidence: 'low', ...(condition ? { condition } : {}),
});

export const FALLBACK_DEALS: FoodDeal[] = [
  d('cat-tesco-meal-deal', 'meal_deal', 'Tesco', 'tesco.com', 'Meal Deal (main, snack, drink)', 385, 'https://www.tesco.com/groceries/en-GB/zone/meal-deal', 'Clubcard price'),
  d('cat-sainsburys-meal-deal', 'meal_deal', "Sainsbury's", 'sainsburys.co.uk', 'Meal Deal (main, snack, drink)', 385, 'https://www.sainsburys.co.uk/gol-ui/groceries/meal-deal', 'Nectar price'),
  d('cat-coop-meal-deal', 'meal_deal', 'Co-op', 'coop.co.uk', 'Meal Deal (main, snack, drink)', 400, 'https://www.coop.co.uk/products/deals/meal-deal', 'member price'),
  d('cat-aldi-pasta-night', 'cheap_dinner', 'Aldi', 'aldi.co.uk', 'Pasta, tomato sauce and veg (1 portion)', 120, 'https://www.aldi.co.uk/', 'per portion'),
  d('cat-lidl-rice-bowl', 'cheap_dinner', 'Lidl', 'lidl.co.uk', 'Chicken, rice and veg (1 portion)', 180, 'https://www.lidl.co.uk/', 'per portion'),
  d('cat-greggs-coffee', 'coffee', 'Greggs', 'greggs.com', 'Regular coffee', 190, 'https://www.greggs.com/menu'),
  d('cat-pret-lunch', 'lunch_out', 'Pret A Manger', 'pret.co.uk', 'Wrap and a drink', 850, 'https://www.pret.co.uk/en-GB/our-menu'),
  d('cat-nandos-takeaway', 'takeaway', "Nando's", 'nandos.co.uk', 'Quarter chicken, two sides', 1350, 'https://www.nandos.co.uk/food/menu'),
  d('cat-wagamama-dinner', 'dinner_out', 'wagamama', 'wagamama.com', 'Main and a soft drink', 1900, 'https://www.wagamama.com/menu'),
];
