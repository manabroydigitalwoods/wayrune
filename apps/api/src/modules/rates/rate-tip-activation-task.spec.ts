import { describe, expect, it } from 'vitest';
import {
  rateTipActivationSupplierLinkPath,
  rateTipActivationTaskTitle,
} from './rate-tip-activation-task';

describe('rate-tip-activation-task', () => {
  it('builds hotel / transfer / activity titles', () => {
    expect(
      rateTipActivationTaskTitle({
        product: 'hotel',
        versionNumber: 2,
        detail: 'Deluxe',
      }),
    ).toBe('Activate hotel rate v2 · Deluxe');
    expect(
      rateTipActivationTaskTitle({
        product: 'transfer',
        versionNumber: 3,
      }),
    ).toBe('Activate transfer fare v3');
    expect(
      rateTipActivationTaskTitle({
        product: 'activity',
        versionNumber: 4,
        detail: 'River rafting',
      }),
    ).toBe('Activate activity rate v4 · River rafting');
  });

  it('links supplier chart when supplierId present', () => {
    expect(rateTipActivationSupplierLinkPath('sup_1')).toBe(
      '/suppliers/sup_1#supplier-rate-chart',
    );
    expect(rateTipActivationSupplierLinkPath(null)).toBe('/rates');
  });
});
