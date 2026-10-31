/** Small hand-written catalogue for itinerary tests (not the real fallback catalogue). */
import type { Catalog, CatalogProduct, Recipe, TransportFare } from './types';

const CHECKED = '2026-10-30';

function p(
  id: string,
  name: string,
  pricePence: number,
  kind: CatalogProduct['kind'],
  packSize?: string,
  merchant = 'Tesco',
  domain = 'tesco.com',
): CatalogProduct {
  return {
    id,
    name,
    merchant,
    domain,
    pricePence,
    packSize,
    url: `https://www.${domain}/groceries/en-GB/search?query=${encodeURIComponent(name)}`,
    checked: CHECKED,
    origin: 'catalogue',
    kind,
  };
}

const products: CatalogProduct[] = [
  p('eggs', 'Tesco Free Range Eggs', 195, 'fresh', '6 pack'),
  p('cucumber', 'Tesco Whole Cucumber', 75, 'fresh', 'each'),
  p('rice', 'Tesco Long Grain Rice', 145, 'staple', '1kg'),
  p('oyster-sauce', 'Lee Kum Kee Premium Oyster Sauce', 260, 'staple', '510g'),
  p('soy-sauce', 'Kikkoman Soy Sauce', 220, 'staple', '150ml'),
  p('spring-onions', 'Tesco Spring Onions', 70, 'fresh', '100g'),
  p('frying-pan', 'Tesco Non-Stick Frying Pan 24cm', 900, 'equipment', '24cm'),
  p('wok', 'Ken Hom Carbon Steel Wok 31cm', 1800, 'equipment', '31cm', 'Argos', 'argos.co.uk'),
  p('spaghetti', 'Tesco Spaghetti', 75, 'staple', '500g'),
  p('chopped-tomatoes', 'Tesco Chopped Tomatoes', 45, 'staple', '400g'),
  p('garlic', 'Tesco Garlic', 30, 'fresh', 'bulb'),
  p('onions', 'Tesco Brown Onions', 85, 'fresh', '3 pack'),
  p('olive-oil', 'Tesco Olive Oil', 350, 'staple', '500ml'),
  p('parmesan', 'Tesco Italian Parmigiano Reggiano', 250, 'fresh', '200g'),
  p('chicken-thighs', 'Tesco British Chicken Thighs', 350, 'fresh', '1kg'),
  p('salmon', 'Tesco Scottish Salmon Fillets', 450, 'fresh', '2 pack'),
  p('steak', 'Tesco Finest Sirloin Steak', 650, 'fresh', '225g'),
  p('potatoes', 'Tesco White Potatoes', 150, 'fresh', '2.5kg'),
  p('butter', 'Lurpak Slightly Salted Butter', 225, 'staple', '250g'),
  p('pesto', 'Sacla Classic Basil Pesto', 200, 'staple', '190g'),
  p('tofu', 'Cauldron Organic Tofu', 200, 'fresh', '396g'),
  p('broccoli', 'Tesco Broccoli', 65, 'fresh', '360g'),
  p('bread', 'Hovis Medium Wholemeal Bread', 140, 'fresh', '800g'),
  p('cheddar', 'Tesco Mature Cheddar', 290, 'fresh', '400g'),
  p('beans', 'Heinz Baked Beans', 400, 'staple', '4 x 415g'),
  p('noodles', 'Amoy Straight to Wok Udon Noodles', 150, 'staple', '2 x 150g'),
  p('prawns', 'Tesco Cooked King Prawns', 375, 'fresh', '250g'),
  p('ramen-dinner', 'Kanada-Ya Tonkotsu Ramen', 1650, 'item', 'one bowl + drink', 'Kanada-Ya', 'kanada-ya.com'),
  p('trainers', 'ASICS Gel-Excite 10 Running Shoes', 6500, 'item', 'UK 9', 'ASICS', 'asics.com'),
];

const r = (
  id: string,
  name: string,
  cuisine: string,
  tier: Recipe['tier'],
  ingredients: [string, string, number][],
  equipment: string[] = [],
  meal: Recipe['meal'] = 'dinner',
): Recipe => ({
  id,
  name,
  cuisine,
  meal,
  tier,
  ingredients: ingredients.map(([productId, qty, portion]) => ({ productId, qty, portion })),
  equipment,
  recipeUrl: `https://www.bbcgoodfood.com/recipes/${id}`,
});

