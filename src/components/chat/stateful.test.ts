import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChat, resetChat, sendMessage, setDraft, subscribeChat } from './chatStore';
import {
  getMoneySnapshot,
  resetMoneyStore,
  sendMoneyMessage,
  setMoneyDraft,
  subscribeMoney,
} from '@/components/money/moneyStore';
import {
  buildItinerary,
  getItineraryUi,
  resetItineraryStore,
  subscribeItinerary,
} from '@/components/plan/itinerary/storage';
import {
  askArgonAgent,
  getProjectionsSnapshot,
  resetProjectionsStore,
  subscribeProjections,
} from '@/components/projections/ProjectionsView';
import { getAppStore } from '@/lib/store';
import { DEFAULT_PROFILE } from '@/lib/finance/types';
import { fallbackCatalog } from '@/lib/itinerary/fallback';
import { DEFAULT_PREFS, type Catalog } from '@/lib/itinerary/types';

void fallbackCatalog(DEFAULT_PREFS, '2026-10-31');

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

describe('stateful chats and background agent workflows', () => {
  const origFetch = globalThis.fetch;
  const origWindow = globalThis.window;
  const origLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const storage = createMemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: storage,
        setTimeout: globalThis.setTimeout.bind(globalThis),
        clearTimeout: globalThis.clearTimeout.bind(globalThis),
        setInterval: globalThis.setInterval.bind(globalThis),
        clearInterval: globalThis.clearInterval.bind(globalThis),
      },
      configurable: true,
      writable: true,
    });
    resetChat();
    resetMoneyStore();
    resetItineraryStore();
    resetProjectionsStore();
    getAppStore().reset();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    Object.defineProperty(globalThis, 'window', {
      value: origWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: origLocalStorage,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it('Plan chatStore retains draft and finishes in-flight prompt after subscriber unmounts', async () => {
    setDraft('Can I spend £25 on dinner?');
    expect(getChat().draft).toBe('Can I spend £25 on dinner?');

    let resolveFetch!: (res: Response) => void;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const events: boolean[] = [];
    const unsubscribe = subscribeChat(() => {
      events.push(getChat().busy);
    });

    const turnPromise = sendMessage(getChat().draft);
    expect(getChat().draft).toBe('');
    expect(getChat().busy).toBe(true);

    // Simulate user tapping out to another tab/route while prompt is still running
    unsubscribe();

    resolveFetch(
      new Response(
        JSON.stringify({
          kind: 'reply',
          phase: 'answered',
          text: 'Yes, £25 fits nicely inside your flexible budget.',
          cards: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await turnPromise;

    const finalState = getChat();
    expect(finalState.busy).toBe(false);
    expect(finalState.messages).toHaveLength(2);
    expect(finalState.messages[0].text).toBe('Can I spend £25 on dinner?');
    expect(finalState.messages[1].text).toBe('Yes, £25 fits nicely inside your flexible budget.');
  });

  it('Money chatStore retains draft, finishes prompt in background when unmounted, and persists to localStorage', async () => {
    setMoneyDraft('Split £5000 balanced');
    expect(getMoneySnapshot().draft).toBe('Split £5000 balanced');

    let resolveFetch!: (res: Response) => void;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const unsubscribe = subscribeMoney(() => {});
    const turnPromise = sendMoneyMessage(getMoneySnapshot().draft);

    expect(getMoneySnapshot().draft).toBe('');
    expect(getMoneySnapshot().busy).toBe(true);

    // Simulate user navigating away from /money to /plan mid-prompt
    unsubscribe();

    const updatedProfile = {
      ...DEFAULT_PROFILE,
      cashSavingsPence: 500_000,
    };

    resolveFetch(
      new Response(
        JSON.stringify({
          text: 'Allocated £5,000 across UK bank savings and global equities.',
          phase: 'answered',
          profile: updatedProfile,
          cards: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await turnPromise;

    const finalMoney = getMoneySnapshot();
    expect(finalMoney.busy).toBe(false);
    expect(finalMoney.profile.cashSavingsPence).toBe(500_000);
    expect(finalMoney.messages[finalMoney.messages.length - 1]?.text).toBe(
      'Allocated £5,000 across UK bank savings and global equities.',
    );

    const rawPersisted = localStorage.getItem('mrmoney:money:v1');
    expect(rawPersisted).toBeTruthy();
    const parsed = JSON.parse(rawPersisted!);
    expect(parsed.profile.cashSavingsPence).toBe(500_000);
    expect(parsed.messages[parsed.messages.length - 1]?.text).toBe(
      'Allocated £5,000 across UK bank savings and global equities.',
    );
  });

  it('Itinerary builder continues in background without aborting when user switches tabs', async () => {
    getAppStore().startDemo();

    let resolveFetch!: (res: Response) => void;
    let capturedSignal: AbortSignal | null | undefined;
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    }) as unknown as typeof fetch;

    const unsubscribe = subscribeItinerary(() => {});
    const buildPromise = buildItinerary();

    expect(getItineraryUi().phase).toBe('loading');

    // Simulate user switching away from Spending Plan tab to Chat or Deals tab
    unsubscribe();
    expect(capturedSignal?.aborted ?? false).toBe(false);

    const mockCatalog: Catalog = {
      products: {
        eggs: {
          id: 'eggs',
          name: 'Free Range Eggs 6pk',
          merchant: 'Aldi',
          domain: 'aldi.co.uk',
          pricePence: 145,
          url: 'https://www.aldi.co.uk/eggs',
          checked: '2026-11-10',
          origin: 'catalogue',
          kind: 'fresh',
        },
      },
      recipes: [
        {
          id: 'egg-fried-rice',
          name: 'Egg Fried Rice',
          cuisine: 'Chinese',
          meal: 'dinner',
          tier: 'budget',
          ingredients: [{ productId: 'eggs', qty: '2 eggs', portion: 0.34 }],
          equipment: [],
        },
      ],
      fares: [],
      wants: [],
      live: false,
      generatedAt: '2026-11-10T00:00:00.000Z',
    };

    resolveFetch(
      new Response(
        JSON.stringify({
          catalog: mockCatalog,
          source: 'fallback',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await buildPromise;

    const ui = getItineraryUi();
    expect(ui.phase).toBe('idle');
    expect(ui.error).toBe('');
    expect(ui.store.catalog).toBeTruthy();
    expect(ui.store.result).toBeTruthy();
  });

  it('Projections Argon agent finishes decision in background when unmounted and persists to localStorage', async () => {
    let resolveFetch!: (res: Response) => void;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

    const unsubscribe = subscribeProjections(() => {});
    const askPromise = askArgonAgent(null);

    expect(getProjectionsSnapshot().argonBusy).toBe(true);

    // Simulate user navigating away from /projections while Argon is deciding
    unsubscribe();

    resolveFetch(
      new Response(
        JSON.stringify({
          lumpSumPounds: 3900,
          monthlySurplusPounds: 250,
          monthlyIncomePounds: 450,
          riskProfile: 'growth',
          savingsSharePercent: 45,
          investmentsSharePercent: 55,
          savingsNowPounds: 1755,
          invNowPounds: 2145,
          savingsAddPounds: 113,
          invAddPounds: 137,
          rates: { sLow: 3.5, sBase: 4.7, sHigh: 5.1, iLow: -5, iBase: 8.2, iHigh: 14 },
          selectedBankIds: ['trading212-cash-isa'],
          selectedStockIds: ['vanguard-ftse-all-world'],
          bankAllocations: [],
          stockAllocations: [],
          rationale: 'Growth split selected by Argon.',
          rationaleBullets: ['Growth: 45% cash, 55% equities'],
          decidedBy: 'gemini-4-argon',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await askPromise;

    const snap = getProjectionsSnapshot();
    expect(snap.argonBusy).toBe(false);
    expect(snap.v?.decidedBy).toBe('gemini-4-argon');
    expect(snap.v?.riskProfile).toBe('growth');

    const rawPersisted = localStorage.getItem('mrmoney.projections.v1');
    expect(rawPersisted).toBeTruthy();
    expect(JSON.parse(rawPersisted!).decidedBy).toBe('gemini-4-argon');
  });
});
