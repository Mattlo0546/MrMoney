/**
 * Server-only persistent cache for search results (live research, lifestyle menus, itinerary catalogues), so they
 * survive dev-server restarts. SQLite via Node's built-in `node:sqlite` (no dependency, no account).
 *
 * `persistentCache(ns)` is a drop-in for the `Map<string, { at, ... }>` the research modules used: an in-memory map in
 * front of one SQLite table, written through on `set`. Entries are kept past their TTL on purpose (callers decide
 * freshness from `at`, and a stale live result beats sample data); rows older than PRUNE_AFTER_MS are deleted on open.
 *
 * File: CACHE_DB_PATH, else `.data/cache.db` (on Vercel `/tmp/cache.db`, which only lives as long as the instance).
 * Tests use an in-memory database. If SQLite can't open, the cache quietly stays memory-only.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

let db: DatabaseSync | null | undefined;

export function cacheDbPath(): string {
  if (process.env.VITEST) return ':memory:';
  if (process.env.CACHE_DB_PATH) return process.env.CACHE_DB_PATH;
  return process.env.VERCEL ? '/tmp/cache.db' : resolve(process.cwd(), '.data/cache.db');
}

function open(): DatabaseSync | null {
  if (db !== undefined) return db;
  try {
    const path = cacheDbPath();
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const d = new DatabaseSync(path);
    d.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS cache (ns TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (ns, key))');
    d.prepare('DELETE FROM cache WHERE at < ?').run(Date.now() - PRUNE_AFTER_MS);
    db = d;
  } catch (e) {
    console.warn('[cache] SQLite unavailable, using memory only:', e instanceof Error ? e.message : e);
    db = null;
  }
  return db;
}

export interface PersistentCache<V extends { at: number }> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
}

export function persistentCache<V extends { at: number }>(ns: string): PersistentCache<V> {
  const mem = new Map<string, V>();
  return {
    get(key) {
      const hit = mem.get(key);
      if (hit) return hit;
      try {
        const row = open()?.prepare('SELECT value FROM cache WHERE ns = ? AND key = ?').get(ns, key) as { value: string } | undefined;
        if (!row) return undefined;
        const value = JSON.parse(row.value) as V;
        mem.set(key, value);
        return value;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      mem.set(key, value);
      try {
        open()?.prepare('INSERT OR REPLACE INTO cache (ns, key, at, value) VALUES (?, ?, ?, ?)').run(ns, key, value.at, JSON.stringify(value));
      } catch { /* memory copy still serves */ }
    },
    delete(key) {
      mem.delete(key);
      try { open()?.prepare('DELETE FROM cache WHERE ns = ? AND key = ?').run(ns, key); } catch { /* ignore */ }
    },
    clear() {
      mem.clear();
      try { open()?.prepare('DELETE FROM cache WHERE ns = ?').run(ns); } catch { /* ignore */ }
    },
  };
}
