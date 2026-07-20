import { describe, expect, it } from 'vitest';
import { loadPartyCustomerOutstanding } from './party-credit-limit';

describe('loadPartyCustomerOutstanding', () => {
  it('sums open customer receivables for the party', async () => {
    const db = {
      tripPayment: {
        findMany: async () => [
          { amount: 1000, amountPaid: 200 },
          { amount: 500, amountPaid: 0 },
        ],
      },
    };
    const total = await loadPartyCustomerOutstanding(
      db,
      'org-1',
      'party-1',
      { orgCurrency: 'INR' },
    );
    expect(total).toBe(1300);
  });
});
