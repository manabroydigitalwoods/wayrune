import { describe, expect, it } from 'vitest';
import { leadTagsToInquiryPrefill } from './leadTagsToInquiryPrefill';
import { leadTagIsNeverPlaceIdentity } from './composeLeadTitle';

describe('leadTagsToInquiryPrefill', () => {
  it('maps honeymoon + Goa', () => {
    expect(leadTagsToInquiryPrefill(['Honeymoon', 'Goa'])).toEqual({
      travelType: 'honeymoon',
      domesticOrIntl: 'domestic',
      destinationNames: ['Goa'],
      interests: [],
    });
  });

  it('maps International to scope, not destination', () => {
    expect(leadTagsToInquiryPrefill(['International', 'Family'])).toEqual({
      travelType: 'family',
      domesticOrIntl: 'international',
      destinationNames: [],
      interests: [],
    });
  });

  it('never treats International or Honeymoon as Place identity / destinationPlaceId', () => {
    const prefill = leadTagsToInquiryPrefill(['International', 'Honeymoon', 'Goa']);
    expect(prefill.destinationNames).toEqual(['Goa']);
    expect(prefill.destinationNames).not.toContain('International');
    expect(prefill.destinationNames).not.toContain('Honeymoon');
    expect(leadTagIsNeverPlaceIdentity('International')).toBe(true);
    expect(leadTagIsNeverPlaceIdentity('Honeymoon')).toBe(true);
    expect(leadTagIsNeverPlaceIdentity('Goa')).toBe(false);
  });

  it('prefers Honeymoon over Family/Weekend for travelType', () => {
    expect(leadTagsToInquiryPrefill(['Family', 'Weekend', 'Honeymoon']).travelType).toBe(
      'honeymoon',
    );
  });

  it('keeps Weekend as interest and Corporate as business', () => {
    expect(leadTagsToInquiryPrefill(['Corporate', 'Weekend', 'Kerala'])).toEqual({
      travelType: 'business',
      domesticOrIntl: 'domestic',
      destinationNames: ['Kerala'],
      interests: ['Weekend'],
    });
  });

  it('puts unknown chips into interests', () => {
    expect(leadTagsToInquiryPrefill(['Darjeeling', 'Adventure'])).toEqual({
      travelType: 'leisure',
      domesticOrIntl: 'domestic',
      destinationNames: [],
      interests: ['Darjeeling', 'Adventure'],
    });
  });

  it('handles empty input', () => {
    expect(leadTagsToInquiryPrefill(undefined)).toEqual({
      travelType: 'leisure',
      domesticOrIntl: 'domestic',
      destinationNames: [],
      interests: [],
    });
  });
});
