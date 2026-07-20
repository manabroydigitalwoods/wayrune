import { describe, expect, it } from 'vitest';
import {
  buildCommercialTaxBreakdown,
  commercialDocsToGstrExportRows,
  gstrExportRowsToCsv,
} from './gstr-export';

describe('gstr-export', () => {
  it('builds intra split when components omitted', () => {
    const b = buildCommercialTaxBreakdown({ taxTotal: 18, regime: 'intra' });
    expect(b).toEqual(
      expect.objectContaining({ cgst: 9, sgst: 9, igst: 0, taxTotal: 18 }),
    );
  });

  it('exports CSV with structured tax columns', () => {
    const rows = commercialDocsToGstrExportRows([
      {
        id: 'cd1',
        documentNumber: 'INV-1',
        docType: 'invoice',
        direction: 'receivable',
        label: 'Receivable',
        status: 'open',
        currency: 'INR',
        amount: 100,
        taxAmount: 18,
        taxBreakdownJson: {
          regime: 'intra',
          cgst: 9,
          sgst: 9,
          igst: 0,
          taxTotal: 18,
          hsn: '9985',
          source: 'display_split',
        },
        createdAt: '2026-07-01T00:00:00.000Z',
        payments: [{ amount: 118, paidAt: '2026-07-02T00:00:00.000Z' }],
      },
    ]);
    const csv = gstrExportRowsToCsv(rows);
    expect(csv).toContain('cgst,sgst,igst,hsn');
    expect(csv).toContain('9,9,0,9985');
    expect(csv).toContain('INV-1');
  });
});
