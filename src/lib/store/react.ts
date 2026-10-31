'use client';
import { useSyncExternalStore } from 'react';
import { createAppStore, londonToday, type AppSnapshot, type AppStore } from './store';
import { LocalStorageAdapter } from './storage';

let singleton: AppStore | null = null;
/** Browser-only singleton backed by localStorage. */
export function getAppStore(): AppStore {
  if (!singleton) singleton = createAppStore({ storage: new LocalStorageAdapter() });
  return singleton;
}

const SERVER_SNAPSHOT: AppSnapshot = {
  hydrated: false, state: null, demoActive: false, demoDate: null, today: '1970-01-01', canUndo: false, undoDepth: 0,
  changeId: 0, changedDays: [], changedItems: [], lastDiff: null, loadStatus: 'empty', persistOk: true,
};

export function useAppSnapshot(): AppSnapshot {
  return useSyncExternalStore(
    (l) => getAppStore().subscribe(l),
    () => getAppStore().getSnapshot(),
    () => SERVER_SNAPSHOT,
  );
}

/** Snapshot plus actions. */
export function useAppStore(): { snapshot: AppSnapshot; store: AppStore } {
  return { snapshot: useAppSnapshot(), store: getAppStore() };
}
export { londonToday };
