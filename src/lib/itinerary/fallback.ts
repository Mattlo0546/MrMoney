/**
 * Curated London fallback catalogue (origin 'catalogue'): real products at UK supermarkets with realistic late-2026
 * shelf prices, recipes broken down into those products, TfL pay-as-you-go fares for every line, and the student's
 * wants mapped to specific items. Every URL is real and resolvable: a retailer search page for the exact product, a
 * BBC Good Food recipe search, or the TfL fares pages. Used whenever live grounded research is unavailable, and to
 * fill whatever live research did not cover.
 */
import type { ISODate } from '@/lib/engine';
import { TUBE_LINES, type Catalog, type CatalogProduct, type ItineraryPrefs, type Recipe, type TransportFare, type WantItem } from './types';

export const TFL_FARES_URL = 'https://tfl.gov.uk/fares/find-fares/tube-and-rail-fares';
export const TFL_BUS_FARES_URL = 'https://tfl.gov.uk/fares/find-fares/bus-and-tram-fares';

/** TfL PAYG adult fares, Zones 1-2 (pence). */
export const TFL_Z12 = { peak: 290, offPeak: 280, cap: 890 } as const;
export const TFL_BUS = { fare: 175, cap: 525 } as const;

export const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'x';

// ------------------------------------------------------------------ retailers

interface Retailer {
  name: string;
  domain: string;
  /** Retailer search page for an exact product query. */
  search: (q: string) => string;
  match: RegExp;
}

const plus = (q: string) => encodeURIComponent(q.trim()).replace(/%20/g, '+');
export const RETAILERS: Retailer[] = [
  { name: 'Tesco', domain: 'tesco.com', match: /tesco/i, search: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${plus(q)}` },
  { name: "Sainsbury's", domain: 'sainsburys.co.uk', match: /sainsbury/i, search: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q.trim())}` },
  { name: 'Aldi', domain: 'aldi.co.uk', match: /aldi/i, search: (q) => `https://www.aldi.co.uk/results?q=${plus(q)}` },
  { name: 'Lidl', domain: 'lidl.co.uk', match: /lidl/i, search: (q) => `https://www.lidl.co.uk/q/search?q=${plus(q)}` },
  { name: 'Asda', domain: 'asda.com', match: /asda/i, search: (q) => `https://groceries.asda.com/search/${encodeURIComponent(q.trim())}` },
  { name: 'Morrisons', domain: 'morrisons.com', match: /morrison/i, search: (q) => `https://groceries.morrisons.com/search?q=${plus(q)}` },
  { name: 'Waitrose', domain: 'waitrose.com', match: /waitrose/i, search: (q) => `https://www.waitrose.com/ecom/shop/search?searchTerm=${plus(q)}` },
  { name: 'Ocado', domain: 'ocado.com', match: /ocado/i, search: (q) => `https://www.ocado.com/search?entry=${plus(q)}` },
  { name: 'Co-op', domain: 'coop.co.uk', match: /co-?op/i, search: (q) => `https://shop.coop.co.uk/search?term=${plus(q)}` },
  { name: 'M&S', domain: 'marksandspencer.com', match: /m&s|marks/i, search: (q) => `https://www.marksandspencer.com/l/search?q=${plus(q)}` },
  { name: 'Argos', domain: 'argos.co.uk', match: /argos/i, search: (q) => `https://www.argos.co.uk/search/${encodeURIComponent(slug(q))}/` },
  { name: 'IKEA', domain: 'ikea.com', match: /ikea/i, search: (q) => `https://www.ikea.com/gb/en/search/?q=${plus(q)}` },
  { name: 'Amazon UK', domain: 'amazon.co.uk', match: /amazon/i, search: (q) => `https://www.amazon.co.uk/s?k=${plus(q)}` },
  { name: 'JD Sports', domain: 'jdsports.co.uk', match: /\bjd\b|jd sports/i, search: (q) => `https://www.jdsports.co.uk/search/${encodeURIComponent(q.trim().toLowerCase())}/` },
  { name: 'Nike', domain: 'nike.com', match: /nike/i, search: (q) => `https://www.nike.com/gb/w?q=${plus(q)}` },
  { name: 'adidas', domain: 'adidas.co.uk', match: /adidas/i, search: (q) => `https://www.adidas.co.uk/search?q=${plus(q)}` },
  { name: 'Sports Direct', domain: 'sportsdirect.com', match: /sports ?direct/i, search: (q) => `https://www.sportsdirect.com/searchresults?descriptionfilter=${plus(q)}` },
  { name: 'Uniqlo', domain: 'uniqlo.com', match: /uniqlo/i, search: (q) => `https://www.uniqlo.com/uk/en/search?q=${plus(q)}` },
  { name: 'Currys', domain: 'currys.co.uk', match: /currys/i, search: (q) => `https://www.currys.co.uk/search?q=${plus(q)}` },
  { name: 'Waterstones', domain: 'waterstones.com', match: /waterstones/i, search: (q) => `https://www.waterstones.com/books/search/term/${encodeURIComponent(q.trim())}` },
  { name: 'Ticketmaster', domain: 'ticketmaster.co.uk', match: /ticketmaster/i, search: (q) => `https://www.ticketmaster.co.uk/search?q=${plus(q)}` },
];

export function retailerFor(merchant: string): Retailer | undefined {
  return RETAILERS.find((r) => r.match.test(merchant));
}

