import { describe, expect, it } from 'vitest';
import {
  formatHotelMinStayNote,
  hotelMinStayBlocksSend,
  withMinStayProvenance,
} from './hotelMinStayNote';

describe('formatHotelMinStayNote', () => {
  it('returns null when met or unset', () => {
    expect(formatHotelMinStayNote(null)).toBeNull();
    expect(
      formatHotelMinStayNote({ minStayNights: 2, stayNights: 2, minStayShort: false }),
    ).toBeNull();
  });

  it('formats short stay cue', () => {
    expect(
      formatHotelMinStayNote({
        minStayShort: true,
        minStayNote: 'Min stay 3 nights — this stay is 2',
      }),
    ).toBe('Min stay 3 nights — this stay is 2');
    expect(
      formatHotelMinStayNote({
        minStayShort: true,
        minStayNights: 3,
        stayNights: 1,
      }),
    ).toBe('Min stay 3 nights — this stay is 1');
  });
});

describe('hotelMinStayBlocksSend', () => {
  it('blocks unacked shortfall', () => {
    expect(
      hotelMinStayBlocksSend({
        minStayWarn: true,
        minStayNote: 'Min stay 3 nights — this stay is 2',
      }),
    ).toBe(true);
  });

  it('clears when acked with reason', () => {
    const note = 'Min stay 3 nights — this stay is 2';
    expect(
      hotelMinStayBlocksSend({
        minStayWarn: true,
        minStayNote: note,
        minStayRiskAckForNote: note,
        minStayRiskAckReason: 'Surcharge agreed',
      }),
    ).toBe(false);
  });
});

describe('withMinStayProvenance', () => {
  it('stamps warn and clears stale ack', () => {
    const note = 'Min stay 2 nights — this stay is 1';
    const stamped = withMinStayProvenance(
      {
        rateId: 'r1',
        minStayRiskAckForNote: 'old',
        minStayRiskAckReason: 'old',
      },
      note,
    );
    expect(stamped?.minStayWarn).toBe(true);
    expect(stamped?.minStayNote).toBe(note);
    expect(stamped?.minStayRiskAckForNote).toBeUndefined();
  });

  it('clears warn when note is not a shortfall', () => {
    const stamped = withMinStayProvenance(
      { rateId: 'r1', minStayWarn: true },
      'Min stay 2 nights',
    );
    expect(stamped?.minStayWarn).toBeUndefined();
  });
});
