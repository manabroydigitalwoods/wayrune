import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { firstSheetToCsvText, isRatesSpreadsheetFile } from './ratesSheetImport';

describe('ratesSheetImport', () => {
  it('detects spreadsheet filenames', () => {
    expect(isRatesSpreadsheetFile(new File([], 'rates.xlsx'))).toBe(true);
    expect(isRatesSpreadsheetFile(new File([], 'rates.csv'))).toBe(true);
    expect(isRatesSpreadsheetFile(new File([], 'rates.pdf'))).toBe(false);
  });

  it('converts first sheet to CSV with headers', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [
        'supplierName',
        'placeName',
        'roomType',
        'mealPlan',
        'unitCost',
        'weekendUnitCost',
        'currency',
        'startDate',
        'endDate',
      ],
      [
        'Darjeeling Heritage Lodge',
        'Darjeeling',
        'Deluxe mountain view',
        'MAP',
        4500,
        5200,
        'INR',
        '2026-04-01',
        '2026-06-30',
      ],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Rates');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const csv = firstSheetToCsvText(buf);
    expect(csv).toContain('supplierName');
    expect(csv).toContain('Darjeeling Heritage Lodge');
    expect(csv).toContain('4500');
  });
});
