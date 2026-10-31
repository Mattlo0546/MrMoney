'use client';
import { useSyncExternalStore } from 'react';
import { itineraryBudget } from '@/lib/engine';
import { getAppStore } from '@/lib/store';
import { resolveCategories, scheduleItinerary } from '@/lib/itinerary/schedule';
import type {
  Answers,
  Catalog,
  CatalogRequest,
  CatalogResponse,
  ItineraryPrefs,
  Question,
  ScheduleResult,
} from '@/lib/itinerary/types';
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
  prefs: DEFAULT_PREFS,
  catalog: null,
  answers: EMPTY_ANSWERS,
  answered: [],
  result: null,
  seed: 1,
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
      commuteDays: Array.isArray(p.commuteDays)
        ? p.commuteDays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6)
        : DEFAULT_PREFS.commuteDays,
      wants: Array.isArray(p.wants) ? strs(p.wants) : DEFAULT_PREFS.wants,
      treatsPerWeek:
        typeof p.treatsPerWeek === 'number'
          ? Math.max(0, Math.min(3, Math.round(p.treatsPerWeek)))
          : DEFAULT_PREFS.treatsPerWeek,
    };
    const a = isObj(v.answers) ? v.answers : {};
    const owned: Record<string, boolean> = {};
    if (isObj(a.owned)) for (const [k, b] of Object.entries(a.owned)) if (typeof b === 'boolean') owned[k] = b;
    const answers: Answers = {
      owned,
      disliked: strs(a.disliked),
      liked: strs(a.liked),
      droppedWants: strs(a.droppedWants),
    };
    const catalog =
      isObj(v.catalog) && isObj(v.catalog.products) && Array.isArray(v.catalog.recipes)
        ? (v.catalog as unknown as Catalog)
        : null;
    const result =
      isObj(v.result) && isObj(v.result.byBucket) ? (v.result as unknown as ItineraryStore['result']) : null;
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
export const markItineraryApply = () => {
  lastApplyAt = Date.now();
};
export const isRecentItineraryApply = () => Date.now() - lastApplyAt < 1500;

// ------------------------------------------------------------------ Stateful external store

export interface ItineraryUiState {
  hydrated: boolean;
  store: ItineraryStore;
  phase: 'idle' | 'loading';
  error: string;
  step: number;
  editing: boolean;
}

const EMPTY_UI: ItineraryUiState = {
  hydrated: false,
  store: EMPTY_STORE,
  phase: 'idle',
  error: '',
  step: 0,
  editing: false,
};

let uiState: ItineraryUiState = EMPTY_UI;
const listeners = new Set<() => void>();
let abortController: AbortController | null = null;
let stepInterval: ReturnType<typeof setInterval> | null = null;

function setUi(patch: Partial<ItineraryUiState>) {
  uiState = { ...uiState, ...patch };
  listeners.forEach((l) => l());
}

function hydrateItinerary() {
  if (uiState.hydrated || typeof window === 'undefined') return;
  uiState = { ...uiState, hydrated: true, store: loadItinerary() };
}

export function getItineraryUi(): ItineraryUiState {
  hydrateItinerary();
  return uiState;
}

