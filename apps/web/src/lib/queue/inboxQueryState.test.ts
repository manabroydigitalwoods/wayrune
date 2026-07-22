import { describe, expect, it } from 'vitest';
import {
  filterThreadRowsByQuery,
  inboxListApiQuery,
  inboxQueryHasFilters,
  inboxThreadsApiQuery,
  parseInboxQueryState,
  patchInboxQueryParams,
  serializeInboxQueryState,
} from './inboxQueryState';

describe('inboxQueryState', () => {
  it('defaults to threads view and needs-reply', () => {
    const state = parseInboxQueryState(new URLSearchParams());
    expect(state.view).toBe('threads');
    expect(state.pendingOnly).toBe(true);
    expect(state.unread).toBe(false);
    expect(state.aging).toBe(false);
  });

  it('preserves legacy `?unread=1&aging=1` deep links', () => {
    const state = parseInboxQueryState(new URLSearchParams('unread=1&aging=1'));
    expect(state.unread).toBe(true);
    expect(state.aging).toBe(true);
  });

  it('parses `?channel=` deep links', () => {
    const state = parseInboxQueryState(new URLSearchParams('channel=google_business'));
    expect(state.channel).toBe('google_business');
  });

  it('serializes omitting empty values and keeps view stable', () => {
    const qs = serializeInboxQueryState({ view: 'inbox', pendingOnly: true }).toString();
    expect(qs).toBe('view=inbox');
  });

  it('serializes pending=0 only when explicitly off', () => {
    expect(
      serializeInboxQueryState({ view: 'inbox', pendingOnly: false }).toString(),
    ).toBe('view=inbox&pending=0');
  });

  it('aging implies unread when patched', () => {
    const current = new URLSearchParams('view=threads');
    const next = patchInboxQueryParams(current, { aging: true });
    expect(next.get('unread')).toBe('1');
    expect(next.get('aging')).toBe('1');
  });

  it('turning unread off also drops aging', () => {
    const current = new URLSearchParams('view=threads&unread=1&aging=1');
    const next = patchInboxQueryParams(current, { unread: false });
    expect(next.get('unread')).toBeNull();
    expect(next.get('aging')).toBeNull();
  });

  it('clearFilters keeps view, q, and resets pendingOnly', () => {
    const current = new URLSearchParams('view=inbox&channel=whatsapp&pending=0&q=priya');
    const next = patchInboxQueryParams(current, { clearFilters: true });
    expect(next.get('view')).toBe('inbox');
    expect(next.get('q')).toBe('priya');
    expect(next.get('channel')).toBeNull();
    expect(next.get('pending')).toBeNull();
  });

  it('detects active filters', () => {
    expect(inboxQueryHasFilters({ view: 'threads', pendingOnly: true })).toBe(false);
    expect(inboxQueryHasFilters({ view: 'threads', channel: 'email', pendingOnly: true })).toBe(
      true,
    );
    expect(inboxQueryHasFilters({ view: 'inbox', pendingOnly: false })).toBe(true);
  });

  it('builds the All messages API query with outcome=pending by default', () => {
    const qs = inboxListApiQuery({ view: 'inbox', pendingOnly: true, q: 'priya' }, { pageSize: 50 });
    const params = new URLSearchParams(qs);
    expect(params.get('pageSize')).toBe('50');
    expect(params.get('outcome')).toBe('pending');
    expect(params.get('q')).toBe('priya');
  });

  it('drops outcome=pending once pendingOnly is turned off', () => {
    const qs = inboxListApiQuery({ view: 'inbox', pendingOnly: false });
    expect(new URLSearchParams(qs).get('outcome')).toBeNull();
  });

  it('builds the Conversations API query with queue + ownership', () => {
    const qs = inboxThreadsApiQuery({
      view: 'threads',
      ownership: 'mine',
      queue: 'waiting',
      pendingOnly: true,
    });
    const params = new URLSearchParams(qs);
    expect(params.get('ownership')).toBe('mine');
    expect(params.get('queue')).toBe('waiting');
  });

  it('filters thread rows client-side by label or last message', () => {
    const threads = [
      { label: 'Priya Sharma', lastSummary: 'Looking for a Goa package' },
      { label: 'Amit Kumar', lastSummary: 'Thanks!' },
    ];
    expect(filterThreadRowsByQuery(threads, 'goa')).toHaveLength(1);
    expect(filterThreadRowsByQuery(threads, 'amit')).toHaveLength(1);
    expect(filterThreadRowsByQuery(threads, '')).toHaveLength(2);
  });
});
