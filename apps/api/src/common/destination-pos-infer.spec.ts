import { describe, expect, it } from 'vitest';
import { inferDestinationPlaceOfSupplyFromLabels } from './destination-pos-infer';
import { matchKnownPlaceOfSupply } from './tax-display-split';
import {
  parseQuoteTaxIdentity,
  quoteTaxIdentityToJson,
  resolveQuoteTaxIdentityForDisplay,
} from './quote-tax-identity';
import { parseOrgTaxIdentity } from './org-tax-identity';

describe('destination-pos-infer', () => {
  it('matches known state aliases and rejects cities', () => {
    expect(matchKnownPlaceOfSupply('West Bengal')).toBe('WB');
    expect(matchKnownPlaceOfSupply('KA')).toBe('KA');
    expect(matchKnownPlaceOfSupply('Darjeeling')).toBeNull();
  });

  it('infers first known POS from label order', () => {
    expect(
      inferDestinationPlaceOfSupplyFromLabels([
        'Darjeeling',
        'West Bengal',
        'India',
      ]),
    ).toBe('WB');
    expect(
      inferDestinationPlaceOfSupplyFromLabels(['Darjeeling', 'Kalimpong']),
    ).toBeNull();
  });
});

describe('quote-tax-identity freeze', () => {
  it('round-trips write-once stamp', () => {
    const live = parseOrgTaxIdentity('GST', {
      business: {
        gstin: '29AABCD1234E1Z5',
        placeOfSupply: 'KA',
        destinationPlaceOfSupply: 'MH',
      },
    });
    const json = quoteTaxIdentityToJson(live, 'send', '2026-07-20T00:00:00.000Z');
    const parsed = parseQuoteTaxIdentity(json);
    expect(parsed).toMatchObject({
      taxLabel: 'GST',
      gstin: '29AABCD1234E1Z5',
      placeOfSupply: 'KA',
      destinationPlaceOfSupply: 'MH',
      lockSource: 'send',
      lockedAt: '2026-07-20T00:00:00.000Z',
    });
  });

  it('rejects incomplete stamp', () => {
    expect(parseQuoteTaxIdentity({ taxLabel: 'GST' })).toBeNull();
    expect(parseQuoteTaxIdentity(null)).toBeNull();
  });

  it('prefers stamp over live for display resolve', () => {
    const stamped = quoteTaxIdentityToJson(
      parseOrgTaxIdentity('GST', {
        business: {
          gstin: '29AABCD1234E1Z5',
          placeOfSupply: 'KA',
          destinationPlaceOfSupply: 'MH',
        },
      }),
      'send',
    );
    const resolved = resolveQuoteTaxIdentityForDisplay({
      taxIdentityJson: stamped,
      taxLabel: 'VAT',
      settingsJson: {
        business: {
          placeOfSupply: 'DL',
          destinationPlaceOfSupply: 'DL',
        },
      },
      destinationPlaceOfSupply: 'WB',
    });
    expect(resolved).toMatchObject({
      taxLabel: 'GST',
      placeOfSupply: 'KA',
      destinationPlaceOfSupply: 'MH',
    });
  });

  it('falls back to live when stamp missing', () => {
    const resolved = resolveQuoteTaxIdentityForDisplay({
      taxIdentityJson: null,
      taxLabel: 'GST',
      settingsJson: {
        business: {
          placeOfSupply: 'KA',
          destinationPlaceOfSupply: 'MH',
        },
      },
      destinationPlaceOfSupply: 'WB',
    });
    expect(resolved).toMatchObject({
      taxLabel: 'GST',
      placeOfSupply: 'KA',
      destinationPlaceOfSupply: 'WB',
      destinationPlaceOfSupplySource: 'trip',
    });
  });
});

describe('org-tax-identity infer precedence', () => {
  it('uses trip override over inferred over org', () => {
    const settings = {
      business: {
        placeOfSupply: 'KA',
        destinationPlaceOfSupply: 'MH',
      },
    };
    expect(
      parseOrgTaxIdentity('GST', settings, {
        destinationPlaceOfSupply: null,
        inferredDestinationPlaceOfSupply: 'WB',
      }),
    ).toMatchObject({
      destinationPlaceOfSupply: 'WB',
      destinationPlaceOfSupplySource: 'inferred',
    });
    expect(
      parseOrgTaxIdentity('GST', settings, {
        destinationPlaceOfSupply: 'GA',
        inferredDestinationPlaceOfSupply: 'WB',
      }),
    ).toMatchObject({
      destinationPlaceOfSupply: 'GA',
      destinationPlaceOfSupplySource: 'trip',
    });
    expect(
      parseOrgTaxIdentity('GST', settings, {
        destinationPlaceOfSupply: null,
        inferredDestinationPlaceOfSupply: null,
      }),
    ).toMatchObject({
      destinationPlaceOfSupply: 'MH',
      destinationPlaceOfSupplySource: 'org',
    });
  });
});
