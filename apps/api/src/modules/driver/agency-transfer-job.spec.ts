import { describe, expect, it } from 'vitest';
import {
  agencyTransferCalendarNotes,
  agencyTransferJobWindow,
  isAgencyTransferCalendarNotes,
} from './agency-transfer-job';

describe('agencyTransferJobWindow', () => {
  it('defaults to 10:00–12:00 UTC on movement day', () => {
    const w = agencyTransferJobWindow({ startAt: '2026-04-10T00:00:00.000Z' });
    expect(w?.startAt.toISOString()).toBe('2026-04-10T10:00:00.000Z');
    expect(w?.endAt.toISOString()).toBe('2026-04-10T12:00:00.000Z');
  });

  it('uses explicit clock time on startAt when present', () => {
    const w = agencyTransferJobWindow({
      startAt: '2026-04-10T06:30:00.000Z',
      endAt: '2026-04-10T08:00:00.000Z',
    });
    expect(w?.startAt.toISOString()).toBe('2026-04-10T06:30:00.000Z');
    expect(w?.endAt.toISOString()).toBe('2026-04-10T08:00:00.000Z');
  });

  it('uses explicit endAt when later than start', () => {
    const w = agencyTransferJobWindow({
      startAt: '2026-04-10T00:00:00.000Z',
      endAt: '2026-04-10T18:00:00.000Z',
    });
    expect(w?.endAt.toISOString()).toBe('2026-04-10T18:00:00.000Z');
  });
});

describe('agencyTransferCalendarNotes', () => {
  it('builds a stable notes key', () => {
    expect(agencyTransferCalendarNotes('bc1')).toBe('agency_transfer · bc1');
    expect(isAgencyTransferCalendarNotes('agency_transfer · bc1', 'bc1')).toBe(
      true,
    );
    expect(isAgencyTransferCalendarNotes('other', 'bc1')).toBe(false);
  });
});
