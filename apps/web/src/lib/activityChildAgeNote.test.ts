import { describe, expect, it } from 'vitest';
import {
  activityChildAgeCalcFromProvenance,
  formatActivityChildAgeNote,
} from './activityChildAgeNote';

describe('formatActivityChildAgeNote', () => {
  it('returns null when no ages were reclassified', () => {
    expect(formatActivityChildAgeNote(null)).toBeNull();
    expect(
      formatActivityChildAgeNote({
        partyAdults: 2,
        adultsCharged: 2,
        childrenCharged: 1,
        childAgeMin: 0,
        childAgeMax: 11,
      }),
    ).toBeNull();
  });

  it('warns when children are charged as adult', () => {
    expect(
      formatActivityChildAgeNote({
        partyAdults: 2,
        partyChildren: 1,
        adultsCharged: 3,
        childrenCharged: 0,
        childAgeMin: 0,
        childAgeMax: 11,
      }),
    ).toBe('1 priced as adult (card 0–11)');
  });

  it('warns when ages below card min are charged as infant', () => {
    expect(
      formatActivityChildAgeNote({
        partyAdults: 2,
        partyChildren: 2,
        partyInfants: 0,
        adultsCharged: 2,
        childrenCharged: 1,
        infantsCharged: 1,
        childAgeMin: 2,
        childAgeMax: 11,
      }),
    ).toBe('1 priced as infant (card 2–11)');
  });

  it('combines adult and infant reclassification', () => {
    expect(
      formatActivityChildAgeNote({
        partyAdults: 2,
        partyInfants: 0,
        adultsCharged: 3,
        infantsCharged: 1,
        childAgeMin: 2,
        childAgeMax: 11,
      }),
    ).toBe('1 priced as adult · 1 priced as infant (card 2–11)');
  });
});

describe('activityChildAgeCalcFromProvenance', () => {
  it('prefers charged + party stamps', () => {
    expect(
      activityChildAgeCalcFromProvenance({
        calculation: {
          adults: 3,
          children: 0,
          partyAdults: 2,
          partyChildren: 1,
          childAgeMin: 0,
          childAgeMax: 11,
        },
      }),
    ).toEqual({
      partyAdults: 2,
      partyChildren: 1,
      partyInfants: undefined,
      adultsCharged: 3,
      childrenCharged: 0,
      infantsCharged: undefined,
      childAgeMin: 0,
      childAgeMax: 11,
    });
  });
});
