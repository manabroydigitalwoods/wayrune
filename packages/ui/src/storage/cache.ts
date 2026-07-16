import { createStorage } from './create-storage';
import type { StorageWriteOptions } from './types';

type CacheEntry<T> = {
  value: T;
  exp?: number;
};

export type MemoryCache = {
  get: <T>(key: string) => T | null;
  set: <T>(key: string, value: T, ttlMs?: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

export function createMemoryCache(maxEntries = 200): MemoryCache {
  const map = new Map<string, CacheEntry<unknown>>();

  function prune() {
    const now = Date.now();
    for (const [key, entry] of map) {
      if (entry.exp != null && now > entry.exp) map.delete(key);
    }
    while (map.size > maxEntries) {
      const oldest = map.keys().next().value;
      if (oldest == null) break;
      map.delete(oldest);
    }
  }

  return {
    get<T>(key: string) {
      const entry = map.get(key) as CacheEntry<T> | undefined;
      if (!entry) return null;
      if (entry.exp != null && Date.now() > entry.exp) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    set<T>(key: string, value: T, ttlMs?: number) {
      map.delete(key);
      map.set(key, {
        value,
        ...(ttlMs != null ? { exp: Date.now() + ttlMs } : {}),
      });
      prune();
    },
    remove(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

export const memoryCache = createMemoryCache();

/** Session-backed cache for non-sensitive data (survives reloads within the tab session). */
export function createPersistentCache(namespace = 'cache.') {
  const store = createStorage('session', `travel.${namespace}`);
  return {
    getJson<T>(key: string, options?: { version?: number }) {
      return store.getJson<T>(key, options);
    },
    setJson<T>(key: string, data: T, options?: StorageWriteOptions) {
      return store.setJson(key, data, options);
    },
    remove(key: string) {
      store.removeItem(key);
    },
    clear() {
      store.clearNamespace();
    },
  };
}

export const persistentCache = createPersistentCache();
