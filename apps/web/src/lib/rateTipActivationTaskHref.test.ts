import { describe, expect, it } from 'vitest';
import { rateTipActivationTaskHref } from './rateTipActivationTaskHref';

describe('rateTipActivationTaskHref', () => {
  it('opens supplier rate chart for hotel / transfer / activity tips', () => {
    const desc =
      'New tip is pending dual-control.\n/suppliers/sup_abc#supplier-rate-chart';
    expect(rateTipActivationTaskHref('supplier_hotel_rate', desc)).toBe(
      '/suppliers/sup_abc#supplier-rate-chart',
    );
    expect(rateTipActivationTaskHref('transfer_fare', desc)).toBe(
      '/suppliers/sup_abc#supplier-rate-chart',
    );
    expect(rateTipActivationTaskHref('supplier_activity_rate', desc)).toBe(
      '/suppliers/sup_abc#supplier-rate-chart',
    );
  });

  it('ignores unrelated entity types', () => {
    expect(
      rateTipActivationTaskHref(
        'trip',
        '/suppliers/sup_abc#supplier-rate-chart',
      ),
    ).toBeNull();
  });
});
