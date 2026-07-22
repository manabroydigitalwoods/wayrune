import { omitEmptyParams } from './types';

/**
 * Stable Tasks queue query — backward-compatible with existing deep-links.
 *
 * `due=overdue` is a reserved legacy redirect key on this page
 * (see `apps/web/src/lib/agencyRoutes.ts` LEGACY_REDIRECTS), so it doubles as
 * the Overdue attention preset value. `due=all` is an explicit opt-out used
 * only on the Follow-ups variant, which otherwise implies overdue by default.
 */
export type TasksDuePreset = 'overdue' | 'today' | 'all';

export type TasksQueryState = {
  q?: string;
  due?: TasksDuePreset;
  dueFrom?: string | null;
  dueTo?: string | null;
  duePeriod?: string | null;
  mine?: boolean;
  status?: string;
  priority?: string;
};

const KNOWN_KEYS = [
  'q',
  'due',
  'dueFrom',
  'dueTo',
  'duePeriod',
  'mine',
  'status',
  'priority',
] as const;

function parseDuePreset(raw: string | null | undefined): TasksDuePreset | undefined {
  return raw === 'overdue' || raw === 'today' || raw === 'all' ? raw : undefined;
}

export function parseTasksQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
): TasksQueryState {
  return {
    q: params.get('q')?.trim() || undefined,
    due: parseDuePreset(params.get('due')),
    dueFrom: params.get('dueFrom') || null,
    dueTo: params.get('dueTo') || null,
    duePeriod: params.get('duePeriod') || null,
    mine: params.get('mine') === '1',
    status: params.get('status')?.trim() || undefined,
    priority: params.get('priority')?.trim() || undefined,
  };
}

export function serializeTasksQueryState(state: TasksQueryState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.due) {
    params.set('due', state.due);
  } else {
    if (state.dueFrom) params.set('dueFrom', state.dueFrom);
    if (state.dueTo) params.set('dueTo', state.dueTo);
    if (state.duePeriod && state.duePeriod !== 'custom') params.set('duePeriod', state.duePeriod);
  }
  if (state.mine) params.set('mine', '1');
  if (state.status) params.set('status', state.status);
  if (state.priority) params.set('priority', state.priority);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchTasksQueryParams(
  current: URLSearchParams,
  patch: Partial<TasksQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseTasksQueryState(current);
  const next: TasksQueryState = patch.clearFilters
    ? { q: patch.q !== undefined ? patch.q : parsed.q }
    : {
        ...parsed,
        ...patch,
        dueFrom: patch.dueFrom !== undefined ? patch.dueFrom : parsed.dueFrom,
        dueTo: patch.dueTo !== undefined ? patch.dueTo : parsed.dueTo,
        duePeriod: patch.duePeriod !== undefined ? patch.duePeriod : parsed.duePeriod,
      };

  if (patch.due) {
    next.dueFrom = null;
    next.dueTo = null;
    next.duePeriod = null;
  }
  if (patch.dueFrom || patch.dueTo || patch.duePeriod) {
    next.due = undefined;
  }

  const serialized = serializeTasksQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function tasksQueryHasFilters(state: TasksQueryState): boolean {
  return Boolean(
    (state.due && state.due !== 'all') ||
      state.dueFrom ||
      state.dueTo ||
      state.mine ||
      state.status ||
      state.priority,
  );
}

/** Build the `/tasks` list API query string from Tasks queue state. */
export function tasksApiQueryFromState(state: TasksQueryState): string {
  const q = new URLSearchParams();
  if (state.due === 'overdue' || state.due === 'today') {
    q.set('due', state.due);
  } else {
    if (state.dueFrom) q.set('dueFrom', state.dueFrom);
    if (state.dueTo) q.set('dueTo', state.dueTo);
  }
  return q.toString();
}
