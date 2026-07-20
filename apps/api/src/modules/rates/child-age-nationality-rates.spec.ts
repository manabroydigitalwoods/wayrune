import { describe, expect, it } from 'vitest';
import {
  buildChildAgeNationalityRatesFromCsvRow,
  parseChildAgeNationalityRates,
  pickChildAgeNationalityRate,
  sumChildExtrasByAgeNationality,
} from './child-age-nationality-rates';

describe('child-age-nationality-rates', () => {
  const rates = parseChildAgeNationalityRates([
    {
      ageMin: 0,
      ageMax: 5,
      nationality: 'IN',
      withBedPerNight: 500,
      withoutBedPerNight: 300,
    },
    {
      ageMin: 0,
      ageMax: 5,
      nationality: 'INTL',
      withBedPerNight: 800,
      withoutBedPerNight: 500,
    },
    {
      ageMin: 6,
      ageMax: 11,
      nationality: 'IN',
      withBedPerNight: 900,
    },
  ]);

  it('parses and sorts age×nationality rows', () => {
    expect(rates).toHaveLength(3);
    expect(rates[0]!.ageMax).toBe(5);
  });

  it('picks exact nationality then INTL', () => {
    const inPick = pickChildAgeNationalityRate({
      age: 4,
      nationality: 'IN',
      rates,
    });
    expect(inPick?.withBedPerNight).toBe(500);
    const usPick = pickChildAgeNationalityRate({
      age: 4,
      nationality: 'US',
      rates,
    });
    expect(usPick?.withBedPerNight).toBe(800);
  });

  it('sums extras from columns with provenance', () => {
    const result = sumChildExtrasByAgeNationality({
      nights: 2,
      billableChildren: 2,
      childrenWithoutBed: 1,
      childAges: [4, 8],
      childNationalities: ['IN', 'IN'],
      rates,
    });
    expect(result).not.toBeNull();
    expect(result!.childWithoutBedCount).toBe(1);
    expect(result!.childWithBedCount).toBe(1);
    expect(result!.occupancyExtraTotal).toBe(300 * 2 + 900 * 2);
    expect(result!.shares[0]!.ageMin).toBe(0);
    expect(result!.shares[1]!.ageMax).toBe(11);
  });

  it('builds from CSV band columns', () => {
    const fromCsv = buildChildAgeNationalityRatesFromCsvRow({
      childAgeBand1Min: 0,
      childAgeBand1Max: 5,
      childAgeBand1InWithBed: 400,
      childAgeBand1IntlWithBed: 700,
    });
    expect(fromCsv).toHaveLength(2);
    expect(fromCsv![0]!.nationality).toBe('IN');
  });
});
