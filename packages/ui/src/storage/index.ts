/**
 * Production-ready client storage for UI prefs and cache.
 *
 * - Prefer `local` / `session` for durable prefs (theme, columns, view).
 * - Prefer `cookies` only for non-secret values needed before JS hydrates.
 * - Prefer `memoryCache` for short-lived non-sensitive data.
 *
 * Never store JWTs or secrets. Auth uses httpOnly cookies set by the API.
 */

export type {
  CookieWriteOptions,
  NamespacedStorage,
  StorageEnvelope,
  StorageWriteOptions,
} from './types';
export { isBrowser, safeGetStorage } from './safe';
export {
  createStorage,
  localStorageKit,
  sessionStorageKit,
} from './create-storage';
export {
  getCookie,
  setCookie,
  removeCookie,
  getJsonCookie,
  setJsonCookie,
} from './cookies';
export {
  createMemoryCache,
  memoryCache,
  createPersistentCache,
  persistentCache,
  type MemoryCache,
} from './cache';
export { StorageKeys, LegacyStorageKeys } from './keys';
export { usePersistentState } from './hooks';