/** A real, resolvable search URL for this exact product at this merchant (Google Shopping for unknown merchants). */
export function productSearchUrl(merchant: string, product: string): string {
  const r = retailerFor(merchant);
  return r ? r.search(product) : `https://www.google.com/search?tbm=shop&q=${plus(`${merchant} ${product}`)}`;
}

export const bbcGoodFoodSearch = (recipe: string) => `https://www.bbcgoodfood.com/search?q=${plus(recipe)}`;

// ------------------------------------------------------------------ products

type Seed = [id: string, name: string, merchant: string, pence: number, pack: string, kind: CatalogProduct['kind'], query?: string];

/**
 * id, exact product name, retailer, price, pack size, kind (staples/equipment are bought once and asked about).
 * Ids double as the matching key for live research (see PRODUCT_MATCH).
 */
const PRODUCT_SEEDS: Seed[] = [
  // fresh
  ['eggs', 'Tesco British Free Range Medium Eggs', 'Tesco', 175, '6 pack', 'fresh', 'free range medium eggs 6'],
  ['egg-noodles', "Sainsbury's Medium Egg Noodles", "Sainsbury's", 100, '250g', 'fresh', 'medium egg noodles'],
  ['udon', 'Tesco Udon Noodles', 'Tesco', 150, '2 x 200g', 'fresh', 'udon noodles'],
  ['chicken-thighs', 'Tesco British Chicken Thigh Fillets', 'Tesco', 425, '640g', 'fresh', 'chicken thigh fillets'],
  ['beef-mince', 'Lidl Deluxe British Beef Steak Mince 5% Fat', 'Lidl', 349, '500g', 'fresh', 'beef mince 5%'],
  ['pork-mince', 'Tesco British Pork Mince 5% Fat', 'Tesco', 275, '500g', 'fresh', 'pork mince'],
  ['tofu', 'Cauldron Organic Original Tofu', "Sainsbury's", 250, '396g', 'fresh', 'cauldron organic tofu'],
  ['salmon', 'Tesco 2 Scottish Salmon Fillets', 'Tesco', 450, '240g', 'fresh', 'scottish salmon fillets'],
  ['sirloin', "Sainsbury's British Beef Sirloin Steak, Taste the Difference", "Sainsbury's", 700, '225g', 'fresh', 'sirloin steak taste the difference'],
  ['bacon', 'Aldi Unsmoked Back Bacon Rashers', 'Aldi', 199, '300g', 'fresh', 'unsmoked back bacon'],
  ['sausages', 'Richmond 8 Thick Pork Sausages', 'Tesco', 250, '410g', 'fresh', 'richmond thick sausages'],
  ['cucumber', 'Tesco Whole Cucumber', 'Tesco', 75, 'each', 'fresh', 'whole cucumber'],
  ['onions', 'Aldi Nature’s Pick Brown Onions', 'Aldi', 85, '1kg', 'fresh', 'brown onions 1kg'],
  ['garlic', 'Tesco Garlic', 'Tesco', 99, '4 pack', 'fresh', 'garlic 4 pack'],
  ['ginger', 'Tesco Root Ginger Loose', 'Tesco', 45, '~75g', 'fresh', 'root ginger'],
  ['spring-onions', 'Tesco Spring Onions', 'Tesco', 59, '100g', 'fresh', 'spring onions'],
  ['broccoli', 'Tesco Broccoli', 'Tesco', 69, '335g', 'fresh', 'broccoli'],
  ['peppers', 'Lidl Mixed Peppers', 'Lidl', 109, '3 pack', 'fresh', 'mixed peppers'],
  ['mushrooms', 'Tesco Closed Cup Mushrooms', 'Tesco', 85, '300g', 'fresh', 'closed cup mushrooms'],
  ['spinach', 'Tesco Baby Spinach', 'Tesco', 125, '240g', 'fresh', 'baby spinach 240g'],
  ['potatoes', 'Aldi White Potatoes', 'Aldi', 109, '2kg', 'fresh', 'white potatoes 2kg'],
  ['bananas', 'Tesco Bananas Loose', 'Tesco', 85, '5 pack', 'fresh', 'bananas 5 pack'],
  ['bread', 'Hovis Soft White Medium Bread', 'Tesco', 140, '800g', 'fresh', 'hovis soft white medium'],
  ['wraps', 'Tesco 8 Plain Tortilla Wraps', 'Tesco', 95, '8 pack', 'fresh', 'plain tortilla wraps'],
  ['milk', 'Tesco British Semi Skimmed Milk', 'Tesco', 165, '2.272L (4 pints)', 'fresh', 'semi skimmed milk 4 pints'],
  ['cheddar', 'Aldi Cheese Emporium Mature Cheddar', 'Aldi', 279, '400g', 'fresh', 'mature cheddar 400g'],
  ['hard-cheese', 'Tesco Italian Hard Cheese (vegetarian)', 'Tesco', 250, '150g', 'fresh', 'italian hard cheese'],
  ['kimchi', 'Biona Organic Kimchi', "Sainsbury's", 300, '350g', 'fresh', 'kimchi'],
  ['oven-chips', 'Aldi Four Seasons Crinkle Cut Oven Chips', 'Aldi', 149, '1.5kg', 'fresh', 'oven chips 1.5kg'],
  ['peas', 'Tesco Frozen Garden Peas', 'Tesco', 120, '1kg', 'fresh', 'frozen garden peas 1kg'],
  ['chopped-tomatoes', 'Tesco Chopped Tomatoes', 'Tesco', 49, '400g', 'fresh', 'chopped tomatoes 400g'],
  ['passata', "Sainsbury's Passata", "Sainsbury's", 60, '500g', 'fresh', 'passata 500g'],
  ['baked-beans', 'Heinz Beanz in Tomato Sauce', 'Tesco', 135, '415g', 'fresh', 'heinz baked beans 415g'],
  ['kidney-beans', 'Tesco Red Kidney Beans in Water', 'Tesco', 45, '400g', 'fresh', 'red kidney beans in water'],
  ['chickpeas', 'Tesco Chick Peas in Water', 'Tesco', 55, '400g', 'fresh', 'chick peas in water'],
  ['coconut-milk', 'Tesco Coconut Milk', 'Tesco', 95, '400ml', 'fresh', 'coconut milk 400ml'],
  // staples (bought once, last many meals)
  ['rice', 'Tesco Long Grain Rice', 'Tesco', 115, '1kg', 'staple', 'long grain rice 1kg'],
  ['spaghetti', 'Tesco Spaghetti', 'Tesco', 75, '500g', 'staple', 'spaghetti 500g'],
  ['penne', 'Aldi Cucina Penne Pasta', 'Aldi', 65, '500g', 'staple', 'penne pasta 500g'],
  ['oats', 'Tesco Scottish Porridge Oats', 'Tesco', 85, '1kg', 'staple', 'scottish porridge oats 1kg'],
  ['butter', 'Tesco British Salted Block Butter', 'Tesco', 229, '250g', 'staple', 'salted block butter 250g'],
  ['oyster-sauce', 'Lee Kum Kee Panda Brand Oyster Sauce', 'Tesco', 240, '510g', 'staple', 'lee kum kee oyster sauce'],
  ['soy-sauce', 'Lee Kum Kee Premium Light Soy Sauce', 'Tesco', 240, '500ml', 'staple', 'lee kum kee light soy sauce'],
  ['sesame-oil', 'Lee Kum Kee Pure Sesame Oil', 'Tesco', 275, '207ml', 'staple', 'lee kum kee sesame oil'],
  ['chilli-crisp', 'Lao Gan Ma Crispy Chilli in Oil', "Sainsbury's", 350, '210g', 'staple', 'lao gan ma crispy chilli'],
  ['gochujang', 'Bibigo Gochujang Hot Pepper Paste', 'Tesco', 400, '500g', 'staple', 'bibigo gochujang'],
  ['teriyaki', 'Kikkoman Teriyaki Marinade', 'Tesco', 300, '250ml', 'staple', 'kikkoman teriyaki marinade'],
  ['curry-paste', "Patak's Tikka Masala Spice Paste", 'Tesco', 260, '283g', 'staple', 'pataks tikka masala paste'],
  ['pesto', "Sacla' Classic Basil Pesto", 'Tesco', 275, '190g', 'staple', 'sacla classic basil pesto'],
  ['fajita-mix', 'Old El Paso Fajita Seasoning Mix', 'Tesco', 120, '30g', 'staple', 'old el paso fajita seasoning'],
  ['olive-oil', 'Tesco Olive Oil', 'Tesco', 375, '500ml', 'staple', 'olive oil 500ml'],
  ['veg-oil', 'Tesco Vegetable Oil', 'Tesco', 175, '1L', 'staple', 'vegetable oil 1 litre'],
  ['tomato-puree', 'Tesco Tomato Puree', 'Tesco', 65, '200g', 'staple', 'tomato puree 200g'],
  ['stock-cubes', 'Knorr Vegetable Stock Cubes', 'Tesco', 130, '8 x 10g', 'staple', 'knorr vegetable stock cubes'],
  ['italian-herbs', 'Tesco Italian Seasoning', 'Tesco', 85, '15g', 'staple', 'italian seasoning'],
  ['chilli-flakes', 'Tesco Crushed Chillies', 'Tesco', 100, '40g', 'staple', 'crushed chillies'],
  ['garam-masala', 'Tesco Garam Masala', 'Tesco', 100, '48g', 'staple', 'garam masala'],
  // equipment (bought once unless owned)
  ['frying-pan', 'Argos Home 28cm Non Stick Aluminium Frying Pan', 'Argos', 1000, '28cm', 'equipment', 'non stick frying pan 28cm'],
  ['wok', 'Ken Hom Classic 31cm Carbon Steel Non-Stick Wok', 'Argos', 2000, '31cm', 'equipment', 'ken hom wok'],
  ['saucepan', 'Argos Home 18cm Non Stick Saucepan', 'Argos', 800, '18cm', 'equipment', 'non stick saucepan 18cm'],
  ['baking-tray', 'Argos Home Non Stick Baking Tray', 'Argos', 500, '38cm', 'equipment', 'non stick baking tray'],
];

