import { describe, expect, it, beforeEach } from 'vitest';
import {
  dropRecentDestination,
  readRecentDestinations,
  rememberRecentDestination,
} from './recentDestinations';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
});

describe('recentDestinations', () => {
  it('scopes by organisation and keeps MRU order', () => {
    rememberRecentDestination('org-a', { id: '1', name: 'Darjeeling', kind: 'city' });
    rememberRecentDestination('org-a', { id: '2', name: 'Gangtok', kind: 'city' });
    rememberRecentDestination('org-b', { id: '3', name: 'Goa', kind: 'city' });
    expect(readRecentDestinations('org-a').map((p) => p.id)).toEqual(['2', '1']);
    expect(readRecentDestinations('org-b').map((p) => p.id)).toEqual(['3']);
  });

  it('drops missing ids', () => {
    rememberRecentDestination('org-a', { id: '1', name: 'Darjeeling', kind: 'city' });
    dropRecentDestination('org-a', '1');
    expect(readRecentDestinations('org-a')).toEqual([]);
  });
});
