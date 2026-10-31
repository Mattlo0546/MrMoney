import { describe, expect, it } from 'vitest';
import { persistentCache } from './db';

describe('persistentCache', () => {
  it('a fresh instance (as after a restart) reads what an earlier one stored', () => {
    const a = persistentCache<{ at: number; v: string[] }>('t-restart');
    a.set('k', { at: 123, v: ['x', 'y'] });
    const b = persistentCache<{ at: number; v: string[] }>('t-restart');
    expect(b.get('k')).toEqual({ at: 123, v: ['x', 'y'] });
    expect(b.get('missing')).toBeUndefined();
  });

  it('namespaces are separate, and clear only empties its own', () => {
    const a = persistentCache<{ at: number }>('t-a');
    const b = persistentCache<{ at: number }>('t-b');
    a.set('k', { at: 1 });
    b.set('k', { at: 2 });
    a.clear();
    expect(persistentCache<{ at: number }>('t-a').get('k')).toBeUndefined();
    expect(persistentCache<{ at: number }>('t-b').get('k')).toEqual({ at: 2 });
  });
});