/**
 * Keyword matchers so a live product ("Lee Kum Kee Oyster Sauce 510g") replaces the catalogue product with the same
 * role. Order matters: first match wins.
 */
export const PRODUCT_MATCH: [id: string, re: RegExp][] = [
  ['oyster-sauce', /oyster sauce/i], ['soy-sauce', /soy sauce|soya sauce/i], ['sesame-oil', /sesame oil/i],
  ['chilli-crisp', /chilli crisp|crispy chilli|chili crisp|chilli oil/i], ['gochujang', /gochujang/i], ['teriyaki', /teriyaki/i],
  ['curry-paste', /curry paste|tikka.*paste|masala paste/i], ['pesto', /pesto/i], ['fajita-mix', /fajita/i],
  ['olive-oil', /olive oil/i], ['veg-oil', /vegetable oil|sunflower oil|rapeseed oil/i], ['tomato-puree', /pur[eé]e/i],
  ['stock-cubes', /stock/i], ['italian-herbs', /italian (seasoning|herbs)|mixed herbs|oregano/i], ['chilli-flakes', /chilli flakes|crushed chill/i],
  ['garam-masala', /garam masala/i], ['coconut-milk', /coconut milk/i], ['chopped-tomatoes', /chopped tomatoes|tinned tomatoes/i],
  ['passata', /passata/i], ['baked-beans', /baked beans|beanz/i], ['kidney-beans', /kidney beans/i], ['chickpeas', /chick ?peas/i],
  ['egg-noodles', /egg noodles/i], ['udon', /udon/i], ['eggs', /\beggs?\b/i], ['chicken-thighs', /chicken/i], ['beef-mince', /beef mince|minced beef/i],
  ['pork-mince', /pork mince|minced pork/i], ['tofu', /tofu/i], ['salmon', /salmon/i], ['sirloin', /steak|sirloin|ribeye/i],
  ['bacon', /bacon/i], ['sausages', /sausage/i], ['cucumber', /cucumber/i], ['spring-onions', /spring onion|scallion/i],
  ['onions', /onion/i], ['garlic', /garlic/i], ['ginger', /ginger/i], ['broccoli', /broccoli/i], ['peppers', /pepper(?!corn)/i],
  ['mushrooms', /mushroom/i], ['spinach', /spinach/i], ['oven-chips', /chips|fries/i], ['potatoes', /potato/i], ['bananas', /banana/i],
  ['wraps', /tortilla|wraps?\b/i], ['bread', /bread|loaf/i], ['milk', /\bmilk\b/i], ['butter', /butter/i], ['cheddar', /cheddar/i],
  ['hard-cheese', /parmesan|parmigiano|grana padano|hard cheese/i], ['kimchi', /kimchi/i], ['peas', /\bpeas\b/i],
  ['rice', /\brice\b/i], ['spaghetti', /spaghetti|linguine/i], ['penne', /penne|fusilli|pasta/i], ['oats', /oats|porridge/i],
  ['wok', /\bwok\b/i], ['frying-pan', /frying pan|skillet/i], ['saucepan', /saucepan/i], ['baking-tray', /baking tray|roasting tin/i],
];

