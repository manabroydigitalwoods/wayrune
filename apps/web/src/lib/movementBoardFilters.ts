/** URL / click-through filters for the movement board. */

export type MovementBoardFilterRow = {
  type: string;
  flags: Array<{ code: string; severity: string }>;
};

export type MovementBoardFilters = {
  type: 'hotel' | 'transfer' | 'activity' | null;
  flagged: boolean;
  overduePay: boolean;
  voucherPending: boolean;
};

export function parseMovementBoardFilters(
  params: URLSearchParams | { get: (key: string) => string | null },
): MovementBoardFilters {
  const rawType = (params.get('type') || '').trim().toLowerCase();
  const type =
    rawType === 'hotel' || rawType === 'transfer' || rawType === 'activity'
      ? rawType
      : null;
  return {
    type,
    flagged: params.get('flagged') === '1',
    overduePay: params.get('overduePay') === '1',
    voucherPending: params.get('voucherPending') === '1',
  };
}

export function movementBoardHasActiveFilters(f: MovementBoardFilters): boolean {
  return Boolean(f.type || f.flagged || f.overduePay || f.voucherPending);
}

export function applyMovementBoardFilters<T extends MovementBoardFilterRow>(
  rows: T[],
  filters: MovementBoardFilters,
): T[] {
  let next = rows;
  if (filters.type) {
    next = next.filter((r) => r.type === filters.type);
  }
  if (filters.flagged) {
    next = next.filter((r) => r.flags.some((f) => f.severity !== 'info'));
  }
  if (filters.overduePay) {
    next = next.filter((r) => r.flags.some((f) => f.code === 'payment_overdue'));
  }
  if (filters.voucherPending) {
    next = next.filter((r) =>
      r.flags.some((f) => f.code === 'voucher_pending'),
    );
  }
  return next;
}

/** Build relative movement board path with filter query. */
export function movementBoardFilterHref(opts: {
  type?: 'hotel' | 'transfer' | 'activity';
  flagged?: boolean;
  overduePay?: boolean;
  voucherPending?: boolean;
  days?: number;
}): string {
  const q = new URLSearchParams();
  if (opts.type) q.set('type', opts.type);
  if (opts.flagged) q.set('flagged', '1');
  if (opts.overduePay) q.set('overduePay', '1');
  if (opts.voucherPending) q.set('voucherPending', '1');
  if (opts.days && opts.days !== 14) q.set('days', String(opts.days));
  const qs = q.toString();
  return qs ? `/operations/movement?${qs}` : '/operations/movement';
}
