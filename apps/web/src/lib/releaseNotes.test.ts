import { describe, expect, it } from 'vitest';
import {
  RELEASE_NOTES,
  formatReleaseNoteDate,
  isBuyerVisibleReleaseNote,
  visibleReleaseNotes,
} from './releaseNotes';

describe('releaseNotes', () => {
  it('hides testing and do-not-claim from buyer list', () => {
    expect(RELEASE_NOTES.some((n) => n.claimStatus === 'testing')).toBe(true);
    expect(RELEASE_NOTES.some((n) => n.claimStatus === 'do_not_claim')).toBe(true);
    const visible = visibleReleaseNotes();
    expect(visible.every(isBuyerVisibleReleaseNote)).toBe(true);
    expect(visible.some((n) => /under three minutes/i.test(n.title))).toBe(false);
    // Thin GST label + display split are proven; filing / compliant ledger stays hidden.
    const allBuyer = visibleReleaseNotes(RELEASE_NOTES, { limit: 100 });
    expect(allBuyer.some((n) => /GST label/i.test(n.title))).toBe(true);
    expect(allBuyer.some((n) => /CGST.*SGST.*IGST display/i.test(n.title))).toBe(
      true,
    );
    expect(
      allBuyer.some(
        (n) =>
          /GST-compliant|Automated GST/i.test(n.title) ||
          /GST-compliant ledger/i.test(n.summary),
      ),
    ).toBe(false);
  });

  it('keeps recent proven rate-grid notes buyer-visible', () => {
    const allBuyer = visibleReleaseNotes(RELEASE_NOTES, { limit: 100 });
    expect(allBuyer.some((n) => /SGL|Double|Triple|adult/i.test(n.title))).toBe(
      true,
    );
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-hotel-per-pax-buy-split'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-hotel-tip-diff-side-by-side'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-tax-identity-proposals'),
    ).toBe(true);
    // Newest array entries surface first on the About strip.
    const top = visibleReleaseNotes(RELEASE_NOTES, { limit: 5 });
    expect(top[0]?.id).toBe('2026-07-20-package-folder-dnd');
    expect(top[1]?.id).toBe('2026-07-20-auto-extend-min-stay');
    expect(top[2]?.id).toBe('2026-07-20-transfer-party-bands');
    expect(top[3]?.id).toBe('2026-07-20-meta-template-sync');
    expect(top[4]?.id).toBe('2026-07-20-razorpay-outbound-refund');
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-party-markup-override'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-credit-limit-gates'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-markup-preset-library'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-credit-terms-automation'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-cancellation-refund-settle'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-trip-shell-dashboard'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-crm-sla-surfaces'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-public-buyer-docs'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-package-folder-index'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-cross-pair-fx-convert'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-transfer-activity-tip-field-restore'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-child-nationality-extras'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-named-alone-traveller'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-package-folder-rename'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-hotel-tip-field-restore'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-uneven-6a4r-board'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-transfer-activity-activation-task'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-matrix-delete-cleared-meals'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-csv-band-weekend'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-transfer-activity-activate'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-receivable-cd-tax-split'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-public-pay-tax-display'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-rooming-multiplicity-3axn'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-weighted-2code-3a-pax'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-dbl-sgl-pax-buy-split'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-public-changelog'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-tpl-pax-buy-split'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-multi-room-pax-buy-split'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-finance-quote-tax-display'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-multi-approver-hotel-rate'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-demo-fit-timing-seed'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-per-pax-buy-children'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-matrix-weekend-columns'),
    ).toBe(true);
    expect(
      allBuyer.some(
        (n) => n.id === '2026-07-20-package-template-diff-side-by-side',
      ),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-quote-tax-freeze-infer'),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-trip-destination-pos'),
    ).toBe(true);
    expect(
      allBuyer.some(
        (n) => n.id === '2026-07-20-transfer-activity-tip-diff-side-by-side',
      ),
    ).toBe(true);
    expect(
      allBuyer.some((n) => n.id === '2026-07-20-gst-display-split'),
    ).toBe(true);
  });

  it('sorts newest first and respects limit', () => {
    const top = visibleReleaseNotes(RELEASE_NOTES, { limit: 2 });
    expect(top).toHaveLength(2);
    expect(top[0]!.date >= top[1]!.date).toBe(true);
  });

  it('formats dates for display', () => {
    expect(formatReleaseNoteDate('2026-07-20')).toMatch(/2026/);
    expect(formatReleaseNoteDate('bad')).toBe('bad');
  });
});
