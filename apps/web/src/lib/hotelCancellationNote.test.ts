import { describe, expect, it } from 'vitest';
import { formatHotelCancellationNote } from './hotelCancellationNote';

describe('formatHotelCancellationNote', () => {
  it('returns null when empty', () => {
    expect(formatHotelCancellationNote(null)).toBeNull();
    expect(formatHotelCancellationNote('  ')).toBeNull();
  });

  it('passes short summaries through', () => {
    expect(
      formatHotelCancellationNote(
        'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
      ),
    ).toBe(
      'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours.',
    );
  });

  it('truncates long text at a clause boundary when possible', () => {
    const long =
      'Free cancel up to 7 days before check-in; 50% within 7 days; 100% within 72 hours; no-show charged in full per contract terms and hotel house rules.';
    const note = formatHotelCancellationNote(long, { maxLength: 80 });
    expect(note).toMatch(/…$/);
    expect(note!.length).toBeLessThanOrEqual(80);
    expect(note).toContain('Free cancel');
  });

  it('uses fallback when summary missing', () => {
    expect(
      formatHotelCancellationNote(null, { fallback: 'Contract cancellation terms apply.' }),
    ).toBe('Contract cancellation terms apply.');
  });
});
