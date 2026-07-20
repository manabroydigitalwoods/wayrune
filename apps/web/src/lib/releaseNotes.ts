/**
 * Claim-safe in-app release notes (Settings → About).
 * Only proven / architecture-proven entries are buyer-visible.
 */

export type ReleaseNoteClaimStatus =
  | 'proven'
  | 'architecture'
  | 'testing'
  | 'do_not_claim';

export type ReleaseNote = {
  id: string;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  title: string;
  summary: string;
  claimStatus: ReleaseNoteClaimStatus;
};

/** Product build label shown on About (not a marketing version claim). */
export const APP_RELEASE_LABEL = 'Travel OS · Jul 2026';

/**
 * Curated notes aligned with the strategy claim registry.
 * Do not add Testing / Do-not-claim marketing promises as proven.
 */
export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: '2026-07-20-package-folder-index',
    date: '2026-07-20',
    title: 'Empty package folders stay in the library nav',
    summary:
      'New folder… keeps a shelf visible before any package lives there. Remove empty… drops it from the org folder index (packages untouched). Rename still remaps both templates and the index.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-cross-pair-fx-convert',
    date: '2026-07-20',
    title: 'Convert non-INR chart amounts into a foreign quote',
    summary:
      'Lock FX (and Match-safe convert) can turn a EUR or AED buy into a USD quote by pricing through INR: org Settings FX rates for the chart currency, then the quote lock for the sell currency. Missing org rate fails closed — no silent identity convert.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-tip-field-restore',
    date: '2026-07-20',
    title: 'Restore one transfer or activity field from History',
    summary:
      'On a transfer or activity tip Diff, Restore creates a new tip that keeps today’s buy except the chosen field (adult/child/infant cost, pricing mode, private/SIC, name, or dates) copied from the prior version — same dual-control Activate path as a full restore.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-child-nationality-extras',
    date: '2026-07-20',
    title: 'Child occupancy extras by nationality',
    summary:
      'Hotel Match can price each child’s with/without-bed extra from that child’s market tip when Child nationalities are set on the line. Occupancy shows child mkts when mixed.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-named-alone-traveller',
    date: '2026-07-20',
    title: 'Name who sleeps alone on uneven rooming',
    summary:
      'When a hotel line is 3A/2R or another uneven DBL+SGL board, Alone picks a trip traveller by name (not just nationality). Occupancy shows Alone · Name on the split cue.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-folder-rename',
    date: '2026-07-20',
    title: 'Rename or move package folders',
    summary:
      'From the package folder breadcrumb, Rename folder updates every active template under that path (including children). Blank clears the prefix.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-tip-field-restore',
    date: '2026-07-20',
    title: 'Restore one hotel rate field from History',
    summary:
      'On a tip Diff, Restore creates a new tip that keeps today’s buy except the chosen field (weekday/weekend cost, meal plan, or dates) copied from the prior version — same dual-control Activate path as a full restore.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-uneven-6a4r-board',
    date: '2026-07-20',
    title: 'Uneven hotel rooming for 6 adults / 4 rooms',
    summary:
      'Mixed-nationality Match now composes 2DBL+2SGL (and other rooms < adults < 2×rooms boards) without multiplying the night buy by room count. Singles-last control pins who takes a single.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-activation-task',
    date: '2026-07-20',
    title: 'Tasks when transfer or activity tips need Activate',
    summary:
      'Without rates.approve, a new transfer or activity tip now creates a high-priority Task (and notifies the assignee). Open jumps to the supplier Rates tab; Activate marks the Task done — same dual-control inbox as hotel.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-csv-matrix-meals',
    date: '2026-07-20',
    title: 'One CSV row for EP/CP/MAP/AP hotel tips',
    summary:
      'Hotel rate import can expand meal-prefixed columns (e.g. mapUnitCost + cpSglUnitCost) into sibling tips for the same season — same grid as the rate matrix.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-matrix-delete-cleared-meals',
    date: '2026-07-20',
    title: 'Clear a meal plan from the rate matrix',
    summary:
      'Blanking all cells for a sibling meal (e.g. CP) and saving removes that tip. The open meal stays — delete its row if you need it gone.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-csv-band-weekend',
    date: '2026-07-20',
    title: 'Hotel CSV SGL/DBL/TPL weekend columns',
    summary:
      'Bulk hotel rate import can set per-band weekday and weekend buy (sgl/dbl/tpl). Chart-only sheets still work without the new columns.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-activate',
    date: '2026-07-20',
    title: 'Activate transfer and activity rate tips',
    summary:
      'Staff without rates.approve submit new transfer/activity tips as pending. Managers Activate before Match uses the buy — same dual-control as hotels.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-receivable-cd-tax-split',
    date: '2026-07-20',
    title: 'Tax split on receivable invoices',
    summary:
      'Customer instalment commercial documents store net + tax (pro-rated from the accepted quote) with CGST/SGST or IGST notes — display only, not a GST invoice.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-public-pay-tax-display',
    date: '2026-07-20',
    title: 'Tax breakdown on payment links',
    summary:
      'Guest pay pages show a display-only tax share (CGST/SGST or IGST) pro-rated from the accepted quote — not a GST invoice.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-rooming-multiplicity-3axn',
    date: '2026-07-20',
    title: 'Rooming, traveller counts, and triple×N',
    summary:
      '3A/2R Alone picker chooses the single. Traveller nationalities keep counts (e.g. 1×IN + 2×US). adults = 3 × rooms multiplies TPL/3 across rooms.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-weighted-2code-3a-pax',
    date: '2026-07-20',
    title: 'Weighted 2-market triple buy',
    summary:
      'Three adults with two guest markets (e.g. IN+US) weight the first market twice on TPL/3 or DBL+SGL. Cue lists both IN shares.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-dbl-sgl-pax-buy-split',
    date: '2026-07-20',
    title: 'Uneven 3 adults / 2 rooms buy',
    summary:
      'Three guest markets across two rooms compose as double + single (DBL/2 + DBL/2 + SGL). Cue shows DBL+SGL; buy is not multiplied by two rooms again.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-public-changelog',
    date: '2026-07-20',
    title: 'Public changelog',
    summary:
      'Login-free /changelog mirrors Settings → About with the same claim-safe Proven and Architecture notes. No scale claims.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-tpl-pax-buy-split',
    date: '2026-07-20',
    title: 'Triple per-pax hotel buy',
    summary:
      'Mixed-nationality TPL/3 split applies for 3 adults in one room with three guest markets. Occupancy cue lists each share.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-multi-room-pax-buy-split',
    date: '2026-07-20',
    title: 'Multi-room per-pax hotel buy',
    summary:
      'Mixed-nationality DBL/2 split applies when adults = 2 × rooms (e.g. 4 adults / 2 doubles). Occupancy cue shows × N rooms.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-finance-quote-tax-display',
    date: '2026-07-20',
    title: 'Finance quote tax breakdown',
    summary:
      'Trip Finance shows the accepted quote’s tax total with the same CGST/SGST or IGST display split as Quotes — display only, not a GST invoice claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-multi-approver-hotel-rate',
    date: '2026-07-20',
    title: 'Hotel rate dual-control Activate',
    summary:
      'Consultants without rates.approve create a pending tip; Match keeps the live tip until a manager Activates. Tasks link to the supplier rate chart.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-demo-fit-timing-seed',
    date: '2026-07-20',
    title: 'Demo FIT timing samples',
    summary:
      'Local db:seed stamps 20 under-3-minute FIT build samples on demo-travel so the sales strip can show claim-ready. Production orgs still need real send timings.',
    claimStatus: 'architecture',
  },
  {
    id: '2026-07-20-per-pax-buy-children',
    date: '2026-07-20',
    title: 'Per-pax buy with children',
    summary:
      'Mixed-nationality DBL/2 buy still applies when the room has children. Occupancy cue shows Split plus child extras when contracted.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-matrix-weekend-columns',
    date: '2026-07-20',
    title: 'Matrix weekend columns',
    summary:
      'Meal × occupancy matrix edits weekday and weekend buy per SGL/DBL/TPL. Blank weekend keeps the prior band weekend or scales from the chart weekend.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-template-diff-side-by-side',
    date: '2026-07-20',
    title: 'Package template History Diff side-by-side',
    summary:
      'Use-template History Diff expands a Field / This tip / Current table for changed line prices, add/remove, and meta versus the current package tip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-quote-tax-freeze-infer',
    date: '2026-07-20',
    title: 'Quote tax freeze + destination POS suggest',
    summary:
      'Sent or PDF proposals freeze display tax identity on the quote version. Blank trip destination POS can suggest a state from destinations (display only — not saved, not a GST invoice claim).',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-trip-destination-pos',
    date: '2026-07-20',
    title: 'Trip destination place of supply',
    summary:
      'Override the org destination place of supply on a trip for CGST/SGST/IGST display. Clear the field to use the org default. Display only — not a GST invoice claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-tip-diff-side-by-side',
    date: '2026-07-20',
    title: 'Transfer & activity tip Diff side-by-side',
    summary:
      'Transfer and activity rate History Diff expands a Field / This tip / Current table for changed costs, mode/type, and dates versus the active tip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-gst-display-split',
    date: '2026-07-20',
    title: 'CGST / SGST / IGST display split',
    summary:
      'When agency and destination place of supply are set, proposals and the trip pricing summary show a CGST+SGST or IGST breakdown of the same tax total. Display only — not a GST invoice or compliance claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-per-pax-buy-split',
    date: '2026-07-20',
    title: 'Mixed-nationality hotel buy split',
    summary:
      'For one room with two adults of different nationalities, Match can price buy as half the DBL tip for each guest market (e.g. IN + US) instead of the whole Foreign card — when both tips exist.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-tip-diff-side-by-side',
    date: '2026-07-20',
    title: 'Hotel tip Diff side-by-side',
    summary:
      'Hotel rate History Diff expands a Field / This tip / Current table for changed costs, meal, dates, and occupancy versus the active tip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-tax-identity-proposals',
    date: '2026-07-20',
    title: 'GST label on quotes & proposals',
    summary:
      'Proposals and the trip pricing summary use your tax label (e.g. GST) and can show GSTIN plus place of supply from Business settings. Line tax % is unchanged — not a GST filing claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-edit-traveller-nationality',
    date: '2026-07-20',
    title: 'Edit traveller nationality',
    summary:
      'Update a trip traveller’s nationality (and lead flag) from the travellers table. Hotel Match still prefers explicit quote-line markets, then travellers.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-add-traveller-nationality',
    date: '2026-07-20',
    title: 'Nationality on Add traveller',
    summary:
      'Set Indian, Foreign, or any country when adding a trip traveller. The travellers table shows nationality, and blank hotel lines Match from it.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-traveller-nationality-default',
    date: '2026-07-20',
    title: 'Hotel Match defaults from trip travellers',
    summary:
      'When a hotel line has no guest nationality, Match uses trip travellers (lead first; mixed guests collapse to Foreign). Explicit line nationalities still win.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-mixed-guest-nationality',
    date: '2026-07-20',
    title: 'Mixed guest nationalities on hotel Match',
    summary:
      'Add each guest market on the hotel quote line. Indian + foreign or multiple countries Match the Foreign (INTL) card; a single shared country still prefers that tip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-iso3166-nationality-picker',
    date: '2026-07-20',
    title: 'Full country nationality picker',
    summary:
      'Rate chart and quote Match guest nationality search the full ISO-3166 country list, with quick chips for Indian, Foreign, and common markets.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-tip-diff',
    date: '2026-07-20',
    title: 'Transfer & activity tip Diff vs current',
    summary:
      'Transfer and activity version History shows what changed versus the active tip (costs, mode/type, dates).',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-per-iso-nationality',
    date: '2026-07-20',
    title: 'Hotel country-specific rate cards',
    summary:
      'Rate chart and quote Match support country tips (US, GB, AE…) alongside Indian and Foreign catch-all. Match prefers the guest country, then Foreign, then any.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-activity-version',
    date: '2026-07-20',
    title: 'Transfer & activity rate version history',
    summary:
      'Transfer and activity Rate charts support New version and History restore, same as hotels. Match uses the active tip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-tip-diff',
    date: '2026-07-20',
    title: 'Hotel rate tip Diff vs current',
    summary:
      'Hotel version History shows what changed versus the active tip (cost, meal, dates, occupancy).',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-min-stay-gate',
    date: '2026-07-20',
    title: 'Hotel min-stay send gate',
    summary:
      'Match stamps short min stay on the quote line. Send and approve stay blocked until nights are extended or a manager with inventory_risk.approve acknowledges with a reason.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-rate-version',
    date: '2026-07-20',
    title: 'Hotel rate version history',
    summary:
      'New version supersedes a rate tip while keeping history. Restore copies an older tip into a new active version. Contract New version now copies occupancy bands.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-nationality',
    date: '2026-07-20',
    title: 'Hotel Indian vs foreign rate cards',
    summary:
      'Rate chart marks IN or INTL nationality markets, plus country ISO tips. Match prefers exact market, then Foreign catch-all, then any-nationality cards.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-min-stay',
    date: '2026-07-20',
    title: 'Hotel minimum stay on rate cards',
    summary:
      'Rate chart sets min stay nights. Match cues when the stay is shorter; send is blocked until acknowledged.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-weekend-band',
    date: '2026-07-20',
    title: 'Weekend cost per occupancy band',
    summary:
      'Rate chart sets Single/Double/Triple weekend buy separately. Match uses band weekend when set; otherwise scales from the season chart weekend.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-meal-occ-matrix',
    date: '2026-07-20',
    title: 'Meal × occupancy rate matrix',
    summary:
      'Rate chart grid edits EP/CP/MAP/AP × Single/Double/Triple for one season window and creates or updates sibling meal rows.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-demo-org',
    date: '2026-07-20',
    title: 'Named demo trip in sample FIT pack',
    summary:
      'Install opens “Darjeeling classic FIT — demo” with draft quote and sample guest. Onboarding offers Open demo trip after templates exist.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-copy-meal',
    date: '2026-07-20',
    title: 'Copy hotel rate as other meal plan',
    summary:
      'Rate chart clones a season row into EP/CP/MAP/AP with the same dates and occupancy bands, nudging costs for the target meal.',
    claimStatus: 'proven',
  },
      {
        id: '2026-07-20-fit-claim-gate',
        date: '2026-07-20',
        title: 'Quote speed claim discipline',
        summary:
          'Sales strip shows median FIT build with a testing/ready gate. Public “under three minutes” stays withheld until sample size and median clear the gate.',
        claimStatus: 'proven',
      },
  {
    id: '2026-07-20-adult-bands',
    date: '2026-07-20',
    title: 'Hotel SGL / DBL / TPL contracted bases',
    summary:
      'Rate chart Single/Double/Triple bands apply on Match by adults per room, with weekend cost scaled from the season row.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-live-fx',
    date: '2026-07-20',
    title: 'Live FX refresh in Settings',
    summary:
      'Refresh from market (Frankfurter/ECB) writes org FX rates used by quote Lock FX. AED keeps prior values when not in the feed.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-folders',
    date: '2026-07-20',
    title: 'Package folder paths',
    summary:
      'Slash-path folders (e.g. Hill stations/Darjeeling) with breadcrumb filters on new-trip and Use-template pickers.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-19-ops-finance',
    date: '2026-07-19',
    title: 'Ops + collect & chase depth',
    summary:
      'Hotel/transfer/activity enquiry→confirm→voucher, movement board, payment-link chase, and aging AP settle — thin-complete agency wedge.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-01-multi-org',
    date: '2026-07-01',
    title: 'Multi-organization platform',
    summary:
      'Org kinds, memberships, and workspace switcher are in product. Partner network / Travel Exchange remains early — not a finished marketplace claim.',
    claimStatus: 'architecture',
  },
  {
    id: 'internal-fit-3m-testing',
    date: '2026-07-20',
    title: 'Under-three-minute FIT (public claim)',
    summary: 'Instrumented and gated; not approved for website or sales decks.',
    claimStatus: 'testing',
  },
  {
    id: 'internal-gst-ledger',
    date: '2026-07-01',
    title: 'Automated GST-compliant ledger',
    summary: 'Not built — do not claim.',
    claimStatus: 'do_not_claim',
  },
];

export function isBuyerVisibleReleaseNote(note: ReleaseNote): boolean {
  return note.claimStatus === 'proven' || note.claimStatus === 'architecture';
}

/** Buyer-facing notes, newest first (array order breaks same-day ties). */
export function visibleReleaseNotes(
  notes: ReleaseNote[] = RELEASE_NOTES,
  opts?: { limit?: number },
): ReleaseNote[] {
  const limit = opts?.limit ?? 12;
  return notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => isBuyerVisibleReleaseNote(note))
    .sort(
      (a, b) =>
        b.note.date.localeCompare(a.note.date) || a.index - b.index,
    )
    .map(({ note }) => note)
    .slice(0, Math.max(1, limit));
}

export function formatReleaseNoteDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
