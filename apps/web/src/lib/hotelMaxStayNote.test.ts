import { describe, expect, it } from 'vitest';
import {
  formatHotelMaxStayNote,
  hotelMaxStayBlocksSend,
  withMaxStayProvenance,
} from './hotelMaxStayNote';

describe('formatHotelMaxStayNote', () => {
  it('returns null when stay is within max', () => {
    expect(
      formatHotelMaxStayNote({
        maxStayNights: 5,
        stayNights: 4,
        maxStayLong: false,
      }),
    ).toBeNull();
  });

  it('prefers stamped note when long', () => {
    expect(
      formatHotelMaxStayNote({
        maxStayLong: true,
        maxStayNote: 'Max stay 3 nights — this stay is 5',
      }),
    ).toBe('Max stay 3 nights — this stay is 5');
  });

  it('builds note from nights when long', () => {
    expect(
      formatHotelMaxStayNote({
        maxStayNights: 3,
        stayNights: 5,
        maxStayLong: true,
      }),
    ).toBe('Max stay 3 nights — this stay is 5');
  });
});

describe('hotelMaxStayBlocksSend', () => {
  it('blocks unacked overage', () => {
    const note = 'Max stay 3 nights — this stay is 5';
    expect(
      hotelMaxStayBlocksSend({
        maxStayWarn: true,
        maxStayNote: note,
      }),
    ).toBe(true);
  });

  it('clears when fingerprint + reason match', () => {
    const note = 'Max stay 3 nights — this stay is 5';
    expect(
      hotelMaxStayBlocksSend({
        maxStayWarn: true,
        maxStayNote: note,
        maxStayRiskAckForNote: note,
        maxStayRiskAckReason: 'Extended booking agreed',
      }),
    ).toBe(false);
  });
});

describe('withMaxStayProvenance', () => {
  it('stamps warn and clears stale ack on rematch', () => {
    const note = 'Max stay 3 nights — this stay is 5';
    const stamped = withMaxStayProvenance(
      {
        rateId: 'r1',
        maxStayRiskAckForNote: 'old',
        maxStayRiskAckReason: 'old reason',
      },
      note,
    );
    expect(stamped?.maxStayWarn).toBe(true);
    expect(stamped?.maxStayNote).toBe(note);
    expect(stamped?.maxStayRiskAckForNote).toBeUndefined();
  });

  it('keeps ack when note fingerprint matches', () => {
    const note = 'Max stay 2 nights — this stay is 4';
    const stamped = withMaxStayProvenance(
      {
        rateId: 'r1',
        maxStayRiskAckForNote: note,
        maxStayRiskAckReason: 'OK',
      },
      note,
    );
    expect(stamped?.maxStayRiskAckForNote).toBe(note);
    expect(stamped?.maxStayRiskAckReason).toBe('OK');
  });

  it('does not warn for info-only max stay', () => {
    const stamped = withMaxStayProvenance({ rateId: 'r1' }, 'Max stay 2 nights');
    expect(stamped?.maxStayWarn).toBeUndefined();
    expect(stamped?.maxStayNote).toBe('Max stay 2 nights');
  });
});
