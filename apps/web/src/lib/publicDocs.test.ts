import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DOCS_SECTIONS,
  publicDocsSectionById,
} from './publicDocs';
import {
  isBuyerVisibleReleaseNote,
  visibleReleaseNotes,
} from './releaseNotes';

describe('publicDocs', () => {
  it('exposes how-quoting and claim discipline sections', () => {
    expect(PUBLIC_DOCS_SECTIONS.map((s) => s.id)).toEqual([
      'how-quoting-works',
      'what-we-claim',
    ]);
    expect(publicDocsSectionById('how-quoting-works')?.title).toMatch(/quoting/i);
    expect(publicDocsSectionById('what-we-claim')?.bullets.some((b) => /e-invoice|GSTR/i.test(b))).toBe(
      true,
    );
    expect(publicDocsSectionById('missing')).toBeNull();
  });

  it('does not invent scale claims in buyer docs copy', () => {
    const blob = PUBLIC_DOCS_SECTIONS.map(
      (s) => `${s.title} ${s.summary} ${s.bullets.join(' ')}`,
    ).join(' ');
    expect(/10,?000|million agencies|95%\s*faster/i.test(blob)).toBe(false);
    expect(/do not claim|Testing|demo seed/i.test(blob)).toBe(true);
  });

  it('keeps About/changelog filter claim-safe', () => {
    const visible = visibleReleaseNotes();
    expect(visible.every(isBuyerVisibleReleaseNote)).toBe(true);
  });
});
