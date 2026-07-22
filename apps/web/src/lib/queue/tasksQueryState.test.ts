import { describe, expect, it } from 'vitest';
import {
  parseTasksQueryState,
  patchTasksQueryParams,
  serializeTasksQueryState,
  tasksApiQueryFromState,
  tasksQueryHasFilters,
} from './tasksQueryState';

describe('tasksQueryState', () => {
  it('parses filters and range', () => {
    const state = parseTasksQueryState(
      new URLSearchParams('due=overdue&status=open&priority=high&mine=1&q=call'),
    );
    expect(state).toEqual({
      q: 'call',
      due: 'overdue',
      dueFrom: null,
      dueTo: null,
      duePeriod: null,
      mine: true,
      status: 'open',
      priority: 'high',
    });
  });

  it('ignores unknown due presets', () => {
    expect(parseTasksQueryState(new URLSearchParams('due=nope')).due).toBeUndefined();
  });

  it('serializes omitting empty values and preferring due preset over range', () => {
    expect(
      serializeTasksQueryState({ due: 'overdue', dueFrom: '2026-01-01' }).toString(),
    ).toBe('due=overdue');
    expect(
      serializeTasksQueryState({ dueFrom: '2026-01-01', dueTo: '2026-01-31' }).toString(),
    ).toBe('dueFrom=2026-01-01&dueTo=2026-01-31');
  });

  it('setting a due preset clears the date range, and vice versa', () => {
    const withRange = new URLSearchParams('dueFrom=2026-01-01&dueTo=2026-01-31');
    const next = patchTasksQueryParams(withRange, { due: 'overdue' });
    expect(next.get('due')).toBe('overdue');
    expect(next.get('dueFrom')).toBeNull();
    expect(next.get('dueTo')).toBeNull();

    const withPreset = new URLSearchParams('due=overdue');
    const cleared = patchTasksQueryParams(withPreset, { dueFrom: '2026-02-01' });
    expect(cleared.get('due')).toBeNull();
    expect(cleared.get('dueFrom')).toBe('2026-02-01');
  });

  it('clearFilters keeps only q', () => {
    const current = new URLSearchParams('due=overdue&status=open&priority=high&mine=1&q=a');
    const next = patchTasksQueryParams(current, { clearFilters: true });
    expect(next.get('q')).toBe('a');
    expect(next.get('due')).toBeNull();
    expect(next.get('status')).toBeNull();
    expect(next.get('priority')).toBeNull();
    expect(next.get('mine')).toBeNull();
  });

  it('builds the /tasks API query from state', () => {
    expect(tasksApiQueryFromState({ due: 'overdue' })).toBe('due=overdue');
    expect(tasksApiQueryFromState({ due: 'all', dueFrom: '2026-01-01' })).toBe(
      'dueFrom=2026-01-01',
    );
    expect(tasksApiQueryFromState({ dueFrom: '2026-01-01', dueTo: '2026-01-31' })).toBe(
      'dueFrom=2026-01-01&dueTo=2026-01-31',
    );
  });

  it('detects active filters, ignoring the `all` opt-out sentinel', () => {
    expect(tasksQueryHasFilters({})).toBe(false);
    expect(tasksQueryHasFilters({ due: 'all' })).toBe(false);
    expect(tasksQueryHasFilters({ mine: true })).toBe(true);
    expect(tasksQueryHasFilters({ status: 'open' })).toBe(true);
  });
});
