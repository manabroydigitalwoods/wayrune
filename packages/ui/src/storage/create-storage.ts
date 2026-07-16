import { safeGetStorage } from './safe';
import type { NamespacedStorage, StorageEnvelope, StorageWriteOptions } from './types';

const DEFAULT_PREFIX = 'travel.';

function resolveKey(prefix: string, key: string) {
  if (key.startsWith(prefix)) return key;
  return `${prefix}${key.replace(/^\./, '')}`;
}

function parseEnvelope<T>(raw: string, expectedVersion?: number): T | null {
  try {
    const parsed = JSON.parse(raw) as StorageEnvelope<T> | T;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'data' in parsed &&
      'v' in parsed &&
      typeof (parsed as StorageEnvelope<T>).v === 'number'
    ) {
      const env = parsed as StorageEnvelope<T>;
      if (expectedVersion != null && env.v !== expectedVersion) return null;
      if (env.exp != null && Date.now() > env.exp) return null;
      return env.data;
    }
    // Legacy plain JSON / string payloads
    if (expectedVersion != null) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function createStorage(
  kind: 'local' | 'session',
  prefix = DEFAULT_PREFIX,
): NamespacedStorage {
  const fullKey = (key: string) => resolveKey(prefix, key);

  return {
    getItem(key) {
      const storage = safeGetStorage(kind);
      if (!storage) return null;
      try {
        return storage.getItem(fullKey(key));
      } catch {
        return null;
      }
    },

    setItem(key, value) {
      const storage = safeGetStorage(kind);
      if (!storage) return false;
      try {
        storage.setItem(fullKey(key), value);
        return true;
      } catch {
        return false;
      }
    },

    removeItem(key) {
      const storage = safeGetStorage(kind);
      if (!storage) return;
      try {
        storage.removeItem(fullKey(key));
      } catch {
        /* ignore */
      }
    },

    clearNamespace() {
      const storage = safeGetStorage(kind);
      if (!storage) return;
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k?.startsWith(prefix)) toRemove.push(k);
        }
        for (const k of toRemove) storage.removeItem(k);
      } catch {
        /* ignore */
      }
    },

    getJson<T>(key: string, options?: { version?: number }): T | null {
      const raw = this.getItem(key);
      if (raw == null) return null;
      const data = parseEnvelope<T>(raw, options?.version);
      if (data == null) {
        this.removeItem(key);
        return null;
      }
      return data;
    },

    setJson<T>(key: string, data: T, options: StorageWriteOptions = {}): boolean {
      const version = options.version ?? 1;
      const envelope: StorageEnvelope<T> = {
        v: version,
        data,
        ...(options.ttlMs != null ? { exp: Date.now() + options.ttlMs } : {}),
      };
      return this.setItem(key, JSON.stringify(envelope));
    },

    migrateFrom(legacyKey, nextKey) {
      const storage = safeGetStorage(kind);
      if (!storage) return null;
      try {
        const existing = this.getItem(nextKey);
        if (existing != null) return existing;
        const legacy = storage.getItem(legacyKey);
        if (legacy == null) return null;
        this.setItem(nextKey, legacy);
        storage.removeItem(legacyKey);
        return legacy;
      } catch {
        return null;
      }
    },
  };
}

export const localStorageKit = createStorage('local');
export const sessionStorageKit = createStorage('session');
