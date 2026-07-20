/**
 * Public buyer docs content (login-free). Claim-safe only — no scale invent.
 */

export type PublicDocsSectionId = 'how-quoting-works' | 'what-we-claim';

export type PublicDocsSection = {
  id: PublicDocsSectionId;
  title: string;
  summary: string;
  bullets: string[];
};

export const PUBLIC_DOCS_SECTIONS: PublicDocsSection[] = [
  {
    id: 'how-quoting-works',
    title: 'How quoting works',
    summary:
      'The agency path from enquiry to a sendable FIT quotation — packages and Match, not a blank spreadsheet.',
    bullets: [
      'Capture the lead or enquiry, then open a trip with travel start dates.',
      'Apply a package template or build lines; Match pulls hotel, transfer, and activity buy from the rate chart.',
      'Lock FX when the quote currency differs from the org book currency.',
      'Send the branded proposal (email or WhatsApp); the guest can accept on the public share when allowed.',
      'FIT build timing (workspace open → first send) feeds the sales strip — public “under 3 minutes” stays testing until real samples clear the gate.',
    ],
  },
  {
    id: 'what-we-claim',
    title: 'What we do and don’t claim',
    summary:
      'Buyer-safe positioning. Testing and prohibited claims stay out of About and the public changelog.',
    bullets: [
      'We claim a measured FIT path with a claim protocol (n≥20, median ≤3 minutes) — status Testing until production samples clear it. Demo seed does not count as public proof.',
      'Tax on proposals and pay pages is display identity and CGST/SGST/IGST split only — not e-invoice, GSTR filing, or a GST-compliant ledger.',
      'Multi-organization architecture is real; we do not claim a finished partner marketplace or network.',
      'No unverified scale numbers (agencies, trips, GMV) on public pages.',
      'Changelog and About only list Proven or Architecture notes — not Testing or Do-not-claim marketing promises.',
    ],
  },
];

export function publicDocsSectionById(
  id: string | null | undefined,
): PublicDocsSection | null {
  if (!id) return null;
  return PUBLIC_DOCS_SECTIONS.find((s) => s.id === id) ?? null;
}
