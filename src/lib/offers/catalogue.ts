import type { Offer } from './types';

const CHECKED = '2026-10-31';
const base = { checked: CHECKED, sample: true } as const;

/**
 * SAMPLE catalogue, curated from .prd-to-production/research. Not live data and not a retailer integration.
 * Verify each entry on the brand's own page before demo day.
 */
export const CATALOGUE: readonly Offer[] = [
  {
    id: 'zizzi-student', title: 'Zizzi student discount', category: 'eating-out',
    discountDescription: '30% off food (Sun evening to Fri); a 20% tier applies on some days.', percentOff: 30,
    eligibility: 'UK university students verified via Student Beans or UNiDAYS.',
    conditions: 'Dine-in only; excludes bank holidays and some sites; sources disagree on exact days.',
    area: 'UK', source: 'https://www.studentbeans.com/student-discount/uk/zizzi', confidence: 'medium', ...base,
  },
  {
    id: 'pizza-express-student', title: 'Pizza Express student discount', category: 'eating-out',
    discountDescription: 'Reported 25-30% off the bill, most days Sun-Fri.', percentOff: 25,
    eligibility: 'UK students verified via Student Beans or UNiDAYS.',
    conditions: 'Sources conflict (25% Sun-Fri vs 30% Sun-Thu); some venues excluded; one code per table.',
    area: 'UK', source: 'https://www.studentbeans.com/student-discount/uk/pizzaexpress', confidence: 'low', ...base,
  },
  {
    id: 'itsu-student', title: 'Itsu student discount', category: 'eating-out',
    discountDescription: '15% off food.', percentOff: 15,
    eligibility: 'Students registering the Itsu app with a university email.',
    conditions: 'Food only per one source; redemption method (app vs student ID) is reported inconsistently.',
    area: 'UK', source: 'https://www.studentbeans.com/student-discount/uk/itsu', confidence: 'medium', ...base,
  },
  {
    id: 'leon-student', title: 'Leon student discount', category: 'eating-out',
    discountDescription: 'Reported 15% off at selected restaurants (another source says 25% with a minimum spend).', percentOff: 15,
    eligibility: 'UK students verified via Student Beans.',
    conditions: 'Selected restaurants only; not on delivery apps; sources conflict on the amount.',
    area: 'UK', source: 'https://www.studentbeans.com/student-discount/uk/leon', confidence: 'low', ...base,
  },
  {
    id: 'tesco-clubcard', title: 'Tesco Clubcard Prices', category: 'groceries',
    discountDescription: 'Member-only shelf prices on selected lines, plus points that convert to vouchers. No set percentage.',
    eligibility: 'Anyone; free to join. No student-specific perk found.',
    conditions: 'Scan the card or app; only selected lines; voucher rules vary between sources.',
    area: 'UK', membership: 'tesco-clubcard', source: 'https://www.tesco.com/clubcard', confidence: 'medium', ...base,
  },
  {
    id: 'my-waitrose', title: 'My Waitrose perks', category: 'groceries',
    discountDescription: 'Personalised vouchers, a free hot drink and monthly Little Treats unlocked by spend. No set percentage.',
    eligibility: 'Anyone; reported free to join. No student-specific perk found.',
    conditions: 'Little Treats need roughly GBP 50+ monthly spend; Waitrose baskets benchmark as the dearest of the main supermarkets.',
    area: 'UK', membership: 'my-waitrose', source: 'https://www.waitrose.com/', confidence: 'low', ...base,
  },
  {
    id: 'lidl-plus', title: 'Lidl Plus app offers', category: 'groceries',
    discountDescription: 'Weekly app-only coupons and personalised offers, plus points. No set percentage.',
    eligibility: 'Anyone with the Lidl Plus app; no student-specific perk found.',
    conditions: 'App only; offers change weekly.',
    area: 'UK', membership: 'lidl-plus', source: 'https://www.lidl.co.uk/lidl-plus', confidence: 'medium', ...base,
  },
  {
    id: 'railcard-16-25', title: '16-25 Railcard', category: 'transport',
    discountDescription: 'One third off most National Rail fares for a GBP 35 year (GBP 80 for three).', percentOff: 33,
    eligibility: 'Ages 16-25, or mature full-time students (26+).',
    conditions: 'Not valid on season tickets; GBP 12 minimum fare on weekday mornings before about 10am (not Jul/Aug).',
    area: 'UK', membership: 'railcard-16-25', source: 'https://www.railcard.co.uk/16-25-railcard/', confidence: 'medium', ...base,
  },
  {
    id: 'student-oyster-18plus', title: '18+ Student Oyster photocard', category: 'transport',
    discountDescription: '30% off adult Travelcards and Bus & Tram passes.', percentOff: 30,
    eligibility: 'Students 18+ living in London in term time at a TfL-registered institution; full-time study.',
    conditions: 'Pay-as-you-go fares are not discounted; photocard has a fee and expires when the course ends.',
    area: 'London', membership: 'student-oyster', source: 'https://tfl.gov.uk/fares/free-and-discounted-travel/18-plus-student-oyster-photocard', confidence: 'medium', ...base,
  },
  {
    id: 'railcard-on-oyster', title: 'Railcard discount on Oyster', category: 'transport',
    discountDescription: 'One third off off-peak pay-as-you-go fares when a 16-25 or 26-30 Railcard is added to your Oyster card.', percentOff: 33,
    eligibility: 'Holders of a 16-25 or 26-30 Railcard with a registered Oyster card.',
    conditions: 'Off-peak only; added at a station or Oyster ticket shop; can be combined with the Student Oyster.',
    area: 'London', membership: 'railcard-16-25', source: 'https://tfl.gov.uk/fares/free-and-discounted-travel/18-plus-student-oyster-photocard', confidence: 'medium', ...base,
  },
];
