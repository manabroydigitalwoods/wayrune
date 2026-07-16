export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

export function safeGetStorage(kind: 'local' | 'session'): Storage | null {
  if (!isBrowser()) return null;
  try {
    const storage = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = '__travel_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