export function matchProductId(name: string): string | undefined {
  return PRODUCT_MATCH.find(([, re]) => re.test(name))?.[0];
}

function product(seed: Seed, today: ISODate): CatalogProduct {
  const [id, name, merchant, pricePence, packSize, kind, query] = seed;
  const r = retailerFor(merchant);
  return {
    id, name, merchant, domain: r?.domain ?? 'google.com', pricePence, packSize,
    url: productSearchUrl(merchant, query ?? name), sourceTitle: `${merchant}: search "${query ?? name}"`,
    checked: today, origin: 'catalogue', kind,
  };
}

export function catalogueProducts(today: ISODate): Record<string, CatalogProduct> {
  return Object.fromEntries(PRODUCT_SEEDS.map((s) => [s[0], product(s, today)]));
}

// ------------------------------------------------------------------ recipes

type Ing = [productId: string, qty: string, portion: number];
interface RecipeSeed {
  id: string;
  name: string;
  cuisine: string;
  meal: Recipe['meal'];
  tier: Recipe['tier'];
  ing: Ing[];
  equipment: string[];
  /** 'vegetarian', 'vegan', 'meat', 'pork', 'fish'. */
  tags: string[];
}

const RECIPE_SEEDS: RecipeSeed[] = [
  { id: 'egg-fried-rice', name: 'Egg fried rice with peas & spring onion', cuisine: 'Chinese', meal: 'dinner', tier: 'budget', equipment: ['wok'], tags: ['vegetarian'],
    ing: [['rice', '100g rice', 0.1], ['eggs', '2 eggs', 0.333], ['peas', '60g frozen peas', 0.06], ['spring-onions', '3 spring onions', 0.4], ['soy-sauce', '1 tbsp', 0.03], ['sesame-oil', '1 tsp', 0.025], ['veg-oil', '1 tbsp', 0.015]] },
  { id: 'oyster-chicken-broccoli', name: 'Oyster sauce chicken & broccoli with rice', cuisine: 'Chinese', meal: 'dinner', tier: 'standard', equipment: ['wok'], tags: ['meat'],
    ing: [['chicken-thighs', '2 thigh fillets (~210g)', 0.333], ['broccoli', '1/2 head', 0.5], ['garlic', '2 cloves', 0.05], ['ginger', 'thumb of ginger', 0.25], ['oyster-sauce', '2 tbsp', 0.06], ['soy-sauce', '1 tbsp', 0.03], ['rice', '100g rice', 0.1], ['veg-oil', '1 tbsp', 0.015]] },
  { id: 'cucumber-chilli-noodles', name: 'Smashed cucumber & chilli crisp noodles', cuisine: 'Chinese', meal: 'lunch', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['egg-noodles', '2 nests (125g)', 0.5], ['cucumber', '1/2 cucumber', 0.5], ['chilli-crisp', '1 heaped tbsp', 0.07], ['soy-sauce', '1 tbsp', 0.03], ['garlic', '1 clove', 0.025], ['sesame-oil', '1 tsp', 0.025]] },
  { id: 'mapo-tofu', name: 'Quick mapo tofu with pork & rice', cuisine: 'Chinese', meal: 'dinner', tier: 'standard', equipment: ['wok'], tags: ['meat', 'pork'],
    ing: [['tofu', '1/2 block', 0.5], ['pork-mince', '125g pork mince', 0.25], ['chilli-crisp', '1 tbsp', 0.06], ['soy-sauce', '1 tbsp', 0.03], ['garlic', '2 cloves', 0.05], ['spring-onions', '2 spring onions', 0.25], ['rice', '100g rice', 0.1]] },
  { id: 'kimchi-fried-rice', name: 'Kimchi fried rice with a fried egg', cuisine: 'Korean', meal: 'lunch', tier: 'budget', equipment: ['frying-pan'], tags: [],
    ing: [['rice', '100g rice', 0.1], ['kimchi', '120g kimchi', 0.35], ['eggs', '1 egg', 0.167], ['gochujang', '1 tbsp', 0.04], ['spring-onions', '2 spring onions', 0.25], ['sesame-oil', '1 tsp', 0.025]] },
  { id: 'gochujang-tofu-bowl', name: 'Gochujang crispy tofu rice bowl', cuisine: 'Korean', meal: 'dinner', tier: 'standard', equipment: ['frying-pan'], tags: ['vegetarian', 'vegan'],
    ing: [['tofu', '1/2 block', 0.5], ['gochujang', '1.5 tbsp', 0.06], ['broccoli', '1/2 head', 0.5], ['rice', '100g rice', 0.1], ['soy-sauce', '1 tbsp', 0.03], ['sesame-oil', '1 tsp', 0.025], ['spring-onions', '2 spring onions', 0.25]] },
  { id: 'salmon-teriyaki', name: 'Salmon teriyaki with rice & broccoli', cuisine: 'Japanese', meal: 'dinner', tier: 'treat', equipment: ['frying-pan', 'saucepan'], tags: ['fish'],
    ing: [['salmon', '1 salmon fillet', 0.5], ['teriyaki', '3 tbsp', 0.18], ['rice', '100g rice', 0.1], ['broccoli', '1/2 head', 0.5], ['sesame-oil', '1 tsp', 0.025]] },
  { id: 'chicken-udon', name: 'Chicken teriyaki udon stir-fry', cuisine: 'Japanese', meal: 'dinner', tier: 'standard', equipment: ['wok'], tags: ['meat'],
    ing: [['udon', '1 pack (200g)', 0.5], ['chicken-thighs', '2 thigh fillets (~210g)', 0.333], ['teriyaki', '2 tbsp', 0.12], ['peppers', '1 pepper', 0.333], ['spring-onions', '2 spring onions', 0.25], ['veg-oil', '1 tbsp', 0.015]] },
  { id: 'spag-bol', name: 'Spaghetti bolognese', cuisine: 'Italian', meal: 'dinner', tier: 'standard', equipment: ['saucepan', 'frying-pan'], tags: ['meat'],
    ing: [['spaghetti', '100g spaghetti', 0.2], ['beef-mince', '125g beef mince', 0.25], ['passata', '1/2 carton', 0.5], ['onions', '1 onion', 0.15], ['garlic', '1 clove', 0.025], ['italian-herbs', '1 tsp', 0.07], ['hard-cheese', 'grated, 15g', 0.1], ['olive-oil', '1 tbsp', 0.03]] },
  { id: 'pesto-penne', name: 'Pesto penne with broccoli', cuisine: 'Italian', meal: 'lunch', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['penne', '100g penne', 0.2], ['pesto', '2 tbsp', 0.25], ['broccoli', '1/2 head', 0.5], ['hard-cheese', 'grated, 10g', 0.07]] },
  { id: 'garlic-tomato-pasta', name: 'Garlic, chilli & tomato spaghetti', cuisine: 'Italian', meal: 'dinner', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['spaghetti', '100g spaghetti', 0.2], ['chopped-tomatoes', '1 tin', 1], ['garlic', '2 cloves', 0.05], ['chilli-flakes', 'pinch', 0.03], ['olive-oil', '1 tbsp', 0.03], ['hard-cheese', 'grated, 10g', 0.07]] },
  { id: 'full-english', name: 'Full English breakfast', cuisine: 'British', meal: 'breakfast', tier: 'treat', equipment: ['frying-pan', 'saucepan'], tags: ['meat', 'pork'],
    ing: [['eggs', '2 eggs', 0.333], ['bacon', '2 rashers', 0.25], ['sausages', '2 sausages', 0.25], ['baked-beans', '1/2 tin', 0.5], ['mushrooms', '4 mushrooms', 0.33], ['bread', '2 slices', 0.1], ['butter', 'for the toast', 0.04]] },
  { id: 'cheesy-beans-toast', name: 'Cheesy beans on toast', cuisine: 'British', meal: 'breakfast', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['baked-beans', '1/2 tin', 0.5], ['bread', '2 slices', 0.1], ['cheddar', '30g grated', 0.075], ['butter', 'for the toast', 0.03]] },
  { id: 'porridge-banana', name: 'Porridge with banana', cuisine: 'British', meal: 'breakfast', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['oats', '50g oats', 0.05], ['milk', '250ml milk', 0.11], ['bananas', '1 banana', 0.2]] },
  { id: 'scrambled-eggs-toast', name: 'Scrambled eggs on toast', cuisine: 'British', meal: 'breakfast', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian'],
    ing: [['eggs', '2 eggs', 0.333], ['bread', '2 slices', 0.1], ['butter', '10g', 0.04], ['milk', 'splash', 0.02]] },
  { id: 'steak-chips', name: 'Steak & chips with peas', cuisine: 'British', meal: 'dinner', tier: 'treat', equipment: ['frying-pan', 'baking-tray'], tags: ['meat'],
    ing: [['sirloin', '1 sirloin steak', 1], ['oven-chips', '200g oven chips', 0.133], ['peas', '80g frozen peas', 0.08], ['butter', '15g', 0.06], ['garlic', '1 clove', 0.025]] },
  { id: 'sausage-mash', name: 'Sausage & mash with onion gravy', cuisine: 'British', meal: 'dinner', tier: 'standard', equipment: ['saucepan', 'frying-pan'], tags: ['meat', 'pork'],
    ing: [['sausages', '3 sausages', 0.375], ['potatoes', '300g potatoes', 0.15], ['onions', '1 onion', 0.15], ['stock-cubes', '1 cube', 0.125], ['butter', '15g', 0.06], ['milk', 'splash', 0.02], ['peas', '60g frozen peas', 0.06]] },
  { id: 'chicken-tikka-masala', name: 'Chicken tikka masala with rice', cuisine: 'Indian', meal: 'dinner', tier: 'standard', equipment: ['saucepan', 'frying-pan'], tags: ['meat'],
    ing: [['chicken-thighs', '2 thigh fillets (~210g)', 0.333], ['curry-paste', '2 tbsp', 0.15], ['chopped-tomatoes', '1/2 tin', 0.5], ['onions', '1 onion', 0.15], ['rice', '100g rice', 0.1], ['veg-oil', '1 tbsp', 0.015]] },
  { id: 'chickpea-spinach-curry', name: 'Chickpea, spinach & coconut curry', cuisine: 'Indian', meal: 'dinner', tier: 'budget', equipment: ['saucepan'], tags: ['vegetarian', 'vegan'],
    ing: [['chickpeas', '1 tin', 1], ['spinach', '2 handfuls', 0.4], ['coconut-milk', '1/2 tin', 0.5], ['curry-paste', '1.5 tbsp', 0.12], ['garam-masala', '1 tsp', 0.05], ['onions', '1 onion', 0.15], ['rice', '100g rice', 0.1]] },
  { id: 'chicken-fajitas', name: 'Chicken fajitas', cuisine: 'Mexican', meal: 'dinner', tier: 'standard', equipment: ['frying-pan'], tags: ['meat'],
    ing: [['wraps', '3 wraps', 0.375], ['chicken-thighs', '2 thigh fillets (~210g)', 0.333], ['peppers', '2 peppers', 0.667], ['onions', '1 onion', 0.15], ['fajita-mix', '1/2 sachet', 0.5], ['cheddar', '30g grated', 0.075]] },
  { id: 'bean-quesadillas', name: 'Bean & cheese quesadillas', cuisine: 'Mexican', meal: 'lunch', tier: 'budget', equipment: ['frying-pan'], tags: ['vegetarian'],
    ing: [['wraps', '2 wraps', 0.25], ['kidney-beans', '1/2 tin', 0.5], ['cheddar', '40g grated', 0.1], ['peppers', '1 pepper', 0.333], ['spring-onions', '2 spring onions', 0.25]] },
];

