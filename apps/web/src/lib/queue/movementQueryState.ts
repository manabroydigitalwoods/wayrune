import { omitEmptyParams } from './types';
import {
  movementBoardHasActiveFilters,
  parseMovementBoardFilters,
  type MovementBoardFilters,
} from '../movementBoardFilters';

export type MovementBoardView = 'table' | 'week';

const KNOWN_KEYS = [
  'view',
  'type',
  'status',
  'flagged',
  'overduePay',
  'voucherPending',
  'from',
  'to',
  'period',
  'days',
  'q',
];

export const MOVEMENT_STATUS_OPTIONS = ['requested', 'confirmed', 'held', 'pending'] as const;
export type MovementBoardStatus = (typeof MOVEMENT_STATUS_OPTIONS)[number];

function parseStatus(raw: string | null | undefined): MovementBoardStatus | undefined {
  const value = (raw || '').trim().toLowerCase();
  return (MOVEMENT_STATUS_OPTIONS as readonly string[]).includes(value)
    ? (value as MovementBoardStatus)
    : undefined;
}

/**
 * Stable Movement board queue query. Filter fields (`type` / `flagged` / `overduePay` /
 * `voucherPending`) reuse `movementBoardFilters.ts` so existing dashboard deep-links
 * (`movementBoardFilterHref`) keep working unchanged. This layers on the queue-standard
 * `view` toggle, page-search `q`, and the movement window (`from` / `to` / `period`, with
 * legacy `days` lookahead still readable).
 */
export type MovementQueryState = MovementBoardFilters & {
  view: MovementBoardView;
  status?: MovementBoardStatus;
  from?: string | null;
  to?: string | null;
  period?: string | null;
  /** Legacy lookahead window (e.g. `?days=7`) — only set when `from`/`to` are absent. */
  days?: number | null;
  q?: string;
};

export function parseMovementQueryState(
  params: URLSearchParams | { get: (key: string) => string | null },
  fallbackView: MovementBoardView = 'table',
): MovementQueryState {
  const rawView = params.get('view');
  const view: MovementBoardView = rawView === 'table' || rawView === 'week' ? rawView : fallbackView;
  const from = params.get('from') || null;
  const to = params.get('to') || null;
  const daysRaw = Number(params.get('days') || 0);
  return {
    view,
    ...parseMovementBoardFilters(params),
    status: parseStatus(params.get('status')),
    from,
    to,
    period: params.get('period') || null,
    days: !from && !to && daysRaw > 0 ? daysRaw : null,
    q: params.get('q')?.trim() || undefined,
  };
}

export function serializeMovementQueryState(state: MovementQueryState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('view', state.view);
  if (state.type) params.set('type', state.type);
  if (state.status) params.set('status', state.status);
  if (state.flagged) params.set('flagged', '1');
  if (state.overduePay) params.set('overduePay', '1');
  if (state.voucherPending) params.set('voucherPending', '1');
  if (state.from && state.to) {
    params.set('from', state.from);
    params.set('to', state.to);
    if (state.period && state.period !== 'custom') params.set('period', state.period);
  } else if (state.days) {
    params.set('days', String(state.days));
  }
  if (state.q) params.set('q', state.q);
  return omitEmptyParams(params);
}

/** Merge patch into current search params without dropping unrelated keys. */
export function patchMovementQueryParams(
  current: URLSearchParams,
  patch: Partial<MovementQueryState> & { clearFilters?: boolean },
): URLSearchParams {
  const parsed = parseMovementQueryState(current);
  const next: MovementQueryState = patch.clearFilters
    ? {
        view: patch.view ?? parsed.view,
        type: null,
        flagged: false,
        overduePay: false,
        voucherPending: false,
        // The movement window is the board's working range, not a filter chip — keep it.
        from: parsed.from,
        to: parsed.to,
        period: parsed.period,
        days: parsed.days,
        q: patch.q !== undefined ? patch.q : parsed.q,
      }
    : {
        ...parsed,
        ...patch,
        from: patch.from !== undefined ? patch.from : parsed.from,
        to: patch.to !== undefined ? patch.to : parsed.to,
        period: patch.period !== undefined ? patch.period : parsed.period,
        days: patch.days !== undefined ? patch.days : parsed.days,
      };

  if (patch.from !== undefined || patch.to !== undefined) {
    next.days = null;
  }
  if (patch.days) {
    next.from = null;
    next.to = null;
    next.period = null;
  }

  const serialized = serializeMovementQueryState(next);
  for (const [key, value] of current.entries()) {
    if (!KNOWN_KEYS.includes(key) && !serialized.has(key)) {
      serialized.set(key, value);
    }
  }
  return serialized;
}

export function movementQueryHasFilters(state: MovementQueryState): boolean {
  return Boolean(state.status) || movementBoardHasActiveFilters(state);
}
