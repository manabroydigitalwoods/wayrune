import { describe, expect, it } from 'vitest';
import {
  lastUsedMarkupStorageKey,
  normalizeLastUsedMarkup,
  readLastUsedMarkup,
  writeLastUsedMarkup,
  type StorageLike,
} from './lastUsedMarkup';

function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

describe('lastUsedMarkup', () => {
  it('namespaces the key by org + user', () => {
    expect(lastUsedMarkupStorageKey('org1', 'user1')).toBe(
      'wayrune:last-markup:v1:org1:user1',
    );
    expect(lastUsedMarkupStorageKey()).toBe('wayrune:last-markup:v1:org:user');
  });

  it('normalizes valid markup and rejects junk', () => {
    expect(normalizeLastUsedMarkup({ mode: 'percent', value: 22.5 })).toEqual({
      mode: 'percent',
      value: 22.5,
    });
    expect(normalizeLastUsedMarkup({ mode: 'fixed', value: 1500 })).toEqual({
      mode: 'fixed',
      value: 1500,
    });
    expect(normalizeLastUsedMarkup({ mode: 'percent', value: 900 })).toBeNull();
    expect(normalizeLastUsedMarkup({ mode: 'percent', value: -5 })).toBeNull();
    expect(normalizeLastUsedMarkup({ mode: 'weird', value: 10 })).toBeNull();
    expect(normalizeLastUsedMarkup(null)).toBeNull();
  });

  it('round-trips through injected storage', () => {
    const store = memoryStorage();
    const key = lastUsedMarkupStorageKey('org1', 'user1');
    expect(readLastUsedMarkup(key, store)).toBeNull();
    writeLastUsedMarkup(key, { mode: 'percent', value: 18 }, store);
    expect(readLastUsedMarkup(key, store)).toEqual({ mode: 'percent', value: 18 });
    writeLastUsedMarkup(key, { mode: 'fixed', value: 2000 }, store);
    expect(readLastUsedMarkup(key, store)).toEqual({ mode: 'fixed', value: 2000 });
  });

  it('ignores invalid writes and corrupt reads', () => {
    const store = memoryStorage({ 'k-corrupt': '{not json' });
    expect(readLastUsedMarkup('k-corrupt', store)).toBeNull();
    writeLastUsedMarkup('k-bad', { mode: 'percent', value: 999 }, store);
    expect(readLastUsedMarkup('k-bad', store)).toBeNull();
  });
});
