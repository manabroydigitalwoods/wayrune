import { describe, expect, it } from 'vitest';
import {
  composeRatesImportAuditMetadata,
  mapAuditEventToImportBatch,
  RATES_IMPORT_AUDIT_ACTION,
} from './rates-import-audit';

describe('composeRatesImportAuditMetadata', () => {
  it('keeps a short skip sample', () => {
    const meta = composeRatesImportAuditMetadata({
      kind: 'hotel',
      okCount: 2,
      skipCount: 3,
      rowCount: 5,
      fileName: 'heritage.xlsx',
      results: [
        { row: 1, status: 'ok' },
        { row: 2, status: 'skip', reason: 'Supplier not found' },
        { row: 3, status: 'skip', reason: 'Place not found' },
        { row: 4, status: 'ok' },
        { row: 5, status: 'skip', reason: 'bad cost' },
      ],
    });
    expect(meta).toMatchObject({
      kind: 'hotel',
      okCount: 2,
      skipCount: 3,
      fileName: 'heritage.xlsx',
    });
    expect(meta.sampleSkips).toHaveLength(3);
    expect(RATES_IMPORT_AUDIT_ACTION).toBe('rates.import.commit');
  });
});

describe('mapAuditEventToImportBatch', () => {
  it('maps audit metadata for the UI list', () => {
    const row = mapAuditEventToImportBatch({
      id: 'ae-1',
      correlationId: 'batch-1',
      createdAt: new Date('2026-07-19T10:00:00.000Z'),
      metadataJson: {
        kind: 'activity',
        okCount: 4,
        skipCount: 1,
        rowCount: 5,
        fileName: 'tiger.csv',
        sampleSkips: [{ row: 2, reason: 'Supplier not found' }],
      },
      actor: { fullName: 'Owner Demo', email: 'owner@demo.travel' },
    });
    expect(row).toMatchObject({
      batchId: 'batch-1',
      kind: 'activity',
      okCount: 4,
      skipCount: 1,
      fileName: 'tiger.csv',
      actorName: 'Owner Demo',
      sampleSkips: [{ row: 2, reason: 'Supplier not found' }],
    });
  });

  it('returns empty sampleSkips when metadata omits them', () => {
    const row = mapAuditEventToImportBatch({
      id: 'ae-2',
      createdAt: '2026-07-19T10:00:00.000Z',
      metadataJson: { kind: 'hotel', okCount: 1, skipCount: 0, rowCount: 1 },
    });
    expect(row?.sampleSkips).toEqual([]);
  });
});
