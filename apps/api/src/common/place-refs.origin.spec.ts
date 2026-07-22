import { describe, expect, it } from 'vitest';
import {
  coercePlaceRef,
  inquiryOriginWriteData,
  originRefFromInquiry,
} from './place-refs';
import { Prisma } from '@prisma/client';

describe('inquiry origin PlaceRef path', () => {
  it('prefers originJson over legacy dual columns', () => {
    expect(
      originRefFromInquiry({
        originJson: { placeId: 'p1', name: 'Bengaluru', kind: 'city' },
        origin: 'Old Name',
        originPlaceId: 'other',
      }),
    ).toEqual({ placeId: 'p1', name: 'Bengaluru', kind: 'city' });
  });

  it('falls back to legacy origin + originPlaceId', () => {
    expect(
      originRefFromInquiry({
        originJson: null,
        origin: 'Bengaluru',
        originPlaceId: 'p1',
      }),
    ).toEqual({ placeId: 'p1', name: 'Bengaluru' });
  });

  it('preserves unresolved display name without inventing a placeId', () => {
    expect(
      originRefFromInquiry({
        origin: 'Somewhere Custom',
        originPlaceId: null,
      }),
    ).toEqual({ placeId: null, name: 'Somewhere Custom' });
  });

  it('new writes clear dual columns and store only originJson', () => {
    const ref = coercePlaceRef({ placeId: 'p1', name: 'Bengaluru', kind: 'city' });
    expect(inquiryOriginWriteData(ref)).toEqual({
      originJson: ref,
      origin: null,
      originPlaceId: null,
    });
    expect(inquiryOriginWriteData(null)).toEqual({
      originJson: Prisma.JsonNull,
      origin: null,
      originPlaceId: null,
    });
  });
});
