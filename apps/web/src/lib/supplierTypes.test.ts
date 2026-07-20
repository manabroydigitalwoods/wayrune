import { describe, expect, it } from 'vitest';
import {
  contactCompletenessLabel,
  supplierContractListLabel,
  supplierProfileCompletenessLabel,
  supplierRateListLabel,
} from './supplierTypes';

describe('contactCompletenessLabel', () => {
  it('requires name and phone or email', () => {
    expect(
      contactCompletenessLabel({ name: 'Heritage Lodge', email: 'a@b.c' }),
    ).toBe('Complete');
    expect(contactCompletenessLabel({ name: 'Heritage Lodge' })).toBe(
      'Incomplete',
    );
  });
});

describe('supplierProfileCompletenessLabel', () => {
  it('scores activity profile keys', () => {
    expect(
      supplierProfileCompletenessLabel('activity', {
        activitiesOffered: ['Sunrise'],
      }),
    ).toMatch(/%/);
    expect(
      supplierProfileCompletenessLabel('activity', {
        activitiesOffered: ['Sunrise'],
        durationHint: '2h',
        privateOrSic: 'private',
        capacity: 12,
        inclusions: ['Guide'],
        safetyNotes: 'Warm clothes',
      }),
    ).toBe('Complete');
  });

  it('includes room products for stay suppliers', () => {
    expect(
      supplierProfileCompletenessLabel(
        'hotel',
        { imageUrl: 'x', description: 'y', checkIn: '14:00', checkOut: '11:00', amenities: ['WiFi', 'Parking', 'Breakfast'] },
        { roomProductCount: 0 },
      ),
    ).not.toBe('Complete');
    expect(
      supplierProfileCompletenessLabel(
        'hotel',
        { imageUrl: 'x', description: 'y', checkIn: '14:00', checkOut: '11:00', amenities: ['WiFi', 'Parking', 'Breakfast'] },
        { roomProductCount: 2 },
      ),
    ).toBe('Complete');
  });
});

describe('supplierRateListLabel', () => {
  it('labels zero and active counts', () => {
    expect(supplierRateListLabel(0)).toBe('No rates');
    expect(supplierRateListLabel(3)).toBe('3 active');
    expect(supplierRateListLabel(null)).toBeNull();
  });
});

describe('supplierContractListLabel', () => {
  it('labels zero and active counts', () => {
    expect(supplierContractListLabel(0)).toBe('None active');
    expect(supplierContractListLabel(1)).toBe('1 active');
  });
});
