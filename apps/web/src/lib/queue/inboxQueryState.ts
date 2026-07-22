import { omitEmptyParams } from './types';

export type InboxViewMode = 'threads' | 'inbox';
export type InboxOwnership = 'mine' | 'unassigned';
export type InboxQueueFilter = 'assigned' | 'waiting' | 'follow_up';

/** Stable Inbox queue query — backward-compatible with existing `?unread=1[&aging=1]` and `?channel=` deep links. */
export type InboxQueryState = {
  view: InboxViewMode;
  channel?: string;
  ownership?: InboxOwnership;
  /** Threads view only — narrows to a work queue (assigned / waiting / follow-up). */
  queue?: InboxQueueFilter;
  unread?: boolean;
  aging?: boolean;
  /** "All messages" view only. Defaults to true (needs-reply) when the param is absent. */
  pendingOnly?: boolean;
  q?: string;
};

const KNOWN_PARAMS = [
  'view',
  'channel',
  'ownership',
  'queue',
  'unread',
  'aging',
  'pending',
  'q',
];

export function parseInboxQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackView: InboxViewMode = 'threads',
): InboxQueryState {
  const rawView = params.get('view');
  const view: InboxViewMode = rawView === 'inbox' || rawView === 'threads' ? rawView : fallbackView;
  const channel = params.get('channel')?.trim() || undefined;
  const rawOwnership = params.get('ownership');
  const ownership: InboxOwnership | undefined =
    rawOwnership === 'mine' || rawOwnership === 'unassigned' ? rawOwnership : undefined;
  const rawQueue = params.get('queue');
  const queue: InboxQueueFilter | undefined =
    rawQueue === 'assigned' || rawQueue === 'waiting' || rawQueue === 'follow_up'
      ? rawQueue
      : undefined;
  const aging = params.get('aging') === '1';
  const unread = aging || params.get('unread') === '1';
  const pendingOnly = params.get('pending') === '0' ? false : true;
  const q = params.get('q')?.trim() || undefined;
  return { view, channel, ownership, queue, unread, aging, pendingOnly, q };
}

export function serializeInboxQueryState(state: InboxQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.channel) params.set('channel', state.channel);
  if (state.ownership) params.set('ownership', state.ownership);
  if (state.queue) params.set('queue', state.queue);
  if (state.aging) {
    params.set('unread', '1');
    params.set('aging', '1');
  } else if (state.unread) {
    params.set('unread', '1');
  }
  if (state.pendingOnly === false) params.set('pending', '0');
  if (state.q) params.set('q', state.q);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchInboxQueryParams(
  current: URLSearchParams,
  patch: Partial<InboxQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseInboxQueryState(current);
  const next: InboxQueryState = patch.clearFilters
    ? {
        view: patch.view ?? parsed.view,
        q: patch.q !== undefined ? patch.q : parsed.q,
        pendingOnly: true,
      }
    : { ...parsed, ...patch };

  // Aging implies unread; turning unread off also drops aging.
  if (patch.aging === true) next.unread = true;
  if (patch.unread === false) next.aging = false;

  const serialized = serializeInboxQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_PARAMS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function inboxQueryHasFilters(state: InboxQueryState): boolean {
  return Boolean(
    state.channel ||
      state.ownership ||
      state.queue ||
      state.unread ||
      state.aging ||
      state.pendingOnly === false,
  );
}

/** Build `/interactions` (All messages) list query from Inbox queue state. */
export function inboxListApiQuery(state: InboxQueryState, opts?: { pageSize?: number }): string {
  const q = new URLSearchParams();
  if (opts?.pageSize) q.set('pageSize', String(opts.pageSize));
  if (state.channel) q.set('channel', state.channel);
  if (state.unread) q.set('unread', '1');
  if (state.aging) q.set('aging', '1');
  if (state.pendingOnly !== false) q.set('outcome', 'pending');
  if (state.ownership) q.set('ownership', state.ownership);
  if (state.q) q.set('q', state.q);
  return q.toString();
}

/** Build `/interactions/threads` (Conversations) list query from Inbox queue state. */
export function inboxThreadsApiQuery(state: InboxQueryState, opts?: { pageSize?: number }): string {
  const q = new URLSearchParams();
  if (opts?.pageSize) q.set('pageSize', String(opts.pageSize));
  if (state.channel) q.set('channel', state.channel);
  if (state.unread) q.set('unread', '1');
  if (state.aging) q.set('aging', '1');
  if (state.ownership) q.set('ownership', state.ownership);
  if (state.queue) q.set('queue', state.queue);
  return q.toString();
}

/**
 * Conversations don't support server-side `q` (no full-text index on threads),
 * so the page search filters the already-loaded thread list client-side.
 */
export function filterThreadRowsByQuery<T extends { label: string; lastSummary?: string | null }>(
  threads: T[],
  q?: string,
): T[] {
  const query = q?.trim().toLowerCase();
  if (!query) return threads;
  return threads.filter(
    (t) =>
      t.label.toLowerCase().includes(query) || (t.lastSummary ?? '').toLowerCase().includes(query),
  );
}