function recipe(s: RecipeSeed): Recipe {
  return {
    id: s.id, name: s.name, cuisine: s.cuisine, meal: s.meal, tier: s.tier,
    ingredients: s.ing.map(([productId, qty, portion]) => ({ productId, qty, portion })),
    equipment: s.equipment, recipeUrl: bbcGoodFoodSearch(s.name), tags: s.tags,
  };
}

/** Diet filter from free text: vegetarian/vegan, pescatarian, halal / no pork. */
export function dietAllows(diet: string | undefined, tags: string[] = []): boolean {
  const d = (diet ?? '').toLowerCase();
  if (!d.trim()) return true;
  if (/vegan|plant/.test(d)) return tags.includes('vegan');
  if (/veg|meat[- ]?free|no meat/.test(d)) return tags.includes('vegetarian');
  if (/pesc/.test(d)) return !tags.includes('meat');
  if (/halal|kosher|no pork|pork[- ]free/.test(d)) return !tags.includes('pork');
  return true;
}

export const MIN_RECIPES = 8;

/**
 * Diet first (hard), then the student's cuisines; padded with other diet-compatible recipes to at least MIN_RECIPES,
 * making sure breakfast, lunch and dinner are all represented. Vegan with too few recipes pads with vegetarian ones.
 */
export function pickRecipes(all: Recipe[], prefs: Pick<ItineraryPrefs, 'cuisines' | 'diet'>): Recipe[] {
  let ok = all.filter((r) => dietAllows(prefs.diet, r.tags));
  if (ok.length < MIN_RECIPES && /vegan|plant/i.test(prefs.diet ?? '')) ok = all.filter((r) => dietAllows('vegetarian', r.tags));
  if (!ok.length) ok = all;
  const want = new Set(prefs.cuisines.map((c) => c.trim().toLowerCase()).filter(Boolean));
  if (!want.size) return ok;
  const chosen = ok.filter((r) => want.has(r.cuisine.toLowerCase()));
  const rest = ok.filter((r) => !chosen.includes(r));
  for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
    if (!chosen.some((r) => r.meal === meal)) {
      const extra = rest.find((r) => r.meal === meal && r.tier !== 'treat') ?? rest.find((r) => r.meal === meal);
      if (extra) chosen.push(...rest.splice(rest.indexOf(extra), 1));
    }
  }
  while (chosen.length < MIN_RECIPES && rest.length) chosen.push(rest.shift()!);
  return chosen;
}

