import { describe, expect, it } from 'vitest';
import { buildInquiriesListQuery, inquiryQueueForVariant } from './inquiryQueue';

describe('inquiryQueueForVariant', () => {
  it('maps workspace routes to API queue params', () => {
    expect(inquiryQueueForVariant('requests')).toBe('my_requests');
    expect(inquiryQueueForVariant('planning')).toBe('planning');
    expect(inquiryQueueForVariant('sales')).toBe('active');
    expect(inquiryQueueForVariant('all')).toBeUndefined();
  });
});

describe('buildInquiriesListQuery', () => {
  it('includes incomplete and unassigned filters', () => {
    const qs = buildInquiriesListQuery({
      variant: 'planning',
      incomplete: true,
      unassigned: true,
    });
    expect(qs).toContain('queue=planning');
    expect(qs).toContain('incomplete=1');
    expect(qs).toContain('ownerId=unassigned');
  });
});
