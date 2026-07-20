/**
 * Public buyer docs content (login-free). Claim-safe only — no scale invent.
 */

export type PublicDocsSectionId =
  | 'how-quoting-works'
  | 'bring-your-data'
  | 'what-we-claim';

export type PublicDocsSection = {
  id: PublicDocsSectionId;
  title: string;
  summary: string;
  bullets: string[];
};

/** In-app link to the migration story (Rates / Parties / Leads cues). */
export const PUBLIC_DOCS_BRING_YOUR_DATA_HREF = '/docs#bring-your-data';

export const PUBLIC_DOCS_SECTIONS: PublicDocsSection[] = [
  {
    id: 'how-quoting-works',
    title: 'How quoting works',
    summary:
      'The agency path from enquiry to a sendable FIT quotation — packages and Match, not a blank spreadsheet.',
    bullets: [
      'Capture the lead or enquiry, then open a trip with travel start dates.',
      'Apply a package template or build lines; Match pulls hotel, transfer, and activity buy from the rate chart.',
      'On the quotations tab, the FIT path strip (Package → Match → Margin → Send) points at the next blocker — progress cues are not the public ≤3-minute claim.',
      'Lock FX when the quote currency differs from the org book currency.',
      'Send the branded proposal (email or WhatsApp); the guest can accept on the public share when allowed.',
      'FIT build timing (workspace open → first send) feeds the sales strip — public “under 3 minutes” stays testing until real samples clear the gate.',
    ],
  },
  {
    id: 'bring-your-data',
    title: 'Bring your data',
    summary:
      'A claim-safe path to start quoting from your sheets — not a full tenant cutover from another system.',
    bullets: [
      'Add suppliers (stay, transport, experiences), then import hotel / transfer / activity rates via CSV or XLSX on Rates or the supplier Rate chart. Download the template from the import dialog; bad rows fail closed with skip reasons and optional replay.',
      'Import clients (parties) and leads from CSV when you have an existing book — name and contact fields first; duplicates and incomplete rows are skipped with a reason.',
      'Greenfield teams can Install the sample FIT pack instead of importing — named demo trip and templates for a first Match → send.',
      'After rates land, Match on a quote line prices buy from the chart; Other eligible rates and Why this rate explain the pick.',
      'We do not claim one-day Sembark cutover, complete historical migration, or zero data-loss guarantees. Human-assisted launch remains available when the sheet path is not enough.',
    ],
  },
  {
    id: 'what-we-claim',
    title: 'What we do and don’t claim',
    summary:
      'Buyer-safe positioning. Testing and prohibited claims stay out of About and the public changelog.',
    bullets: [
      'We claim a measured FIT path with a claim protocol (n≥20, median ≤3 minutes) — status Testing until production samples clear it. Demo seed does not count as public proof.',
      'FIT dogfood kit (ops): non-demo org → trip workspace Quotations tab (timing cue shows n/20 remaining) → Match/package → Send (~20 times). Demo seed never counts. Settings → About shows live sample progress; when publicClaimAllowed is true, product may flip registry to Proven and this page may say “under three minutes.” Until then, no website speed claim.',
      'Pilot smoke before depth work: write-off awaiting inbox, transfer party bands + child add-on, package sibling Up/Down, movement DriverJob sync. Public scale strip stays gated — no invented counts.',
      'Tax on proposals and pay pages is display identity and CGST/SGST/IGST split only — not e-invoice, GSTR filing, or a GST-compliant ledger.',
      'Multi-organization architecture is real; we do not claim a finished partner marketplace or network.',
      'No unverified scale numbers (agencies, trips, GMV) on public pages — measured strip appears only when the scale protocol clears.',
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