// ------------------------------------------------------------------ fares

export const fareId = (line: string) => `fare-${slug(line)}`;

export function fallbackFare(line: string, prefs: Pick<ItineraryPrefs, 'homeStation' | 'campusStation'>, today: ISODate): TransportFare {
  const bus = line === 'Bus';
  return {
    id: fareId(line), line, from: prefs.homeStation, to: prefs.campusStation,
    zones: bus ? 'Any London bus' : 'Zones 1-2',
    peakPence: bus ? TFL_BUS.fare : TFL_Z12.peak,
    offPeakPence: bus ? TFL_BUS.fare : TFL_Z12.offPeak,
    dailyCapPence: bus ? TFL_BUS.cap : TFL_Z12.cap,
    url: bus ? TFL_BUS_FARES_URL : TFL_FARES_URL,
    sourceTitle: bus ? 'TfL: Bus and tram fares' : 'TfL: Tube, DLR and London Overground fares',
    checked: today, origin: 'catalogue',
  };
}

/** Matches free text to a TUBE_LINES entry ("H&C", "Hammersmith and City" → "Hammersmith & City line"). */
export function normaliseLine(text: string): string | undefined {
  const t = text.toLowerCase().replace(/&/g, ' and ');
  if (/hammersmith|h and c\b/.test(t)) return 'Hammersmith & City line';
  if (/waterloo/.test(t)) return 'Waterloo & City line';
  if (/\bbus/.test(t)) return 'Bus';
  return TUBE_LINES.find((l) => l !== 'Bus' && t.includes(l.toLowerCase().replace(/ line$/, '')));
}

