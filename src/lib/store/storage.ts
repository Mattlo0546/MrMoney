/** Storage adapters and the versioned persisted schema. Every access is guarded: blocked storage must never crash the app. */
import type { EngineState, ISODate } from '@/lib/engine';

export const STORAGE_KEY = 'mrmoney:v1';
export const SCHEMA_VERSION = 1;

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistedV1 {
  version: 1;
  state: EngineState | null;
  undoStack?: EngineState[];
  demo: { active: boolean; demoDate: ISODate | null };
}

export type LoadStatus = 'ok' | 'empty' | 'corrupt' | 'unavailable';
export interface LoadResult {
  data: PersistedV1;
  status: LoadStatus;
  /** Human-readable reason when status is corrupt/unavailable. */
  reason?: string;
}

export const emptyPersisted = (): PersistedV1 => ({ version: 1, state: null, undoStack: [], demo: { active: false, demoDate: null } });

/** In-memory adapter for tests. `failWith` makes every call throw, to simulate blocked storage. */
export class MemoryStorage implements StorageAdapter {
  readonly map = new Map<string, string>();
  failWith: Error | null = null;
  getItem(key: string): string | null {
    if (this.failWith) throw this.failWith;
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWith) throw this.failWith;
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failWith) throw this.failWith;
    this.map.delete(key);
  }
}

/** localStorage-backed adapter; resolves the global lazily and throws if absent/blocked (callers catch). */
export class LocalStorageAdapter implements StorageAdapter {
  private ls(): Storage {
    if (typeof localStorage === 'undefined') throw new Error('localStorage unavailable');
    return localStorage;
  }
  getItem(key: string) {
    return this.ls().getItem(key);
  }
  setItem(key: string, value: string) {
    this.ls().setItem(key, value);
  }
  removeItem(key: string) {
    this.ls().removeItem(key);
  }
}

/** Migration hook: upgrade raw parsed data to the current schema, in order. Returns null if unknown/unsupported. */
export const migrations: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // Future: 1: (raw) => ({ ...raw, version: 2, ... })
};
export function migrate(raw: unknown): PersistedV1 | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let cur = raw as Record<string, unknown>;
  let guard = 0;
  while (typeof cur.version === 'number' && cur.version < SCHEMA_VERSION && guard++ < 50) {
    const step = migrations[cur.version];
    if (!step) return null;
    cur = step(cur);
  }
  if (cur.version !== SCHEMA_VERSION) return null;
  const demo = cur.demo as { active?: unknown; demoDate?: unknown } | undefined;
  const state = cur.state as EngineState | null | undefined;
  if (state !== null && state !== undefined && (typeof state !== 'object' || !state.profile || !Array.isArray(state.ledger))) return null;
  const undoStack = Array.isArray(cur.undoStack) ? (cur.undoStack as EngineState[]) : [];
  return {
    version: 1,
    state: state ?? null,
    undoStack,
    demo: { active: demo?.active === true, demoDate: typeof demo?.demoDate === 'string' ? demo.demoDate : null },
  };
}

export function loadPersisted(storage: StorageAdapter): LoadResult {
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch (e) {
    return { data: emptyPersisted(), status: 'unavailable', reason: String(e) };
  }
  if (text === null) return { data: emptyPersisted(), status: 'empty' };
  try {
    const data = migrate(JSON.parse(text));
    if (!data) return { data: emptyPersisted(), status: 'corrupt', reason: 'Unknown or invalid schema' };
    return { data, status: 'ok' };
  } catch (e) {
    return { data: emptyPersisted(), status: 'corrupt', reason: String(e) };
  }
}

/** Returns true if written. Never throws. */
export function savePersisted(storage: StorageAdapter, data: PersistedV1): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearPersisted(storage: StorageAdapter): boolean {
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
