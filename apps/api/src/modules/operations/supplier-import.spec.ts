import { describe, expect, it } from 'vitest';
import {
  formatSupplierImportSkipReason,
  normalizeSupplierImportType,
  supplierImportCommitError,
  supplierImportRowSkipReason,
} from './supplier-import';

describe('supplier-import', () => {
  it('normalizes types and aliases', () => {
    expect(normalizeSupplierImportType('Hotel')).toBe('hotel');
    expect(normalizeSupplierImportType('car rental')).toBe('car_rental');
    expect(normalizeSupplierImportType('sightseeing')).toBe('activity');
    expect(normalizeSupplierImportType('nope')).toBe(null);
  });

  it('requires name and contact for Operate-ready rows', () => {
    expect(
      supplierImportRowSkipReason({ name: '', email: 'a@b.com' }),
    ).toBe('name_required');
    expect(
      supplierImportRowSkipReason({ name: 'Acme', email: null, phone: null }),
    ).toBe('contact_required');
    expect(
      supplierImportRowSkipReason({
        name: 'Acme',
        email: 'ops@acme.test',
        type: 'hotel',
      }),
    ).toBe(null);
  });

  it('fail-closes when nothing imported', () => {
    expect(supplierImportCommitError({ imported: 0, skipped: 2 })).toMatch(
      /No suppliers imported/,
    );
    expect(supplierImportCommitError({ imported: 1, skipped: 2 })).toBe(null);
  });

  it('formats skip reasons', () => {
    expect(formatSupplierImportSkipReason('contact_required')).toBe(
      'email or phone required',
    );
  });
});
