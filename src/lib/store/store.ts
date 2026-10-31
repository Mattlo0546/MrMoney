/** App store: external store holding engine state, undo stack, demo flag and highlight state. All maths is the engine's. */
import {
  applyIntent, canUndo, commit, computeDiff, createUndoStack, demoFixture, ensurePlan, generatePlan, previewIntent, undo as engineUndo,
  validateState,
} from '@/lib/engine';
import type {
  Affordability, ApplyResult, ChangeSet, Commitment, EngineState, Income, Intent, ISODate, PlannedPurchase, Profile, Transaction,
} from '@/lib/engine';
type UndoStack = ReturnType<typeof createUndoStack>;
import {
  clearPersisted, emptyPersisted, loadPersisted, savePersisted, type LoadStatus, type PersistedV1, type StorageAdapter,
} from './storage';

export type PreviewResult = ApplyResult & { intent: Intent; today: ISODate; affordability?: Affordability };

export interface AppSnapshot {
  hydrated: boolean;
  /** null until onboarding completes or demo starts. */
  state: EngineState | null;
  demoActive: boolean;
  demoDate: ISODate | null;
  /** Demo date in demo mode, else the real London calendar date. */
  today: ISODate;
  canUndo: boolean;
  undoDepth: number;
  /** Highlight state; changeId increments on every apply/undo so the UI animates once per change. */
  changeId: number;
  changedDays: ISODate[];
  /** Keys: `day|category` for changed plan cells, `ledger:<id>` for added ledger entries. */
  changedItems: string[];
  lastDiff: ChangeSet | null;
  loadStatus: LoadStatus;
  loadReason?: string;
  /** False when the last write failed (blocked storage); the session still works. */
  persistOk: boolean;
}

export type ApplyOutcome =
  | { ok: true; noop: boolean; diff: ChangeSet | null; changeId: number }
  | { ok: false; error?: { code: string; message: string }; needsClarification?: { field: string; question: string } };

export interface OnboardingExtras {
  commitments?: Commitment[];
  incomes?: Income[];
}

export interface AppStoreOptions {
  storage: StorageAdapter;
  /** Injectable clock for tests. */
  now?: () => Date;
  undoLimit?: number;
}

