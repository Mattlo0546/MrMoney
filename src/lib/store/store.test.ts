import { describe, expect, it } from 'vitest';
import { gbp, DEMO_TODAY } from '@/lib/engine';
import type { Intent } from '@/lib/engine';
import { createAppStore, MemoryStorage, STORAGE_KEY, LocalStorageAdapter } from './index';

const expense = (key: string, pence = 3500): Intent => ({
  kind: 'expense', idempotencyKey: key, amount: gbp(pence), date: DEMO_TODAY, category: 'eating-out',
});
const mk = (storage = new MemoryStorage()) => ({ storage, store: createAppStore({ storage, now: () => new Date('2026-03-05T12:00:00Z') }) });

describe('store', () => {
  it('demo mode uses the demo date; non-demo uses London date', () => {
    const { store } = mk();
    expect(store.getSnapshot().today).toBe('2026-03-05');
    store.startDemo();
    expect(store.getSnapshot().today).toBe(DEMO_TODAY);
  });

  it('persists across a simulated reload', () => {
    const { storage, store } = mk();
    store.startDemo();
    expect(store.apply(expense('k1')).ok).toBe(true);
    const s2 = createAppStore({ storage });
    expect(s2.getSnapshot().state).toEqual(store.getSnapshot().state);
    expect(s2.getSnapshot().demoActive).toBe(true);
    expect(s2.getSnapshot().canUndo).toBe(true);
    expect(s2.getSnapshot().loadStatus).toBe('ok');
  });

  it('reset clears storage and state', () => {
    const { storage, store } = mk();
    store.startDemo();
    store.reset();
    expect(store.getSnapshot().state).toBeNull();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(createAppStore({ storage }).getSnapshot().state).toBeNull();
  });

  it('recovers from corrupted storage and reports it', () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, '{not json');
    expect(createAppStore({ storage }).getSnapshot()).toMatchObject({ state: null, loadStatus: 'corrupt' });
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, state: {} }));
    expect(createAppStore({ storage }).getSnapshot().loadStatus).toBe('corrupt');
  });

  it('preview does not mutate state or storage', () => {
    const { storage, store } = mk();
    store.startDemo();
    const stored = storage.getItem(STORAGE_KEY);
    const before = structuredClone(store.getSnapshot().state);
    let notified = 0;
    store.subscribe(() => notified++);
    const p = store.preview(expense('p1'));
    expect(p?.ok).toBe(true);
    expect(store.getSnapshot().state).toEqual(before);
    expect(storage.getItem(STORAGE_KEY)).toBe(stored);
    expect(notified).toBe(0);
  });

  it('apply then undo restores the original state exactly', () => {
    const { store } = mk();
    store.startDemo();
    const original = structuredClone(store.getSnapshot().state);
    const r = store.apply(expense('u1'));
    expect(r.ok && r.diff?.changedDays.length).toBeGreaterThan(0);
    expect(store.getSnapshot().state).not.toEqual(original);
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().state).toEqual(original);
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.undo()).toBe(false);
  });

  it('apply accepts a preview, and the same key twice is a no-op', () => {
    const { store } = mk();
    store.startDemo();
    const p = store.preview(expense('i1'))!;
    const a = store.apply(p, 'i1');
    expect(a.ok && !a.noop).toBe(true);
    const afterFirst = structuredClone(store.getSnapshot().state);
    const id = store.getSnapshot().changeId;
    const b = store.apply(p, 'i1');
    expect(b.ok && b.noop).toBe(true);
    expect(store.getSnapshot().state).toEqual(afterFirst);
    expect(store.getSnapshot().changeId).toBe(id);
    expect(store.getSnapshot().undoDepth).toBe(1);
  });

  it('exposes highlight state with a new changeId per change', () => {
    const { store } = mk();
    store.startDemo();
    const id0 = store.getSnapshot().changeId;
    store.apply(expense('h1'));
    const s1 = store.getSnapshot();
    expect(s1.changeId).toBe(id0 + 1);
    expect(s1.changedDays.length).toBeGreaterThan(0);
    expect(s1.changedItems.some((k) => k.startsWith('ledger:'))).toBe(true);
    store.undo();
    expect(store.getSnapshot().changeId).toBe(id0 + 2);
    expect(store.getSnapshot().changedDays.length).toBeGreaterThan(0);
  });

  it('editEntry edits a ledger entry, re-plans and is undoable', () => {
    const { store } = mk();
    store.startDemo();
    store.apply(expense('e1', 1000));
    const id = store.getSnapshot().state!.ledger[0].id;
    const before = structuredClone(store.getSnapshot().state);
    expect(store.editEntry({ type: 'ledger', id, patch: { amount: gbp(2000) } }).ok).toBe(true);
    expect(store.getSnapshot().state!.ledger[0].amount.pence).toBe(2000);
    store.undo();
    expect(store.getSnapshot().state).toEqual(before);
  });

  it('completeOnboarding validates and builds a plan', () => {
    const { store } = mk();
    const demoProfile = (() => { const s = createAppStore({ storage: new MemoryStorage() }); s.startDemo(); return s.getSnapshot().state!.profile; })();
    const bad = store.completeOnboarding({ ...demoProfile, horizonEnd: '2000-01-01' });
    expect(bad.ok).toBe(false);
    const ok = store.completeOnboarding({ ...demoProfile, planStart: '2026-03-05', horizonEnd: '2026-06-30' });
    expect(ok.ok).toBe(true);
    expect(store.getSnapshot().state?.plan).not.toBeNull();
  });

  it('applyItinerary applies itemised purchases, persists, highlights, and undoes', () => {
    const { storage, store } = mk();
    store.startDemo();
    const original = structuredClone(store.getSnapshot().state);
    const purchases = [
      { id: 'omelette', date: DEMO_TODAY, category: 'groceries', amount: gbp(450), label: 'Omelette', reason: 'cheap dinner',
        lines: [{ name: 'Eggs x6', pence: 450, ref: { id: 'r1', origin: 'research' as const, merchant: 'Tesco', item: 'Eggs', sourceUrl: 'https://tesco.com', checked: DEMO_TODAY } }] },
      { id: 'trainers', date: '2026-11-14', category: 'trainers', amount: gbp(4999), label: 'Trainers' },
    ];
    const r = store.applyItinerary(purchases);
    expect(r.ok && !r.noop).toBe(true);
    const s = store.getSnapshot().state!;
    expect(s.profile.allocationMode).toBe('itemised');
    expect(s.plannedPurchases.map((x) => x.source)).toEqual(['itinerary', 'itinerary']);
    expect(s.plannedPurchases[0].lines?.[0].name).toBe('Eggs x6');
    expect(store.getSnapshot().changedDays).toContain('2026-11-14');
    expect(createAppStore({ storage }).getSnapshot().state).toEqual(s);
    // A fresh key each time: applying again is not a no-op.
    const again = store.applyItinerary(purchases);
    expect(again.ok && !again.noop).toBe(true);
    expect(store.getSnapshot().state!.plannedPurchases.length).toBe(2);
    expect(store.undo()).toBe(true);
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().state).toEqual(original);
    const bad = store.applyItinerary([{ ...purchases[1], amount: gbp(10), lines: [{ ...purchases[0].lines![0], pence: 9 }] }]);
    expect(bad.ok).toBe(false);
  });

  it('does not crash when storage throws', () => {
    const storage = new MemoryStorage();
    storage.failWith = new Error('SecurityError');
    const store = createAppStore({ storage });
    expect(store.getSnapshot().loadStatus).toBe('unavailable');
    expect(() => store.startDemo()).not.toThrow();
    expect(store.getSnapshot().persistOk).toBe(false);
    expect(store.apply(expense('t1')).ok).toBe(true);
    expect(() => store.reset()).not.toThrow();
  });

  it('LocalStorageAdapter throws cleanly when localStorage is absent, and the store survives', () => {
    const store = createAppStore({ storage: new LocalStorageAdapter() });
    expect(store.getSnapshot().loadStatus).toBe('unavailable');
    expect(() => store.startDemo()).not.toThrow();
  });
});