const recipes: Recipe[] = [
  r('egg-fried-rice', 'Egg fried rice with smashed cucumber', 'Chinese', 'budget', [
    ['eggs', '2 eggs', 0.34], ['rice', '150g', 0.15], ['spring-onions', '3 onions', 0.5], ['soy-sauce', '1 tbsp', 0.1], ['cucumber', 'half', 0.5],
  ], ['frying-pan']),
  r('oyster-chicken', 'Oyster sauce chicken & broccoli', 'Chinese', 'standard', [
    ['chicken-thighs', '4 thighs', 0.5], ['oyster-sauce', '3 tbsp', 0.1], ['broccoli', '1 head', 1], ['rice', '150g', 0.15], ['garlic', '2 cloves', 0.25],
  ], ['wok']),
  r('prawn-udon', 'King prawn udon in oyster sauce', 'Chinese', 'treat', [
    ['prawns', '250g', 1], ['noodles', '1 pouch', 0.5], ['oyster-sauce', '2 tbsp', 0.1], ['spring-onions', '3 onions', 0.5],
  ], ['wok']),
  r('tofu-noodles', 'Crispy tofu noodles', 'Chinese', 'budget', [
    ['tofu', 'half block', 0.5], ['noodles', '1 pouch', 0.5], ['soy-sauce', '2 tbsp', 0.1], ['broccoli', 'half head', 0.5],
  ], ['frying-pan']),
  r('pesto-pasta', 'Pesto spaghetti with parmesan', 'Italian', 'budget', [
    ['spaghetti', '125g', 0.25], ['pesto', '3 tbsp', 0.34], ['parmesan', '30g', 0.15],
  ]),
  r('pomodoro', 'Spaghetti pomodoro', 'Italian', 'standard', [
    ['spaghetti', '125g', 0.25], ['chopped-tomatoes', '1 tin', 1], ['garlic', '2 cloves', 0.25], ['onions', '1 onion', 0.34], ['olive-oil', '1 tbsp', 0.05], ['parmesan', '30g', 0.15],
  ]),
  r('salmon-potatoes', 'Butter-roast salmon with new potatoes', 'British', 'treat', [
    ['salmon', '2 fillets', 1], ['potatoes', '300g', 0.12], ['butter', '20g', 0.08], ['broccoli', '1 head', 1],
  ]),
  r('steak-chips', 'Sirloin steak & chips', 'British', 'treat', [
    ['steak', '225g', 1], ['potatoes', '400g', 0.16], ['butter', '20g', 0.08], ['olive-oil', '2 tbsp', 0.1],
  ], ['frying-pan']),
  r('beans-toast', 'Cheesy beans on toast', 'British', 'budget', [
    ['beans', '1 tin', 0.25], ['bread', '2 slices', 0.1], ['cheddar', '40g', 0.1], ['butter', '10g', 0.04],
  ]),
  r('chicken-traybake', 'Chicken thigh traybake', 'British', 'standard', [
    ['chicken-thighs', '4 thighs', 0.5], ['potatoes', '400g', 0.16], ['onions', '1 onion', 0.34], ['olive-oil', '1 tbsp', 0.05],
  ]),
  r('cheese-sandwich', 'Cheese & cucumber sandwich', 'British', 'budget', [
    ['bread', '2 slices', 0.1], ['cheddar', '40g', 0.1], ['cucumber', 'quarter', 0.25],
  ], [], 'lunch'),
  r('pasta-salad', 'Pesto pasta salad', 'Italian', 'budget', [
    ['spaghetti', '100g', 0.2], ['pesto', '2 tbsp', 0.2], ['cucumber', 'quarter', 0.25],
  ], [], 'lunch'),
];

const fare = (id: string, line: string, zones: string, peak: number, off: number, cap: number): TransportFare => ({
  id,
  line,
  from: "King's Cross St. Pancras",
  to: 'South Kensington',
  zones,
  peakPence: peak,
  offPeakPence: off,
  dailyCapPence: cap,
  url: 'https://tfl.gov.uk/fares/find-fares/tube-and-rail-fares/single-fare-finder',
  checked: CHECKED,
  origin: 'catalogue',
});

const fares: TransportFare[] = [
  fare('fare-circle', 'Circle line', 'Zone 1', 290, 280, 890),
  fare('fare-district', 'District line', 'Zone 1', 290, 280, 890),
  fare('fare-hc', 'Hammersmith & City line', 'Zone 1', 290, 280, 890),
  fare('fare-met', 'Metropolitan line', 'Zones 1-4', 450, 330, 500),
];

export const TEST_CATALOG: Catalog = {
  products: Object.fromEntries(products.map((x) => [x.id, x])),
  recipes,
  fares,
  wants: [
    { id: 'want-trainers', label: 'New running trainers', bucket: 'shopping', productId: 'trainers' },
    { id: 'want-ramen', label: 'Ramen dinner out', bucket: 'eatingOut', productId: 'ramen-dinner' },
  ],
  live: false,
  generatedAt: '2026-10-30T12:00:00Z',
};
