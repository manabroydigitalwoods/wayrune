import { describe, expect, it } from 'vitest';
import {
  formatHotelAllotmentNote,
  hotelAllotmentBlocksSend,
  hotelAllotmentIsWarn,
  hotelAllotmentTone,
  withAllotmentProvenance,
} from './hotelAllotmentNote';

describe('formatHotelAllotmentNote', () => {
  it('reports remaining across products', () => {
    expect(
      formatHotelAllotmentNote({
        products: [
          { remaining: 2, name: 'Deluxe' },
          { remaining: 1, name: 'Suite' },
        ],
        roomsRequested: 1,
      }),
    ).toBe('3 room(s) remaining across 2 product(s) for these nights.');
  });

  it('hard-blocks when zero remaining', () => {
    expect(
      formatHotelAllotmentNote({
        products: [{ remaining: 0 }],
      }),
    ).toMatch(/^Insufficient allotment: no rooms remaining/);
  });

  it('hard-blocks when remaining below rooms requested', () => {
    expect(
      formatHotelAllotmentNote({
        products: [{ remaining: 1 }],
        roomsRequested: 2,
      }),
    ).toMatch(/only 1 room/);
  });

  it('falls back when no products (non-blocking)', () => {
    expect(formatHotelAllotmentNote({ products: [], message: 'Custom' })).toBe(
      'Custom',
    );
    expect(formatHotelAllotmentNote({ products: [] })).toMatch(/No inventory linked/);
    expect(hotelAllotmentIsWarn(formatHotelAllotmentNote({ products: [] }))).toBe(
      false,
    );
  });
});

describe('hotelAllotmentTone / blocksSend', () => {
  it('blocks on insufficient notes including legacy soft warning', () => {
    expect(hotelAllotmentTone('Insufficient allotment: none')).toBe('block');
    expect(hotelAllotmentTone('Soft warning: none')).toBe('block');
    expect(hotelAllotmentTone('3 room(s) remaining')).toBe('info');
    expect(
      hotelAllotmentBlocksSend({
        allotmentWarn: true,
        allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
      }),
    ).toBe(true);
    expect(
      hotelAllotmentBlocksSend({
        allotmentWarn: true,
        allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
        allotmentRiskAckForNote:
          'Insufficient allotment: no rooms remaining for these nights.',
      }),
    ).toBe(true);
    expect(
      hotelAllotmentBlocksSend({
        allotmentWarn: true,
        allotmentNote: 'Insufficient allotment: no rooms remaining for these nights.',
        allotmentRiskAckForNote:
          'Insufficient allotment: no rooms remaining for these nights.',
        allotmentRiskAckReason: 'Hotel confirmed extra room',
      }),
    ).toBe(false);
    expect(hotelAllotmentBlocksSend({ allotmentNote: '3 room(s) remaining' })).toBe(
      false,
    );
  });
});

describe('withAllotmentProvenance', () => {
  it('stamps warn flag from insufficient note', () => {
    const stamped = withAllotmentProvenance(
      { rateId: 'r1' },
      'Insufficient allotment: no rooms remaining for these nights.',
    );
    expect(stamped?.allotmentWarn).toBe(true);
    expect(stamped?.allotmentNote).toMatch(/^Insufficient allotment/);
  });

  it('clears warn when note is healthy', () => {
    const stamped = withAllotmentProvenance(
      { rateId: 'r1', allotmentWarn: true },
      '3 room(s) remaining across 1 product(s) for these nights.',
    );
    expect(stamped?.allotmentWarn).toBeUndefined();
    expect(stamped?.allotmentNote).toMatch(/remaining/);
  });
});