// ------------------------------------------------------------------ wants

interface WantSeed {
  match: RegExp;
  bucket: WantItem['bucket'];
  name: string;
  merchant: string;
  pence: number;
  pack?: string;
  url?: string;
  query?: string;
}

const WANT_SEEDS: WantSeed[] = [
  { match: /running|run shoe|jogging/i, bucket: 'shopping', name: 'Nike Pegasus 41 Road Running Shoes', merchant: 'Nike', pence: 11995, pack: 'UK 9', query: 'pegasus 41' },
  { match: /trainer|sneaker|shoe|kicks/i, bucket: 'shopping', name: "Nike Air Force 1 '07 Trainers", merchant: 'JD Sports', pence: 10999, pack: 'UK 9', query: 'nike air force 1' },
  { match: /ramen|noodle bar|japanese/i, bucket: 'eatingOut', name: 'Kanada-Ya: Ichi Ban tonkotsu ramen', merchant: 'Kanada-Ya', pence: 1650, url: 'https://www.kanada-ya.com/' },
  { match: /dinner|meal out|restaurant|eat(ing)? out|curry|indian|date night|brunch/i, bucket: 'eatingOut', name: 'Dishoom: Chicken Ruby, garlic naan & house chai', merchant: 'Dishoom', pence: 2790, url: 'https://www.dishoom.com/' },
  { match: /gig|concert|music|festival|live show/i, bucket: 'fun', name: 'Standing ticket at O2 Academy Brixton', merchant: 'Ticketmaster', pence: 3500, query: 'O2 Academy Brixton' },
  { match: /cinema|movie|film/i, bucket: 'fun', name: 'ODEON Luxe Leicester Square ticket', merchant: 'ODEON', pence: 1599, url: 'https://www.odeon.co.uk/cinemas/leicester-square/' },
  { match: /headphone|earbud|airpods/i, bucket: 'shopping', name: 'Sony WH-CH720N Wireless Noise Cancelling Headphones', merchant: 'Argos', pence: 7999, query: 'sony wh-ch720n' },
  { match: /jacket|coat|puffer/i, bucket: 'shopping', name: 'Uniqlo Ultra Light Down Jacket', merchant: 'Uniqlo', pence: 5990, query: 'ultra light down jacket' },
  { match: /hoodie|clothes|jumper|jeans|t-?shirt/i, bucket: 'shopping', name: 'Uniqlo Sweat Pullover Hoodie', merchant: 'Uniqlo', pence: 2990, query: 'sweat pullover hoodie' },
  { match: /gym|fitness/i, bucket: 'fun', name: 'PureGym London monthly membership', merchant: 'PureGym', pence: 2699, url: 'https://www.puregym.com/gyms/' },
  { match: /haircut|barber|hair/i, bucket: 'shopping', name: "Men's haircut at a London barber (Treatwell)", merchant: 'Treatwell', pence: 2000, url: 'https://www.treatwell.co.uk/places-at-barbershops/in-london-uk/' },
  { match: /book|novel/i, bucket: 'shopping', name: 'Paperback from Waterstones', merchant: 'Waterstones', pence: 1099, query: 'bestsellers' },
  { match: /museum|exhibition|gallery/i, bucket: 'fun', name: 'Exhibition ticket (Science Museum / V&A)', merchant: 'V&A', pence: 2000, url: 'https://www.vam.ac.uk/exhibitions' },
];

