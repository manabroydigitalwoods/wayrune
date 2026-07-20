import { describe, expect, it } from 'vitest';
import { isClientAuditAction } from './client-audit-actions';

describe('client-audit-actions', () => {
  it('allowlists friction events only', () => {
    expect(isClientAuditAction('match_alt_use')).toBe(true);
    expect(isClientAuditAction('use_previous_trip')).toBe(true);
    expect(isClientAuditAction('delete_everything')).toBe(false);
  });
});
