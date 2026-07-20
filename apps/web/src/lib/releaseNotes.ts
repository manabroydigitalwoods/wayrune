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
    id: '2026-07-20-inquiry-rooms-stamp',
    date: '2026-07-20',
    title: 'Apply inquiry party — hotel rooms',
    summary:
      'Revise Apply inquiry party stamps hotel rooms (ceil(adults ÷ 2)) like Use template. Use-template prefills Adults/Children/Rooms from the linked inquiry. No inquiry Rooms field yet.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-report-pack-delivery-honesty',
    date: '2026-07-20',
    title: 'Report pack last emailed · next due',
    summary:
      'Aging and portfolio org packs show cadence, last successful email, and next due. Email now toasts a queue timestamp; lastSentAt still advances only after SMTP succeeds.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-story-day-diff',
    date: '2026-07-20',
    title: 'Package History — story day Diff',
    summary:
      'Use-template History Diff compares story days by day number (title + item count) against the current tip — not only total day count.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-rooms-on-template-apply',
    date: '2026-07-20',
    title: 'Rooms on Use template',
    summary:
      'Start from template and New-trip package ask for Rooms (defaults to ceil(adults ÷ 2)). Hotel lines get details.rooms before rematch — no denser occupancy composer.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-enquiry-sla-parity',
    date: '2026-07-20',
    title: 'Enquiry desk Response SLA',
    summary:
      'Planning / My requests / Sales show the same Response SLA strip as Leads and Inbox. Stale in planning uses org inbox aging hours (queue chip + list filter). Triage surface only — not adoption proof.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-priced-alts-child-extras',
    date: '2026-07-20',
    title: 'Match alt buy — child extras',
    summary:
      'Other eligible rates est. stay buy includes age×market child columns and cross-tip child nationality extras when Match would. Use still re-matches to apply.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-priced-alts-split-preview',
    date: '2026-07-20',
    title: 'Match alt buy — multi-cab & per-pax',
    summary:
      'Other eligible rates est. buy follows Match multi-cab seat splits and mixed-nationality per-pax hotel buy when gated. Child age×market extras covered in a follow-on note.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-why-rate-noise-filter',
    date: '2026-07-20',
    title: 'Why this rate — quieter bullets',
    summary:
      'Match drawer keeps at most three primary Why bullets (room/meal/contract signal first). Hygiene lines (no blackout, dates covered, agency preferred, etc.) and overflow sit under more match notes. Full reasons still persist on the line.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-operate-through-dogfood',
    date: '2026-07-20',
    title: 'Operate-through dogfood kit',
    summary:
      'Accepted quotes with no customer receivables surface Next action → Schedule instalments (Finance Schedule from terms). Settings → About adds an Operate-through checklist (import → quote → accept → collect → ops → cancel). Process kit only — not agency adoption proof.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-bring-your-data',
    date: '2026-07-20',
    title: 'Bring your data (safe migration story)',
    summary:
      'Public /docs#bring-your-data walks suppliers → rate CSV/XLSX → clients/leads CSV → Match, or Install FIT pack for greenfield. Import dialogs link the guide. Explicitly not a full-tenant cutover or Sembark one-day switch.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-trip-next-action',
    date: '2026-07-20',
    title: 'Trip Next action strip',
    summary:
      'Above trip tabs, one Next action ranks control flags (overdue / credit / unconfirmed / voucher / collect…). Primary CTA opens the right tab and focuses the booking when known. Calm fallback when the trip is clear.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-priced-match-alts',
    date: '2026-07-20',
    title: 'Priced Match alternatives',
    summary:
      'Other eligible rates show estimated stay buy (hotel) or line buy (transfer/activity) for the current stay/pax — including multi-cab / per-pax / child extras when gated. Use still re-matches.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-why-this-rate',
    date: '2026-07-20',
    title: 'Why this rate on Match',
    summary:
      'Match drawer shows Why this rate for hotel, transfer, and activity. Accepted reasons and compact rejected diagnostics persist on the line so reopen does not require a fresh Match. Other eligible rates still use Use — rejected rows stay read-only.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-match-alternatives',
    date: '2026-07-20',
    title: 'Match alternatives pick-list',
    summary:
      'After Match rate, eligible runner-up hotel/transfer/activity charts appear as Other eligible rates. Use re-resolves that chart onto the same line (preferredRateId). Rejected diagnostics stay read-only — not a pick-list.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fit-dogfood-timing-ux',
    date: '2026-07-20',
    title: 'FIT dogfood timing cues (real-only)',
    summary:
      'Dashboard Median FIT build uses real samples only (demo seed excluded). Quotations tab shows gate progress (n/20 · remaining · About). Settings → About highlights remaining sends and demo-excluded count. Public “under 3 minutes” stays Testing — no invented samples.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fit-revision-margin-delta',
    date: '2026-07-20',
    title: 'Revision margin delta',
    summary:
      'Editable drafts with cost view compare Cost / Sell / Margin to the prior same-quotation version (or trip accepted). Signed deltas update live as you rematch or edit lines. Incomplete pricing is flagged; no parent-version FK.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fit-revise-moves',
    date: '2026-07-20',
    title: 'One-click FIT revise moves',
    summary:
      'Locked quotes show Revise / Edit travel dates. After revise, clone, or date rewrite, a dismissible strip offers date shift, rematch all/drifted, fix unmatched, swap hotel (open Match), and apply inquiry party then rematch. Match drawer also lists eligible runner-up charts (Use).',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fit-quote-progress-rail',
    date: '2026-07-20',
    title: 'Guided FIT quote progress rail',
    summary:
      'Quotations tab shows Package → Lines matched → Margin OK → Ready to send. Click the current step to open template, Match, margin override, or Send readiness. Quiet when fully ready. Progress cues are not the public FIT ≤3m claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-child-age-nationality',
    date: '2026-07-20',
    title: 'Hotel child age × nationality columns',
    summary:
      'Rate chart contracts child with/without-bed by age band and market (IN/INTL). Match picks the column from traveller ages; CSV childAgeBand1/2 columns import. Flat child rates remain fallback.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-quad-plus-bands',
    date: '2026-07-20',
    title: 'Hotel adult bands through 6A (QUAD+)',
    summary:
      'Adult bands accept 1–6 adults/room (CSV qadUnitCost). Meal matrix includes QAD. Match picks the highest band ≤ adults/room; extras only beyond that band.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-child-matrix-ui',
    date: '2026-07-20',
    title: 'Hotel child matrix contracting UI',
    summary:
      'Supplier Rate chart shows an editable child age × nationality matrix (add columns). Tip Diff/restore already covers occupancy JSON including the matrix.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-parity-dogfood-kit',
    date: '2026-07-20',
    title: 'FIT dogfood + pilot smoke kit',
    summary:
      'Settings → About claim gates lists FIT capture steps and pilot smoke (write-off, transfer bands, sibling sort, movement). Public /docs mirrors the ops kit. Demo seed still never counts toward public FIT proof.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-seat-matrix',
    date: '2026-07-20',
    title: 'Transfer seat matrices',
    summary:
      'Per-vehicle fares can carry a seat matrix (CSV seatMatrix4/6/7/12). Match prefers the closest seats ≥ party over party bands, with optional child/infant add-ons per tier.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-multi-vehicle-split',
    date: '2026-07-20',
    title: 'Transfer multi-vehicle party split',
    summary:
      'When party exceeds seats and Match raises vehicles, buy is the sum of per-vehicle party allocations (remainder on the last cab). Match explain stamps the split.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-rooming-allocation-voucher',
    date: '2026-07-20',
    title: 'Rooming allocation on travellers + hotel voucher lists',
    summary:
      'Assign Room 1/2… on the trip Travellers tab (TripTraveller.roomAllocation). Hotel vouchers list named guests under each room when set; otherwise the flat traveller list. Materialize stamps the allocation snapshot onto the booking.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-sibling-sort',
    date: '2026-07-20',
    title: 'Package sibling sort',
    summary:
      'Packages under a folder keep a saved order (Up/Down in the New-trip and Use-template trees). Order lives in org settings — no schema migration.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-write-off-awaiting-inbox',
    date: '2026-07-20',
    title: 'Write-off awaiting inbox',
    summary:
      'Receivables and Overdue show write-offs waiting approval. Open Finance deep-links to the instalment; trip Finance highlights the row. Cue when the pending amount exceeds current outstanding.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-dense-bands-child-addon',
    date: '2026-07-20',
    title: 'Transfer dense bands + per-vehicle child add-on',
    summary:
      'Party bands expand to six tiers (CSV partyBand2–12). On per-vehicle Match, an explicit chart Child/Infant cost adds on top of the cab or band — blank still means cab-only.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-write-off-workflow',
    date: '2026-07-20',
    title: 'Receivable write-off request → approve',
    summary:
      'Customer instalments support dual-control write-off: Request (amount + reason) then Approve. Outstanding and aging subtract approved write-offs; requester cannot self-approve.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fx-cron-disable-portfolio-rollup',
    date: '2026-07-20',
    title: 'FX cron disable + portfolio org-rate rollup',
    summary:
      'Settings can turn off weekly FX auto-refresh per org (manual refresh and Lock FX still run). Portfolio totals convert foreign trips at org FX rates; missing rates stay excluded.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-csv-party-bands',
    date: '2026-07-20',
    title: 'Transfer CSV party-size bands',
    summary:
      'Transfer import accepts partyBand2/4/6UnitCost columns into pricingJson party bands. Template demos a per-vehicle Sedan with 2/4/6 tiers; chart-only rows stay unchanged.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fx-lock-live-fetch',
    date: '2026-07-20',
    title: 'Lock FX refreshes market rates',
    summary:
      'Lock FX pulls Frankfurter into org rates first, then locks. If the market call fails, saved org rates are used — never invented. Toast notes refresh vs stale.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fx-auto-cron',
    date: '2026-07-20',
    title: 'Weekly FX auto-refresh',
    summary:
      'Worker refreshes org FX rates from Frankfurter when the last fetch is missing or older than seven days. AED stays skipped with prior values kept; failures leave rates unchanged.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-refund-request-approve',
    date: '2026-07-20',
    title: 'Refund request → approve → settle',
    summary:
      'Cancellation refunds need Request (reason) then Approve before Mark refund settled or Razorpay. Stamps live on the cancellation case; settle stays blocked until approved.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-template-row-dnd',
    date: '2026-07-20',
    title: 'Package template-row drag into folders',
    summary:
      'Packages appear under folders in the library tree. Drag a package onto a folder or All folders to move in place (no new version). Non-empty folders offer Delete… to soft-delete packages under that path.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-package-folder-dnd',
    date: '2026-07-20',
    title: 'Package folder drag-drop tree',
    summary:
      'Expandable folder tree on new-trip and Use-template pickers. Drag a folder onto another folder or All folders to move via rename-folder; Rename/Remove stay on the selected node.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-auto-extend-min-stay',
    date: '2026-07-20',
    title: 'Auto-extend check-out to meet min stay',
    summary:
      'Match extends hotel check-out when stay is shorter than rate min stay, reprices the stay, and toasts the bump — never silent. Max stay still requires shorten or manager ack.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-transfer-party-bands',
    date: '2026-07-20',
    title: 'Transfer party-size rate bands',
    summary:
      'Per-vehicle transfer fares can carry up to three party-size bands. Match picks the highest band that fits adults+children and stamps the band on provenance.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-meta-template-sync',
    date: '2026-07-20',
    title: 'Sync WhatsApp templates from Meta',
    summary:
      'Integrations → WhatsApp: set WhatsApp Business Account ID and Sync from Meta to pull message_templates into the local library (APPROVED stay active). Quote proposal picker reuses the synced list.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-razorpay-outbound-refund',
    date: '2026-07-20',
    title: 'Razorpay outbound refund on cancellations',
    summary:
      'Changes & incidents can Refund via Razorpay when the trip has a paid pay_… reference (or Mark refund settled for bank/NEFT). Optional partial amounts; mock refunds stay local-only.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-max-stay',
    date: '2026-07-20',
    title: 'Hotel max stay on rate card and quote',
    summary:
      'Rate chart Max stay (1–30 nights) stamps Match when stay is longer. Send and approve stay blocked until nights are shortened or a manager with inventory_risk.approve acknowledges with a reason. No auto-extend of check-out.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-companion-type-edit',
    date: '2026-07-20',
    title: 'Edit traveller adult/child/infant type',
    summary:
      'Trip Edit traveller sheet can change companion type (adult, child, infant) alongside name, nationality, and lead — same PATCH as Add traveller.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-party-markup-stamp-on-send',
    date: '2026-07-20',
    title: 'Party markup frozen on quote lines at send',
    summary:
      'Sending a quote (email, WhatsApp, or mark-sent) freezes the resolved client markup % and source onto each line’s details for audit. Service detail shows Frozen at send; sell amounts are not rewritten.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-per-line-markup-presets',
    date: '2026-07-20',
    title: 'Markup presets on individual quote lines',
    summary:
      'Quote service detail can apply org markup library presets to a single hotel, transfer, activity, or custom line. Stamps markupPresetId/label on the line details; toolbar bulk Apply still covers missing-sell lines.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-non-net-payment-terms',
    date: '2026-07-20',
    title: 'Non-Net payment terms auto due dates',
    summary:
      'Party terms like COD, Due in N days, Before travel, and On arrival now auto-stamp receivable due dates (Finance prefill + createPayment). Travel-relative terms use the trip start date; unrecognized free text still stays manual.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-instalment-schedule-from-terms',
    date: '2026-07-20',
    title: 'Schedule customer instalments from terms',
    summary:
      'Finance Schedule from terms builds Advance/Balance (or story/quote %) receivables from accepted-quote sell and party Net terms. Preview then create — never auto on accept. Blocks when instalments already exist or credit limit would be exceeded.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-party-markup-override',
    date: '2026-07-20',
    title: 'Per-party markup override',
    summary:
      'Customer hub can set a markup % that overrides org default and agent markup on Match rates and Apply default. Stored in party metadataJson; clear the field to fall back to org settings.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-credit-limit-gates',
    date: '2026-07-20',
    title: 'Customer credit limit enforcement',
    summary:
      'Org-wide customer receivable exposure is checked against party credit limits. Finance blocks new receivables over limit unless finance.credit_limit.override; trip control and customer hub show exposure cues.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-markup-preset-library',
    date: '2026-07-20',
    title: 'Org markup preset library on quotes',
    summary:
      'Settings stores up to 12 named markup presets (percent or fixed ₹). Trip quote toolbar shows preset chips beside Apply default markup for bulk sell pricing.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-credit-terms-automation',
    date: '2026-07-20',
    title: 'Customer credit terms on receivables',
    summary:
      'Party Net N / Pay on confirm terms auto-stamp customer receivable due dates (API + Finance prefill). Customer hub edits payment terms and credit limit.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-cancellation-refund-settle',
    date: '2026-07-20',
    title: 'Outbound refund settlement on cancellation cases',
    summary:
      'Applied cancellation credit notes can be cash-settled from Changes & incidents via POST /commerce/cancellations/:id/settle-refund. Idempotent outbound PaymentRecord links to the credit note; refund due shows until settled.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-hotel-occupancy-restore',
    date: '2026-07-20',
    title: 'Hotel rate occupancy field restore',
    summary:
      'History Diff Restore now copies occupancyPricingJson (bands, extras, nationality, gala) from a prior tip onto a new version — same dual-control Activate path as unit cost and meal plan.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-cancellation-credit-note-allocate',
    date: '2026-07-20',
    title: 'Cancellation credit notes auto-allocate to receivables',
    summary:
      'When a CancellationCase apply drafts a refund credit note, it now links to the trip receivable with the largest outstanding balance (capped to outstanding). Ops and Changes & incidents show allocated vs draft-only; Mark refund settled records outbound cash against the credit note.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-supplier-directory-list-depth',
    date: '2026-07-20',
    title: 'Supplier directory list depth',
    summary:
      'Suppliers list includes room-product count for stay properties, type-scoped active rate counts, and active contract counts from GET /suppliers. Profile, Rates, and Contracts columns match detail-page completeness cues.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-rates-import-row-replay',
    date: '2026-07-20',
    title: 'Rate import skip-row replay',
    summary:
      'Partial CSV/XLSX commits store skipped source lines in import audit metadata. Recent imports show Replay skips to reload fixable rows into the import sheet via GET /rates/import-batches/:id/replay.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-claim-readiness-ops',
    date: '2026-07-20',
    title: 'Marketing claim gates on Settings About',
    summary:
      'GET /dashboard/claim-gates shows live FIT sample progress and ops checklist in Settings → About. Platform scale protocol adds opsChecklist — registry stays Testing until manual sign-off.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-customers-b2b-parties',
    date: '2026-07-20',
    title: 'Customers and B2B party directory depth',
    summary:
      'Party list supports server-side B2B filter with open-request and active-trip counts. CSV import is fail-closed when every row skips. Customer hub shows agent-markup cue and editable B2B type for trade clients.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-blackout-stop-sale-cancellation',
    date: '2026-07-20',
    title: 'Contract blackout, stop-sale, and cancellation gates',
    summary:
      'Hard stop-sale blocks quote send/approve even when buy/sell are set manually (API + UI). Activity resolve now has parity specs for contract stop-sale and soft blackout. Cancellation tiers and CancellationCase remain on the separate ops ladder.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-inbox-channel-readiness',
    date: '2026-07-20',
    title: 'Inbox multi-channel connector readiness',
    summary:
      'GET /interactions/connectors/readiness drives WhatsApp, Instagram, and Google Business setup banners and reply gates. Aging unread filter now applies to All messages as well as Conversations.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-travel-request-queues',
    date: '2026-07-20',
    title: 'Travel request planning queues',
    summary:
      'Planning, My requests, and Sales inquiry lists use server-side queue filters. Queue summary strip shows incomplete and unassigned counts; Clients list shows open planning requests per party.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-supplier-import-directory',
    date: '2026-07-20',
    title: 'Supplier import guardrails and directory completeness',
    summary:
      'Rate CSV/XLSX commit is fail-closed when every row skips (API + UI). Partial imports toast the first skip reason; Recent imports show up to five sample skips. Suppliers list shows Contact and Profile completeness.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-crm-sla-surfaces',
    date: '2026-07-20',
    title: 'CRM SLA strip on Leads and Inbox',
    summary:
      'Overdue follow-ups, unread threads, and aging unread use the same /dashboard/sales metrics on Leads and Inbox as the home dashboard. Inbox aging filter respects org inboxAgingHours — no hard-coded 4h chip.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-trip-shell-dashboard',
    date: '2026-07-20',
    title: 'Trip tabs and home dashboard compose by role',
    summary:
      'Trip workspace tabs show control attention badges and a status-based Next cue. Home dashboard shows your top four role widgets first, with optional extra metrics behind disclosure.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-trip-control-cancellations',
    date: '2026-07-20',
    title: 'Trip control surfaces activity + cancellation risks',
    summary:
      'Overview and the compact risk strip now flag open activities, pending cancellation cases, and refresh after ops/finance changes. Refund credit notes on cancel apply auto-allocate to trip receivables when outstanding exists.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-ta-materialize-warnings',
    date: '2026-07-20',
    title: 'Transfer & activity bookings warn like hotels',
    summary:
      'Accept and From accepted quote now warn when transfer/activity lines lack a supplier or the supplier was deleted, stamp quote currency, and fold those cues into materializeFailures — same honesty path as hotel.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-scale-protocol',
    date: '2026-07-20',
    title: 'Measured public scale protocol',
    summary:
      'Platform GET /platform/scale computes agency/trip/quote minima. Public /docs shows numbers only from a stamped snapshot when publicScaleAllowed — never invented vanity counts.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fleet-unit-board',
    date: '2026-07-20',
    title: 'Partner fleet unit board (read-only)',
    summary:
      'Partner inventory shows per-plate busy lanes (calendar, holds, driver jobs, rentals) for the next week. Utilization OS and org-wide boards stay deferred.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-gstr-export-thin',
    date: '2026-07-20',
    title: 'GSTR-ready commercial export + live IRN adapter',
    summary:
      'Commerce CSV export and structured taxBreakdownJson on documents for accountants. NIC GSP provider fails closed without credentials. Still not in-app GSTR filing or automated tax books.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-public-buyer-docs',
    date: '2026-07-20',
    title: 'Public docs for how quoting works',
    summary:
      'Login-free /docs explains the agency quote path and what we will not claim (FIT Testing until real samples, tax display ≠ filing, no invented scale). Linked from About and the public changelog.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-fit-claim-excludes-demo',
    date: '2026-07-20',
    title: 'FIT claim gate ignores demo seed timings',
    summary:
      'Public “under 3 minutes” only counts real quote.fit_build samples. Demo-travel seed can show as local-only ready on the sales strip; it never flips the marketing claim.',
    claimStatus: 'proven',
  },
  {
    id: '2026-07-20-pos-hotel-buy-match',
    date: '2026-07-20',
    title: 'Hotel buy tips can follow destination place of supply',
    summary:
      'Tag a hotel rate tip with a place of supply (e.g. KA). Match prefers that tip when the trip destination POS matches, otherwise any blank tip. Chart shows a POS chip. This is Match-only — it does not create an e-invoice or change tax filing.',
    claimStatus: 'proven',
  },
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
