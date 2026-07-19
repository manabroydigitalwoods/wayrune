import { describe, expect, it } from 'vitest';
import { buildOnboardingStatus } from './onboarding-status';

describe('buildOnboardingStatus', () => {
  it('scores incomplete setup', () => {
    const status = buildOnboardingStatus({
      hasLogo: false,
      hasPrimaryColor: false,
      supplierCount: 0,
      hotelRateCount: 0,
      transferFareCount: 0,
      quoteTemplateCount: 0,
      quotationCount: 0,
      acceptedQuoteCount: 0,
      whatsappEnabled: false,
    });
    expect(status.doneCount).toBe(0);
    expect(status.complete).toBe(false);
    expect(status.scorePercent).toBe(0);
  });

  it('marks branding and rates done', () => {
    const status = buildOnboardingStatus({
      hasLogo: true,
      hasPrimaryColor: false,
      supplierCount: 2,
      hotelRateCount: 1,
      transferFareCount: 0,
      quoteTemplateCount: 1,
      quotationCount: 1,
      acceptedQuoteCount: 1,
      whatsappEnabled: true,
    });
    expect(status.doneCount).toBe(6);
    expect(status.complete).toBe(true);
    expect(status.scorePercent).toBe(100);
    expect(status.items.find((i) => i.key === 'branding')?.done).toBe(true);
  });

  it('retargets quote_template to draft walkthrough', () => {
    const status = buildOnboardingStatus({
      hasLogo: false,
      hasPrimaryColor: false,
      supplierCount: 0,
      hotelRateCount: 0,
      transferFareCount: 0,
      quoteTemplateCount: 0,
      quotationCount: 0,
      acceptedQuoteCount: 0,
      whatsappEnabled: false,
    });
    const item = status.items.find((i) => i.key === 'quote_template');
    expect(item?.label).toMatch(/first quote/i);
    expect(item?.href).toContain('quotation-drafts');
    expect(item?.href).toContain('walkthrough=1');
  });

  it('marks first quote done only when a quotation exists', () => {
    const base = {
      hasLogo: false,
      hasPrimaryColor: false,
      supplierCount: 0,
      hotelRateCount: 0,
      transferFareCount: 0,
      acceptedQuoteCount: 0,
      whatsappEnabled: false,
    };
    const templatesOnly = buildOnboardingStatus({
      ...base,
      quoteTemplateCount: 2,
      quotationCount: 0,
    });
    expect(templatesOnly.items.find((i) => i.key === 'quote_template')?.done).toBe(
      false,
    );
    const withQuote = buildOnboardingStatus({
      ...base,
      quoteTemplateCount: 2,
      quotationCount: 1,
    });
    expect(withQuote.items.find((i) => i.key === 'quote_template')?.done).toBe(true);
  });
});
