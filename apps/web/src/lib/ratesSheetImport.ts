import * as XLSX from 'xlsx';

/** Read the first worksheet of an .xlsx/.xls file into CSV text for the rates importer. */
export function firstSheetToCsvText(buf: ArrayBuffer): string {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const name = wb.SheetNames[0];
  if (!name) throw new Error('Workbook has no sheets');
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error('Workbook has no sheets');
  return XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
}

export function isRatesSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    name.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'application/vnd.ms-excel' ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/** Load a CSV or Excel file into pasteable CSV text (first sheet for workbooks). */
export async function loadRatesImportFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return file.text();
  }
  if (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    file.type.includes('spreadsheet') ||
    file.type === 'application/vnd.ms-excel'
  ) {
    const buf = await file.arrayBuffer();
    const csv = firstSheetToCsvText(buf).trim();
    if (!csv) throw new Error('First sheet is empty');
    return csv.endsWith('\n') ? csv : `${csv}\n`;
  }
  throw new Error('Use a .csv, .xlsx, or .xls file');
}
