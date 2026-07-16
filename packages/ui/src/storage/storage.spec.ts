import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryCache } from './cache';
import { createStorage } from './create-storage';
import { getCookie, removeCookie, setCookie } from './cookies';

function mockWebStorage() {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
  return storage;
}

describe('createStorage', () => {
  beforeEach(() => {
    const local = mockWebStorage();
    vi.stubGlobal('window', {
      localStorage: local,
      sessionStorage: mockWebStorage(),
      document: {},
    });
    vi.stubGlobal('localStorage', local);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('namespaces keys and round-trips json with version', () => {
    const store = createStorage('local');
    expect(store.setJson('ui.theme', 'dark', { version: 1 })).toBe(true);
    expect(store.getJson<string>('ui.theme', { version: 1 })).toBe('dark');
    expect(localStorage.getItem('travel.ui.theme')).toContain('"v":1');
  });

  it('drops expired and version-mismatched values', () => {
    const store = createStorage('local');
    store.setJson('tmp', { ok: true }, { version: 1, ttlMs: -1 });
    expect(store.getJson('tmp', { version: 1 })).toBeNull();

    store.setJson('tmp2', { ok: true }, { version: 1 });
    expect(store.getJson('tmp2', { version: 2 })).toBeNull();
  });

  it('migrates legacy keys once', () => {
    localStorage.setItem('travel-ui-theme', 'light');
    const store = createStorage('local');
    expect(store.migrateFrom('travel-ui-theme', 'ui.theme')).toBe('light');
    expect(store.getItem('ui.theme')).toBe('light');
    expect(localStorage.getItem('travel-ui-theme')).toBeNull();
  });

  it('clearNamespace removes only prefixed keys', () => {
    const store = createStorage('local');
    store.setItem('a', '1');
    localStorage.setItem('other', 'x');
    store.clearNamespace();
    expect(store.getItem('a')).toBeNull();
    expect(localStorage.getItem('other')).toBe('x');
  });
});

describe('memoryCache', () => {
  it('expires entries by ttl', () => {
    vi.useFakeTimers();
    const cache = createMemoryCache();
    cache.set('k', 1, 1000);
    expect(cache.get('k')).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cache.get('k')).toBeNull();
    vi.useRealTimers();
  });
});

describe('cookies', () => {
  beforeEach(() => {
    let jar = '';
    vi.stubGlobal('window', { document: {} });
    vi.stubGlobal('document', {
      get cookie() {
        return jar;
      },
      set cookie(value: string) {
        const [pair] = value.split(';');
        const name = pair!.split('=')[0]!;
        const rest = jar
          .split('; ')
          .filter(Boolean)
          .filter((p) => !p.startsWith(`${name}=`));
        if (value.includes('Max-Age=0')) {
          jar = rest.join('; ');
          return;
        }
        rest.push(pair!);
        jar = rest.join('; ');
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sets and reads non-secret cookies', () => {
    expect(setCookie('travel.ui.theme', 'dark', { maxAge: 60 })).toBe(true);
    expect(getCookie('travel.ui.theme')).toBe('dark');
    removeCookie('travel.ui.theme');
    expect(getCookie('travel.ui.theme')).toBeNull();
  });
});
