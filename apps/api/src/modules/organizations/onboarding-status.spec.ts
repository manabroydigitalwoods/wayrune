import { describe, expect, it } from 'vitest';
import {
  buildOnboardingStatus,
  supplierContactComplete,
} from './onboarding-status';

const empty = {
  hasLogo: false,
  hasPrimaryColor: false,
  supplierCount: 0,
  hotelRateCount: 0,
  transferFareCount: 0,
  activityRateCount: 0,
  quoteTemplateCount: 0,
  quotationCount: 0,
  acceptedQuoteCount: 0,
  whatsappEnabled: false,
  hotelSupplierContactOk: false,
  transferSupplierContactOk: false,
  activitySupplierContactOk: false,
  supplierBookingCount: 0,
};

describe('buildOnboardingStatus', () => {
  it('scores incomplete setup', () => {
    const status = buildOnboardingStatus(empty);
    expect(status.quoteReady.doneCount).toBe(0);
    expect(status.operateReady.complete).toBe(false);
    expect(status.complete).toBe(false);
  });

  it('marks quote-ready without WhatsApp or operate extras', () => {
    const status = buildOnboardingStatus({
      ...empty,
      hasLogo: true,
      supplierCount: 1,
      hotelRateCount: 1,
      quotationCount: 1,
      acceptedQuoteCount: 1,
    });
    expect(status.quoteReady.complete).toBe(true);
    expect(status.operateReady.complete).toBe(false);
    expect(status.items.find((i) => i.key === 'whatsapp')?.done).toBe(false);
    expect(status.complete).toBe(false);
  });

  it('marks operate-ready when H/T/A contacts, rates, and booking exist', () => {
    const status = buildOnboardingStatus({
      ...empty,
      hasLogo: true,
      supplierCount: 3,
      hotelRateCount: 1,
      transferFareCount: 1,
      activityRateCount: 1,
      quotationCount: 1,
      acceptedQuoteCount: 1,
      hotelSupplierContactOk: true,
      transferSupplierContactOk: true,
      activitySupplierContactOk: true,
      supplierBookingCount: 1,
      whatsappEnabled: true,
    });
    expect(status.quoteReady.complete).toBe(true);
    expect(status.operateReady.complete).toBe(true);
    expect(status.complete).toBe(true);
  });

  it('retargets quote_template to draft walkthrough', () => {
    const status = buildOnboardingStatus(empty);
    const item = status.quoteReady.items.find((i) => i.key === 'quote_template');
    expect(item?.label).toMatch(/first quote/i);
    expect(item?.href).toContain('walkthrough=1');
  });

  it('marks first quote done only when a quotation exists', () => {
    const templatesOnly = buildOnboardingStatus({
      ...empty,
      quoteTemplateCount: 2,
      quotationCount: 0,
    });
    expect(
      templatesOnly.quoteReady.items.find((i) => i.key === 'quote_template')
        ?.done,
    ).toBe(false);
    const withQuote = buildOnboardingStatus({
      ...empty,
      quoteTemplateCount: 2,
      quotationCount: 1,
    });
    expect(
      withQuote.quoteReady.items.find((i) => i.key === 'quote_template')?.done,
    ).toBe(true);
  });
});

describe('supplierContactComplete', () => {
  it('requires name and email or phone', () => {
    expect(supplierContactComplete({ name: 'A' })).toBe(false);
    expect(supplierContactComplete({ name: 'A', email: 'a@b.com' })).toBe(true);
    expect(supplierContactComplete({ name: 'A', phone: '+91' })).toBe(true);
  });
});