export function bucketForWant(text: string): WantItem['bucket'] {
  if (/dinner|lunch|brunch|eat|restaurant|food|drink|bar|pub|coffee|cafe/i.test(text)) return 'eatingOut';
  if (/ticket|gig|show|trip|cinema|museum|gym|party|club|event|fun/i.test(text)) return 'fun';
  return 'shopping';
}

const titleCase = (s: string) => s.trim().replace(/^\w/, (c) => c.toUpperCase());

export const wantId = (i: number, label: string) => `want-${i}-${slug(label)}`;
export const wantProductId = (i: number, label: string) => `wantp-${i}-${slug(label)}`;

/** Maps each free-text want to a specific item; unknown wants get a sensible generic item in the guessed bucket. */
export function fallbackWants(wants: string[], today: ISODate): { wants: WantItem[]; products: CatalogProduct[] } {
  const out: { wants: WantItem[]; products: CatalogProduct[] } = { wants: [], products: [] };
  wants.map((w) => w.trim()).filter(Boolean).slice(0, 10).forEach((label, i) => {
    const seed = WANT_SEEDS.find((s) => s.match.test(label));
    const id = wantProductId(i, label);
    let p: CatalogProduct;
    let bucket: WantItem['bucket'];
    if (seed) {
      const r = retailerFor(seed.merchant);
      bucket = seed.bucket;
      p = {
        id, name: seed.name, merchant: seed.merchant, domain: seed.url ? new URL(seed.url).hostname.replace(/^www\./, '') : r?.domain ?? 'google.com',
        pricePence: seed.pence, ...(seed.pack ? { packSize: seed.pack } : {}),
        url: seed.url ?? productSearchUrl(seed.merchant, seed.query ?? seed.name), sourceTitle: seed.merchant,
        checked: today, origin: 'catalogue', kind: 'item',
      };
    } else {
      bucket = bucketForWant(label);
      const generic = {
        eatingOut: { name: `${titleCase(label)} (London restaurant, ~£25)`, merchant: 'OpenTable', pence: 2500, url: `https://www.opentable.co.uk/s?term=${encodeURIComponent(label)}&metroId=72`, domain: 'opentable.co.uk' },
        fun: { name: `${titleCase(label)} (London ticket, ~£25)`, merchant: 'Time Out London', pence: 2500, url: 'https://www.timeout.com/london/things-to-do', domain: 'timeout.com' },
        shopping: { name: titleCase(label), merchant: 'Amazon UK', pence: 3000, url: productSearchUrl('Amazon', label), domain: 'amazon.co.uk' },
      }[bucket];
      p = { id, name: generic.name, merchant: generic.merchant, domain: generic.domain, pricePence: generic.pence, url: generic.url, sourceTitle: generic.merchant, checked: today, origin: 'catalogue', confidence: 'low', kind: 'item' };
    }
    out.products.push(p);
    out.wants.push({ id: wantId(i, label), label, bucket, productId: id });
  });
  return out;
}

// ------------------------------------------------------------------ assembly

/** Keeps only products referenced by recipes (ingredients + equipment) or wants; drops recipes with dangling refs. */
export function finalizeCatalog(c: Catalog): Catalog {
  const recipes = c.recipes
    .filter((r) => r.ingredients.length && r.ingredients.every((i) => c.products[i.productId]))
    .map((r) => ({ ...r, equipment: r.equipment.filter((e) => c.products[e]) }));
  const wants = c.wants.filter((w) => c.products[w.productId]);
  const used = new Set<string>([...recipes.flatMap((r) => [...r.ingredients.map((i) => i.productId), ...r.equipment]), ...wants.map((w) => w.productId)]);
  const products = Object.fromEntries(Object.entries(c.products).filter(([id]) => used.has(id)));
  return { ...c, products, recipes, wants };
}

export function fallbackRecipes(prefs: Pick<ItineraryPrefs, 'cuisines' | 'diet'>): Recipe[] {
  return pickRecipes(RECIPE_SEEDS.map(recipe), prefs);
}

export function fallbackFares(prefs: Pick<ItineraryPrefs, 'homeStation' | 'campusStation'>, today: ISODate): TransportFare[] {
  return TUBE_LINES.map((l) => fallbackFare(l, prefs, today));
}

export function fallbackCatalog(prefs: ItineraryPrefs, today: ISODate): Catalog {
  const w = fallbackWants(prefs.wants, today);
  const products = catalogueProducts(today);
  for (const p of w.products) products[p.id] = p;
  return finalizeCatalog({
    products,
    recipes: fallbackRecipes(prefs),
    fares: fallbackFares(prefs, today),
    wants: w.wants,
    live: false,
    generatedAt: new Date().toISOString(),
    sources: ['Curated London catalogue (Tesco, Sainsbury’s, Aldi, Lidl, Argos shelf prices; TfL PAYG fares)'],
  });
}
