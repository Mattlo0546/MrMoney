import type { Answers, Catalog, ItineraryPrefs, ScheduleResult } from '@/lib/itinerary/types';
import { DEFAULT_PREFS, EMPTY_ANSWERS } from '@/lib/itinerary/types';

export const ITINERARY_KEY = 'mrmoney.itinerary.v1';

export interface ItineraryStore {
  prefs: ItineraryPrefs;
  catalog: Catalog | null;
  answers: Answers;
  /** Question ids the student has answered (hidden even when the answer leaves nothing to record). */
  answered: string[];
  /** Last schedule shown (summary, notes, questions), so the panel survives a reload without re-applying. */
  result: Omit<ScheduleResult, 'purchases'> | null;
  /** Variety seed; "Shuffle" bumps it. */
  seed: number;
}

export const EMPTY_STORE: ItineraryStore = {
  prefs: DEFAULT_PREFS, catalog: null, answers: EMPTY_ANSWERS, answered: [], result: null, seed: 1,
};

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);

/** Never throws: blocked storage or a corrupt value fall back to defaults. */
export function loadItinerary(): ItineraryStore {
  try {
    const raw = window.localStorage.getItem(ITINERARY_KEY);
    if (!raw) return EMPTY_STORE;
    const v: unknown = JSON.parse(raw);
    if (!isObj(v)) return EMPTY_STORE;
    const p = isObj(v.prefs) ? v.prefs : {};
    const prefs: ItineraryPrefs = {
      ...DEFAULT_PREFS,
      cuisines: Array.isArray(p.cuisines) ? strs(p.cuisines) : DEFAULT_PREFS.cuisines,
      diet: typeof p.diet === 'string' && p.diet ? p.diet : undefined,
      lines: Array.isArray(p.lines) ? strs(p.lines) : DEFAULT_PREFS.lines,
      homeStation: typeof p.homeStation === 'string' ? p.homeStation : DEFAULT_PREFS.homeStation,
      campusStation: typeof p.campusStation === 'string' ? p.campusStation : DEFAULT_PREFS.campusStation,
      commuteDays: Array.isArray(p.commuteDays) ? p.commuteDays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6) : DEFAULT_PREFS.commuteDays,
      wants: Array.isArray(p.wants) ? strs(p.wants) : DEFAULT_PREFS.wants,
      treatsPerWeek: typeof p.treatsPerWeek === 'number' ? Math.max(0, Math.min(3, Math.round(p.treatsPerWeek))) : DEFAULT_PREFS.treatsPerWeek,
    };
    const a = isObj(v.answers) ? v.answers : {};
    const owned: Record<string, boolean> = {};
    if (isObj(a.owned)) for (const [k, b] of Object.entries(a.owned)) if (typeof b === 'boolean') owned[k] = b;
    const answers: Answers = { owned, disliked: strs(a.disliked), liked: strs(a.liked), droppedWants: strs(a.droppedWants) };
    const catalog = isObj(v.catalog) && isObj(v.catalog.products) && Array.isArray(v.catalog.recipes) ? (v.catalog as unknown as Catalog) : null;
    const result = isObj(v.result) && isObj(v.result.byBucket) ? (v.result as unknown as ItineraryStore['result']) : null;
    return { prefs, catalog, answers, answered: strs(v.answered), result, seed: typeof v.seed === 'number' ? v.seed : 1 };
  } catch {
    return EMPTY_STORE;
  }
}

export function saveItinerary(s: ItineraryStore): void {
  try {
    window.localStorage.setItem(ITINERARY_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked or full: the session still works.
  }
}

/** Set just before the panel applies a plan, so the layout does not jump to the chat tab for its own change. */
let lastApplyAt = 0;
export const markItineraryApply = () => { lastApplyAt = Date.now(); };
export const isRecentItineraryApply = () => Date.now() - lastApplyAt < 1500;
