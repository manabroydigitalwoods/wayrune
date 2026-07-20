import { describe, expect, it } from 'vitest';
import { buildFinancePortfolio } from './finance-portfolio';

describe('finance-portfolio', () => {
  it('aggregates margin across accepted trips', () => {
    const board = buildFinancePortfolio({
      trips: [
        {
          tripId: 't1',
          tripNumber: 'TRP-02',
          tripTitle: 'Goa',
          tripStatus: 'confirmed',
          partyName: 'Sneha',
          startDate: '2026-10-05',
          endDate: '2026-10-10',
          currency: 'INR',
          sellTotal: 29085,
          costTotal: 20500,
          taxTotal: 0,
          marginAmount: 7200,
          marginPercent: 26,
          acceptedAt: '2026-07-01',
          quoteNumber: 'QT-02',
          versionNumber: 1,
        },
        {
          tripId: 't2',
          tripNumber: 'TRP-03',
          tripTitle: 'Offsite',
          tripStatus: 'booking_in_progress',
          partyName: 'Acme',
          startDate: '2026-11-12',
          endDate: '2026-11-15',
          currency: 'INR',
          sellTotal: 100000,
          costTotal: 70000,
          taxTotal: 0,
          marginAmount: 30000,
          marginPercent: 30,
          acceptedAt: '2026-07-02',
          quoteNumber: 'QT-03',
          versionNumber: 1,
        },
      ],
    });
    expect(board.summary.tripCount).toBe(2);
    expect(board.summary.sellTotal).toBe(129085);
    expect(board.summary.costTotal).toBe(90500);
    expect(board.summary.marginAmount).toBe(37200);
    expect(board.summary.marginPercent).toBe(28.82);
    expect(board.summary.otherCurrencyCount).toBe(0);
  });

  it('summarises dominant currency only when org FX rollup not provided', () => {
    const board = buildFinancePortfolio({
      trips: [
        {
          tripId: 't1',
          tripNumber: 'TRP-02',
          tripTitle: 'Goa',
          tripStatus: 'confirmed',
          partyName: 'Sneha',
          startDate: '2026-10-05',
          endDate: '2026-10-10',
          currency: 'INR',
          sellTotal: 29085,
          costTotal: 20500,
          taxTotal: 0,
          marginAmount: 7200,
          marginPercent: 26,
          acceptedAt: '2026-07-01',
          quoteNumber: 'QT-02',
          versionNumber: 1,
        },
        {
          tripId: 't-usd',
          tripNumber: 'TRP-USD',
          tripTitle: 'Dubai',
          tripStatus: 'confirmed',
          partyName: 'Acme',
          startDate: '2026-10-08',
          endDate: '2026-10-12',
          currency: 'USD',
          sellTotal: 5000,
          costTotal: 3000,
          taxTotal: 0,
          marginAmount: 2000,
          marginPercent: 40,
          acceptedAt: '2026-07-02',
          quoteNumber: 'QT-USD',
          versionNumber: 1,
        },
        {
          tripId: 't2',
          tripNumber: 'TRP-03',
          tripTitle: 'Offsite',
          tripStatus: 'booking_in_progress',
          partyName: 'Acme',
          startDate: '2026-11-12',
          endDate: '2026-11-15',
          currency: 'INR',
          sellTotal: 100000,
          costTotal: 70000,
          taxTotal: 0,
          marginAmount: 30000,
          marginPercent: 30,
          acceptedAt: '2026-07-02',
          quoteNumber: 'QT-03',
          versionNumber: 1,
        },
      ],
    });
    expect(board.rows).toHaveLength(3);
    expect(board.summary.currency).toBe('INR');
    expect(board.summary.tripCount).toBe(2);
    expect(board.summary.otherCurrencyCount).toBe(1);
    expect(board.summary.convertedTripCount).toBe(0);
    expect(board.summary.sellTotal).toBe(129085);
    expect(board.summary.marginAmount).toBe(37200);
  });

  it('rolls foreign trips into book via org FX rates', () => {
    const board = buildFinancePortfolio({
      bookCurrency: 'INR',
      fxRates: { USD: 83 },
      trips: [
        {
          tripId: 't1',
          tripNumber: 'TRP-02',
          tripTitle: 'Goa',
          tripStatus: 'confirmed',
          partyName: 'Sneha',
          startDate: '2026-10-05',
          endDate: '2026-10-10',
          currency: 'INR',
          sellTotal: 10000,
          costTotal: 7000,
          taxTotal: 0,
          marginAmount: 3000,
          marginPercent: 30,
          acceptedAt: '2026-07-01',
          quoteNumber: 'QT-02',
          versionNumber: 1,
        },
        {
          tripId: 't-usd',
          tripNumber: 'TRP-USD',
          tripTitle: 'Dubai',
          tripStatus: 'confirmed',
          partyName: 'Acme',
          startDate: '2026-10-08',
          endDate: '2026-10-12',
          currency: 'USD',
          sellTotal: 100,
          costTotal: 60,
          taxTotal: 0,
          marginAmount: 40,
          marginPercent: 40,
          acceptedAt: '2026-07-02',
          quoteNumber: 'QT-USD',
          versionNumber: 1,
        },
      ],
    });
    expect(board.summary.currency).toBe('INR');
    expect(board.summary.tripCount).toBe(2);
    expect(board.summary.convertedTripCount).toBe(1);
    expect(board.summary.otherCurrencyCount).toBe(0);
    expect(board.summary.sellTotal).toBe(18300);
    expect(board.summary.costTotal).toBe(11980);
    expect(board.summary.marginAmount).toBe(6320);
  });

  it('excludes foreign trips when org FX rate is missing', () => {
    const board = buildFinancePortfolio({
      bookCurrency: 'INR',
      fxRates: { EUR: 90 },
      trips: [
        {
          tripId: 't-usd',
          tripNumber: 'TRP-USD',
          tripTitle: 'Dubai',
          tripStatus: 'confirmed',
          partyName: 'Acme',
          startDate: '2026-10-08',
          endDate: '2026-10-12',
          currency: 'USD',
          sellTotal: 100,
          costTotal: 60,
          taxTotal: 0,
          marginAmount: 40,
          marginPercent: 40,
          acceptedAt: '2026-07-02',
          quoteNumber: 'QT-USD',
          versionNumber: 1,
        },
      ],
    });
    expect(board.summary.tripCount).toBe(0);
    expect(board.summary.otherCurrencyCount).toBe(1);
    expect(board.summary.convertedTripCount).toBe(0);
    expect(board.summary.sellTotal).toBe(0);
  });

  it('filters by trip start window', () => {
    const board = buildFinancePortfolio({
      trips: [
        {
          tripId: 't1',
          tripNumber: 'TRP-02',
          tripTitle: 'Goa',
          tripStatus: 'confirmed',
          partyName: null,
          startDate: '2026-10-05',
          endDate: null,
          currency: 'INR',
          sellTotal: 100,
          costTotal: 50,
          taxTotal: 0,
          marginAmount: 50,
          marginPercent: 50,
          acceptedAt: null,
          quoteNumber: null,
          versionNumber: 1,
        },
        {
          tripId: 't2',
          tripNumber: 'TRP-03',
          tripTitle: 'Later',
          tripStatus: 'quoted',
          partyName: null,
          startDate: '2026-12-01',
          endDate: null,
          currency: 'INR',
          sellTotal: 200,
          costTotal: 100,
          taxTotal: 0,
          marginAmount: 100,
          marginPercent: 50,
          acceptedAt: null,
          quoteNumber: null,
          versionNumber: 1,
        },
      ],
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0]!.tripNumber).toBe('TRP-02');
  });
});
