import { describe, expect, it } from 'vitest';
import {
  movementQueryHasFilters,
  parseMovementQueryState,
  patchMovementQueryParams,
  serializeMovementQueryState,
} from './movementQueryState';

describe('movementQueryState', () => {
  it('parses view, filters, window, and search', () => {
    const state = parseMovementQueryState(
      new URLSearchParams(
        'view=week&type=hotel&flagged=1&overduePay=1&voucherPending=1&from=2026-08-01&to=2026-08-08&period=next_7&q=goa',
      ),
    );
    expect(state).toEqual({
      view: 'week',
      type: 'hotel',
      flagged: true,
      overduePay: true,
      voucherPending: true,
      from: '2026-08-01',
      to: '2026-08-08',
      period: 'next_7',
      days: null,
      q: 'goa',
    });
  });

  it('reads legacy days lookahead when from/to absent', () => {
    const state = parseMovementQueryState(new URLSearchParams('days=7'));
    expect(state.days).toBe(7);
    expect(state.from).toBeNull();
    expect(state.to).toBeNull();
  });

  it('ignores an unknown type', () => {
    expect(parseMovementQueryState(new URLSearchParams('type=flight')).type).toBeNull();
  });

  it('defaults to the fallback view when absent', () => {
    expect(parseMovementQueryState(new URLSearchParams(''), 'week').view).toBe('week');
    expect(parseMovementQueryState(new URLSearchParams('')).view).toBe('table');
  });

  it('serializes omitting empty values and dropping custom period', () => {
    const qs = serializeMovementQueryState({
      view: 'table',
      type: 'transfer',
      flagged: false,
      overduePay: false,
      voucherPending: false,
      from: '2026-08-01',
      to: '2026-08-08',
      period: 'custom',
      days: null,
    }).toString();
    expect(qs).toBe('view=table&type=transfer&from=2026-08-01&to=2026-08-08');
  });

  it('clearFilters keeps view, q, and the movement window', () => {
    const current = new URLSearchParams(
      'view=week&type=hotel&flagged=1&from=2026-08-01&to=2026-08-08&period=next_7&q=goa',
    );
    const next = patchMovementQueryParams(current, { clearFilters: true });
    expect(next.get('view')).toBe('week');
    expect(next.get('q')).toBe('goa');
    expect(next.get('from')).toBe('2026-08-01');
    expect(next.get('to')).toBe('2026-08-08');
    expect(next.get('type')).toBeNull();
    expect(next.get('flagged')).toBeNull();
  });

  it('patching the window clears the legacy days param and vice versa', () => {
    const withDays = patchMovementQueryParams(new URLSearchParams('view=table'), { days: 30 });
    expect(withDays.get('days')).toBe('30');

    const withWindow = patchMovementQueryParams(withDays, {
      from: '2026-08-01',
      to: '2026-08-08',
    });
    expect(withWindow.get('days')).toBeNull();
    expect(withWindow.get('from')).toBe('2026-08-01');
  });

  it('preserves unknown params', () => {
    const next = patchMovementQueryParams(new URLSearchParams('view=table&tripId=abc'), {
      flagged: true,
    });
    expect(next.get('tripId')).toBe('abc');
    expect(next.get('flagged')).toBe('1');
  });

  it('detects active filters', () => {
    expect(movementQueryHasFilters(parseMovementQueryState(new URLSearchParams('')))).toBe(false);
    expect(
      movementQueryHasFilters(parseMovementQueryState(new URLSearchParams('flagged=1'))),
    ).toBe(true);
  });
});