/** Real London calendar date (YYYY-MM-DD). */
export function londonToday(d: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const UNDO_SYNTH_INTENT: Intent = { kind: 'settingsEdit', idempotencyKey: 'undo', patch: {} };

export function createAppStore(opts: AppStoreOptions) {
  const { storage } = opts;
  const now = opts.now ?? (() => new Date());
  const undoLimit = opts.undoLimit ?? 20;
  const listeners = new Set<() => void>();

  let state: EngineState | null = null;
  let stack: UndoStack = createUndoStack(undoLimit);
  let demo: PersistedV1['demo'] = { active: false, demoDate: null };
  let snap: AppSnapshot;

  const todayNow = (): ISODate => (demo.active && demo.demoDate ? demo.demoDate : londonToday(now()));

  let meta = {
    changeId: 0, changedDays: [] as ISODate[], changedItems: [] as string[], lastDiff: null as ChangeSet | null,
    loadStatus: 'empty' as LoadStatus, loadReason: undefined as string | undefined, persistOk: true, hydrated: false,
  };

  function build(): AppSnapshot {
    return {
      hydrated: meta.hydrated, state, demoActive: demo.active, demoDate: demo.demoDate, today: todayNow(),
      canUndo: canUndo(stack), undoDepth: stack.entries.length, changeId: meta.changeId, changedDays: meta.changedDays,
      changedItems: meta.changedItems, lastDiff: meta.lastDiff, loadStatus: meta.loadStatus, loadReason: meta.loadReason,
      persistOk: meta.persistOk,
    };
  }
  function emit(persist: boolean) {
    if (persist) {
      meta.persistOk = savePersisted(storage, { version: 1, state, undoStack: stack.entries, demo });
    }
    snap = build();
    listeners.forEach((l) => l());
  }

  function hydrate() {
    const res = loadPersisted(storage);
    const d = res.data;
    state = d.state;
    stack = { entries: d.undoStack ?? [], limit: undoLimit };
    demo = d.demo;
    // Roll the plan forward if it was computed for another day.
    if (state) {
      try {
        state = ensurePlan(state, todayNow());
      } catch {
        state = null;
        stack = createUndoStack(undoLimit);
        demo = emptyPersisted().demo;
        res.status = 'corrupt';
        res.reason = 'Saved plan could not be loaded';
      }
    }
    meta = { ...meta, loadStatus: res.status, loadReason: res.reason, hydrated: true };
    emit(false);
  }

  function setChange(diff: ChangeSet | null) {
    meta.changeId += 1;
    meta.lastDiff = diff;
    meta.changedDays = diff ? [...diff.changedDays] : [];
    meta.changedItems = diff
      ? [...new Set([...diff.cellChanges.map((c) => `${c.day}|${c.category}`), ...diff.ledgerAdded.map((t) => `ledger:${t.id}`)])]
      : [];
  }

  const reload = (): void => hydrate();
  hydrate();

  function applyOutcome(r: ApplyResult): ApplyOutcome | null {
    if (r.ok) return null;
    return r.error ? { ok: false, error: r.error } : { ok: false, needsClarification: r.needsClarification };
  }

  /** Commit an intent (or a preview of one). Same key twice is a no-op. */
  function apply(intentOrPreview: Intent | PreviewResult, idempotencyKey?: string): ApplyOutcome {
    if (!state) return { ok: false, error: { code: 'invalid', message: 'No plan yet.' } };
    const base: Intent = 'intent' in intentOrPreview ? intentOrPreview.intent : intentOrPreview;
    const key = idempotencyKey ?? base.idempotencyKey;
    if (state.processedKeys.includes(key)) return { ok: true, noop: true, diff: null, changeId: meta.changeId };
    const intent = { ...base, idempotencyKey: key } as Intent;
    const before = state;
    const res = applyIntent(before, intent, todayNow());
    const fail = applyOutcome(res);
    if (fail) return fail;
    if (!res.ok) return { ok: false };
    const c = commit(stack, ensurePlan(before, todayNow()), res.nextState);
    stack = c.stack;
    state = c.state;
    setChange(res.diff);
    emit(true);
    return { ok: true, noop: res.diff.noop, diff: res.diff, changeId: meta.changeId };
  }

  let itinerarySeq = 0;
  const freshKey = () => {
    const rnd = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${now().getTime()}-${Math.random().toString(36).slice(2)}`;
    return `itinerary:${rnd}:${++itinerarySeq}`;
  };

  return {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot: (): AppSnapshot => snap,
    /** Re-read storage (e.g. simulated reload / cross-tab). */
    reload,

    startDemo() {
      const f = demoFixture();
      state = f.state;
      stack = createUndoStack(undoLimit);
      demo = { active: true, demoDate: f.today };
      setChange(null);
      emit(true);
    },

    completeOnboarding(profile: Profile, extras: OnboardingExtras = {}): { ok: true } | { ok: false; errors: Record<string, string> } {
      const draft: EngineState = {
        schemaVersion: 1, profile: structuredClone(profile), commitments: structuredClone(extras.commitments ?? []),
        incomes: structuredClone(extras.incomes ?? []), ledger: [], preferences: [], plannedPurchases: [], processedKeys: [], plan: null,
      };
      const errors = validateState(draft);
      if (Object.keys(errors).length) return { ok: false, errors };
      try {
        draft.plan = generatePlan(draft, todayNow());
      } catch (e) {
        return { ok: false, errors: { _: e instanceof Error ? e.message : 'Could not build a plan' } };
      }
      state = draft;
      stack = createUndoStack(undoLimit);
      demo = { active: false, demoDate: null };
      setChange(null);
      emit(true);
      return { ok: true };
    },

    /** Computes a preview via the engine; touches neither state, storage nor listeners. */
    preview(intent: Intent): PreviewResult | null {
      if (!state) return null;
      const today = todayNow();
      return { ...previewIntent(state, intent, today), intent, today } as PreviewResult;
    },

    apply,

    /** Replace the creative itinerary's planned purchases (source 'itinerary') and set the allocation mode.
     * Goes through the normal apply path (undo, persistence, highlights). */
    applyItinerary(purchases: PlannedPurchase[], mode: 'itemised' | 'even' = 'itemised'): ApplyOutcome {
      return apply({ kind: 'itinerary', idempotencyKey: freshKey(), purchases: structuredClone(purchases), mode });
    },

    undo(): boolean {
      if (!state) return false;
      const r = engineUndo(stack);
      if (!r) return false;
      const before = state;
      stack = r.stack;
      state = r.state;
      let diff: ChangeSet | null = null;
      try {
        diff = computeDiff(before, state, UNDO_SYNTH_INTENT, todayNow());
      } catch {
        diff = null;
      }
      setChange(diff);
      emit(true);
      return true;
    },

    /**
     * Edit or delete a ledger entry / income (engine has no intent for this, so the store edits the record
     * and asks the engine to re-plan). Pushes an undo snapshot.
     */
    editEntry(edit:
      | { type: 'ledger'; id: string; patch?: Partial<Pick<Transaction, 'amount' | 'date' | 'category' | 'note'>>; remove?: boolean }
      | { type: 'income'; id: string; patch?: Partial<Pick<Income, 'amount' | 'date' | 'note' | 'confirmed'>>; remove?: boolean },
    ): ApplyOutcome {
      if (!state) return { ok: false, error: { code: 'invalid', message: 'No plan yet.' } };
      const today = todayNow();
      const before = ensurePlan(state, today);
      const next = structuredClone(before);
      const list = (edit.type === 'ledger' ? next.ledger : next.incomes) as { id: string }[];
      const i = list.findIndex((x) => x.id === edit.id);
      if (i < 0) return { ok: false, error: { code: 'invalid', message: 'Entry not found.' } };
      if (edit.remove) list.splice(i, 1);
      else Object.assign(list[i], edit.patch ?? {});
      try {
        next.plan = generatePlan(next, today);
      } catch (e) {
        return { ok: false, error: { code: 'invalid', message: e instanceof Error ? e.message : 'Could not re-plan' } };
      }
      const diff = computeDiff(before, next, UNDO_SYNTH_INTENT, today);
      const c = commit(stack, before, next);
      stack = c.stack;
      state = c.state;
      setChange(diff);
      emit(true);
      return { ok: true, noop: false, diff, changeId: meta.changeId };
    },

    /** Clears persisted data and returns to onboarding. */
    reset() {
      state = null;
      stack = createUndoStack(undoLimit);
      demo = { active: false, demoDate: null };
      meta = { ...meta, changeId: meta.changeId + 1, changedDays: [], changedItems: [], lastDiff: null, loadStatus: 'empty', loadReason: undefined };
      const ok = clearPersisted(storage);
      emit(false);
      meta.persistOk = ok;
      snap = build();
      listeners.forEach((l) => l());
    },
  };
}

export type AppStore = ReturnType<typeof createAppStore>;
