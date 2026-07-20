import { describe, expect, it } from 'vitest';
import {
  PUBLIC_DOCS_BRING_YOUR_DATA_HREF,
  PUBLIC_DOCS_SECTIONS,
  publicDocsSectionById,
} from './publicDocs';
import {
  isBuyerVisibleReleaseNote,
  visibleReleaseNotes,
} from './releaseNotes';

describe('publicDocs', () => {
  it('exposes quoting, migration, and claim discipline sections', () => {
    expect(PUBLIC_DOCS_SECTIONS.map((s) => s.id)).toEqual([
      'how-quoting-works',
      'bring-your-data',
      'what-we-claim',
    ]);
    expect(publicDocsSectionById('how-quoting-works')?.title).toMatch(/quoting/i);
    expect(publicDocsSectionById('bring-your-data')?.title).toMatch(/bring your data/i);
    expect(
      publicDocsSectionById('bring-your-data')?.bullets.some((b) =>
        /CSV|XLSX|fail closed|FIT pack/i.test(b),
      ),
    ).toBe(true);
    expect(
      publicDocsSectionById('bring-your-data')?.bullets.some((b) =>
        /do not claim|Sembark cutover|zero data-loss/i.test(b),
      ),
    ).toBe(true);
    expect(publicDocsSectionById('what-we-claim')?.bullets.some((b) => /e-invoice|GSTR/i.test(b))).toBe(
      true,
    );
    expect(PUBLIC_DOCS_BRING_YOUR_DATA_HREF).toBe('/docs#bring-your-data');
    expect(publicDocsSectionById('missing')).toBeNull();
  });

  it('does not invent scale or migration vanity claims in buyer docs copy', () => {
    const blob = PUBLIC_DOCS_SECTIONS.map(
      (s) => `${s.title} ${s.summary} ${s.bullets.join(' ')}`,
    ).join(' ');
    expect(/10,?000|million agencies|95%\s*faster/i.test(blob)).toBe(false);
    expect(/switch in a day|one-click migrate|guaranteed parity/i.test(blob)).toBe(
      false,
    );
    expect(/do not claim|Testing|demo seed/i.test(blob)).toBe(true);
  });

  it('keeps About/changelog filter claim-safe', () => {
    const visible = visibleReleaseNotes();
    expect(visible.every(isBuyerVisibleReleaseNote)).toBe(true);
  });
});
