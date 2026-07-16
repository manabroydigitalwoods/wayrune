/**
 * Client storage kit for non-secret UI prefs and short-lived cache.
 *
 * Use:
 * - `local` / `session` — theme, table columns, view mode
 * - `cookies` — non-secret prefs that benefit from early availability (e.g. theme)
 * - `memoryCache` — in-memory TTL cache for non-sensitive data
 *
 * Never store access/refresh tokens or other secrets here.
 * Auth cookies are httpOnly and set only by the API.
 */

export type StorageEnvelope<T> = {
  v: number;
  exp?: number;
  data: T;
};

export type StorageWriteOptions = {
  /** Schema version; mismatched reads are treated as miss. */
  version?: number;
  /** Time-to-live in milliseconds from write time. */
  ttlMs?: number;
};

export type CookieWriteOptions = {
  path?: string;
  maxAge?: number;
  expires?: Date;
  domain?: string;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
};

export type NamespacedStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => boolean;
  removeItem: (key: string) => void;
  clearNamespace: () => void;
  getJson: <T>(key: string, options?: { version?: number }) => T | null;
  setJson: <T>(key: string, data: T, options?: StorageWriteOptions) => boolean;
  migrateFrom: (legacyKey: string, nextKey: string) => string | null;
};
