import { describe, expect, it } from 'vitest';
import {
  normalizeQuoteVersionLabel,
  quoteVersionLabelPickerOptions,
  quoteVersionOptionLabel,
  QUOTE_VERSION_LABEL_PRESETS,
} from './quoteVersionLabel';

describe('quoteVersionOptionLabel', () => {
  it('prefers stored label', () => {
    expect(
      quoteVersionOptionLabel({
        versionNumber: 1,
        label: 'v1 (from Darjeeling FIT)',
      }),
    ).toBe('v1 (from Darjeeling FIT)');
  });

  it('falls back to Version N', () => {
    expect(quoteVersionOptionLabel({ versionNumber: 2 })).toBe('Version 2');
    expect(quoteVersionOptionLabel({ versionNumber: 1, label: '  ' })).toBe(
      'Version 1',
    );
  });

  it('normalizes for storage', () => {
    expect(normalizeQuoteVersionLabel('  Peak season  ')).toBe('Peak season');
    expect(normalizeQuoteVersionLabel('   ')).toBeNull();
    expect(normalizeQuoteVersionLabel('x'.repeat(100))?.length).toBe(80);
  });

  it('builds picker presets including version number', () => {
    const opts = quoteVersionLabelPickerOptions({ versionNumber: 3 });
    expect(opts[0]).toEqual({ value: 'v3', label: 'v3' });
    expect(opts.map((o) => o.value)).toEqual([
      'v3',
      ...QUOTE_VERSION_LABEL_PRESETS,
    ]);
    expect(quoteVersionLabelPickerOptions({}).map((o) => o.value)).toEqual([
      ...QUOTE_VERSION_LABEL_PRESETS,
    ]);
  });
});
