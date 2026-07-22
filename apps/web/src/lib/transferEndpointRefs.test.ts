import { describe, expect, it } from 'vitest';
import { rankPlacesForPurpose } from '@wayrune/contracts';
import {
  applyTransferEndpointSelection,
  transferEndpointLegacyLabel,
  transferEndpointPickerValue,
  transferSameEndpointWarning,
} from './transferEndpointRefs';

describe('applyTransferEndpointSelection', () => {
  it('sets id and name together on select', () => {
    expect(
      applyTransferEndpointSelection({
        placeId: 'p1',
        name: 'Bagdogra Airport',
        kind: 'airport',
      }),
    ).toEqual({ placeId: 'p1', name: 'Bagdogra Airport' });
  });

  it('clears both on clear / missing id', () => {
    expect(applyTransferEndpointSelection(null)).toEqual({
      placeId: null,
      name: null,
    });
    expect(applyTransferEndpointSelection({ placeId: null, name: 'X' })).toEqual({
      placeId: null,
      name: null,
    });
  });
});

describe('transferEndpointPickerValue', () => {
  it('returns null for name-only legacy (not linked)', () => {
    expect(transferEndpointPickerValue(null, 'Bagdogra Airport')).toBeNull();
    expect(transferEndpointPickerValue(undefined, 'Darjeeling')).toBeNull();
  });

  it('returns PlaceRef when linked', () => {
    expect(transferEndpointPickerValue('p1', 'Bagdogra Airport')).toEqual({
      placeId: 'p1',
      name: 'Bagdogra Airport',
    });
  });
});

describe('transferSameEndpointWarning', () => {
  it('warns when from === to', () => {
    expect(transferSameEndpointWarning('a', 'a')).toBe(
      'Pickup and drop are the same place.',
    );
    expect(transferSameEndpointWarning('a', 'b')).toBeNull();
  });
});

describe('transferEndpointLegacyLabel', () => {
  it('returns trimmed name', () => {
    expect(transferEndpointLegacyLabel('  X  ')).toBe('X');
    expect(transferEndpointLegacyLabel('')).toBeNull();
  });
});

describe('rankPlacesForPurpose exact vs pickup kind', () => {
  it('exact city outranks weaker airport despite transfer_pickup priority', () => {
    const ranked = rankPlacesForPurpose(
      [
        { id: 'air', name: 'Darjeeling Helipad', kind: 'airport' },
        { id: 'city', name: 'Darjeeling', kind: 'city' },
      ],
      { q: 'Darjeeling', purpose: 'transfer_pickup' },
    );
    expect(ranked[0]?.id).toBe('city');
    expect(ranked[0]?.matchType).toBe('exact');
  });
});
