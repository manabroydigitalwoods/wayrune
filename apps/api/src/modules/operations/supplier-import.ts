/** Supplier CSV import commit guardrails (mirrors parties import fail-closed). */

const SUPPLIER_TYPES = new Set([
  'hotel',
  'homestay',
  'farmstay',
  'car_rental',
  'driver',
  'restaurant',
  'dmc',
  'other',
  'activity',
  'guide',
  'transfer',
  'flight_ref',
  'transport',
]);

export function normalizeSupplierImportType(
  raw: string | null | undefined,
): string | null {
  const t = (raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!t) return null;
  if (SUPPLIER_TYPES.has(t)) return t;
  // Common aliases from spreadsheets
  if (t === 'car' || t === 'cars' || t === 'fleet') return 'car_rental';
  if (t === 'sightseeing' || t === 'excursion') return 'activity';
  if (t === 'transfers' || t === 'taxi') return 'transfer';
  return null;
}

export function supplierImportRowSkipReason(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  type?: string | null;
}): string | null {
  if (!input.name.trim()) return 'name_required';
  if (input.type != null && input.type !== '' && !SUPPLIER_TYPES.has(input.type)) {
    return 'invalid_type';
  }
  if (!input.email?.trim() && !input.phone?.trim()) {
    return 'contact_required';
  }
  return null;
}

export function supplierImportCommitError(input: {
  imported: number;
  skipped: number;
}): string | null {
  if (input.imported > 0) return null;
  if (input.skipped > 0) {
    return 'No suppliers imported — fix skip reasons and try again';
  }
  return 'Nothing to import — add at least one valid row';
}

export function formatSupplierImportSkipReason(reason: string): string {
  switch (reason) {
    case 'name_exists':
      return 'duplicate name';
    case 'contact_required':
      return 'email or phone required';
    case 'invalid_type':
      return 'unknown supplier type';
    case 'name_required':
      return 'name required';
    default:
      return reason.replace(/_/g, ' ');
  }
}