export function subscribeItinerary(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useItineraryUi(): ItineraryUiState {
  return useSyncExternalStore(subscribeItinerary, getItineraryUi, () => EMPTY_UI);
}

export function updateItineraryStore(next: ItineraryStore): void {
  hydrateItinerary();
  saveItinerary(next);
  setUi({ store: next });
}

export function setItineraryEditing(editing: boolean | ((prev: boolean) => boolean)): void {
  hydrateItinerary();
  const next = typeof editing === 'function' ? editing(uiState.editing) : editing;
  setUi({ editing: next });
}

function answerQuestion(a: Answers, q: Question, yes: boolean): Answers {
  const next: Answers = {
    owned: { ...a.owned },
    disliked: [...a.disliked],
    liked: [...a.liked],
    droppedWants: [...a.droppedWants],
  };
  if (q.kind === 'owned') next.owned[q.target] = yes;
  else if (q.kind === 'likeRecipe') {
    next.liked = next.liked.filter((x) => x !== q.target);
    next.disliked = next.disliked.filter((x) => x !== q.target);
    (yes ? next.liked : next.disliked).push(q.target);
  } else if (!yes && !next.droppedWants.includes(q.target)) next.droppedWants.push(q.target);
  return next;
}

/** Schedule locally from a catalog (no research) and apply it to the plan. */
export function replanItinerary(base: ItineraryStore, catalog: Catalog): boolean {
  hydrateItinerary();
  const { state, today } = getAppStore().getSnapshot();
  if (!state) return false;
  const start = today > state.profile.planStart ? today : state.profile.planStart;
  const end = state.profile.horizonEnd;
  if (start > end) {
    setUi({ error: 'Your plan has already ended. Extend it in Settings to build a spending plan.' });
    return false;
  }
  try {
    const b = itineraryBudget(state, today);
    const result = scheduleItinerary({
      catalog,
      prefs: base.prefs,
      answers: base.answers,
      start,
      end,
      budgetPence: b.budgetPence,
      caps: b.caps,
      incomeDates: b.incomeDates,
      categories: resolveCategories(state.profile.categories),
      seed: base.seed,
    });
    markItineraryApply();
    const r = getAppStore().applyItinerary(result.purchases, 'itemised');
    if (r && 'ok' in r && !r.ok) {
      setUi({ error: r.error?.message ?? 'That plan does not fit right now.' });
      return false;
    }
    const { purchases: _omit, ...summary } = result;
    void _omit;
    const nextStore = { ...base, catalog, result: summary };
    saveItinerary(nextStore);
    setUi({ store: nextStore, error: '' });
    return true;
  } catch (e) {
    setUi({ error: e instanceof Error ? e.message : 'Could not build the plan.' });
    return false;
  }
}

function stopStepInterval() {
  if (stepInterval) {
    clearInterval(stepInterval);
    stepInterval = null;
  }
}

export async function buildItinerary(): Promise<void> {
  hydrateItinerary();
  const { state, today } = getAppStore().getSnapshot();
  if (!state) return;

  abortController?.abort();
  const ctl = new AbortController();
  abortController = ctl;
  const timer = setTimeout(() => ctl.abort(), 90_000);

  stopStepInterval();
  setUi({ phase: 'loading', step: 0, error: '' });
  stepInterval = setInterval(() => {
    setUi({ step: uiState.step + 1 });
  }, 2400);

  try {
    const body: CatalogRequest = { prefs: uiState.store.prefs, today };
    const res = await fetch('/api/itinerary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`The price lookup failed (${res.status}). Try again in a moment.`);
    const data = (await res.json()) as CatalogResponse;
    if (!data?.catalog?.products) throw new Error('The price lookup came back empty. Try again in a moment.');
    if (replanItinerary({ ...uiState.store, answered: [] }, data.catalog)) {
      setUi({ editing: false });
    }
  } catch (e) {
    if (ctl.signal.aborted && abortController !== ctl) return;
    setUi({
      error: ctl.signal.aborted
        ? 'The price lookup took too long. Try again.'
        : e instanceof Error
          ? e.message
          : 'Something went wrong.',
    });
  } finally {
    clearTimeout(timer);
    if (abortController === ctl) {
      stopStepInterval();
      setUi({ phase: 'idle' });
      abortController = null;
    }
  }
}

export function answerItineraryQuestion(q: Question, yes: boolean): void {
  hydrateItinerary();
  const { store } = uiState;
  if (!store.catalog) return;
  replanItinerary(
    {
      ...store,
      answers: answerQuestion(store.answers, q, yes),
      answered: [...store.answered, q.id],
    },
    store.catalog,
  );
}

export function resetItineraryToEven(): void {
  markItineraryApply();
  getAppStore().applyItinerary([], 'even');
}

export function resetItineraryStore(): void {
  abortController?.abort();
  abortController = null;
  stopStepInterval();
  saveItinerary(EMPTY_STORE);
  setUi({
    hydrated: true,
    store: EMPTY_STORE,
    phase: 'idle',
    error: '',
    step: 0,
    editing: false,
  });
}
