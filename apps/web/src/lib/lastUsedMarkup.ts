/**
 * Remember the last Match-applied markup (mode + value) per org user so the
 * next Match apply / new line defaults to what the consultant just used.
 *
 * Stored in localStorage keyed by org + user. Pure helpers stay testable in a
 * plain node environment via an injectable {@link StorageLike}.
 */

export type LastUsedMarkupMode = 'percent' | 'fixed';

export type LastUsedMarkup = {
  mode: LastUsedMarkupMode;
  value: number;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Namespaced per org + user; falls back to a shared bucket when ids are missing. */
export function lastUsedMarkupStorageKey(
  orgId?: string | null,
  userId?: string | null,
): string {
  return `wayrune:last-markup:v1:${orgId || 'org'}:${userId || 'user'}`;
}

/** Coerce arbitrary JSON into a valid markup or null (percent 0–500, fixed ≥ 0). */
export function normalizeLastUsedMarkup(raw: unknown): LastUsedMarkup | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const mode = obj.mode === 'fixed' ? 'fixed' : obj.mode === 'percent' ? 'percent' : null;
  if (!mode) return null;
  const value = Number(obj.value);
  if (!Number.isFinite(value) || value < 0) return null;
  if (mode === 'percent' && value > 500) return null;
  return { mode, value: Math.round(value * 100) / 100 };
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* access blocked (private mode / SSR) */
  }
  return null;
}

export function readLastUsedMarkup(
  key: string,
  storage?: StorageLike | null,
): LastUsedMarkup | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    return normalizeLastUsedMarkup(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLastUsedMarkup(
  key: string,
  markup: LastUsedMarkup,
  storage?: StorageLike | null,
): void {
  const normalized = normalizeLastUsedMarkup(markup);
  if (!normalized) return;
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(normalized));
  } catch {
    /* quota / private mode — non-fatal */
  }
}
