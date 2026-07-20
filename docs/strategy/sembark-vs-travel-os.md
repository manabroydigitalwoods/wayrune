# Sembark vs Travel OS — Strategy Memo

**Status:** Canonical competitive strategy + 90-day agency-depth backlog  
**Product:** Wayrune (Travel OS)  
**Related:** [Product Bible](../00_PRODUCT_BIBLE.md) · [Product Blueprint](../01_PRODUCT_BLUEPRINT.md) · [Travel OS Index](../travel-os/README.md)

This memo revises the Sembark competitive analysis against the current codebase. Use it for roadmap sequencing and external positioning — not as a greenfield feature wishlist.

---

## Executive verdict

**Sembark remains deeper on market proof and full commercial polish; Travel OS is now competitive on the agency wedge and still broader as a platform.**

Sembark concentrates on a commercially valuable agency journey:

> Lead → quotation → booking → supplier coordination → payment → tour operations

Our long-term advantage:

> Agency ERP → communication platform → digital presence → partner operating systems → connected travel network

**Strategic rule:** First become indispensable to one travel agency’s daily workflow. Then connect the travel ecosystem.

**2026-07 re-score (after P0 thin ladders + package folders + live FX refresh):** the Priority 0 agency journey is largely **thin-complete** end-to-end (quote → hotel/transfer/activity ops → collect/chase → movement → packages → Settings FX). Remaining Sembark leads are **depth** (full occupancy×meal grids, ledger/tax regimes, consultant onboarding, public credibility) — not missing journey stages. Customers still buy relief from today’s problems; do not lead with multi-org or Presence until wedge depth and measured FIT speed are undeniable.

---

## 1. Revised comparison (codebase-backed)

Maturity labels: **early** | **partial** | **mature** | **structural** (architecture ahead of productized UX).

| Area | Sembark | Our Travel OS (today) | Current advantage |
|------|---------|----------------------|-------------------|
| Lead and enquiry intake | Lead APIs, round-robin, follow-ups | Parties, leads, inquiries, pipelines, custom fields, travel-request intake; **sales response strip**; **org sales SLA targets**; **task↔followUpAt**; **inbox unread + aging**; **unread_sla automation**; **round-robin polish** | **Near parity** (objects + SLA cues) |
| Communication | WhatsApp notifications, calling add-on, email parsing | Unified inbox (WhatsApp / email / Instagram / website / Google Business), AI rewrite/summarize; Microsoft = SSO only; quote WA share = Cloud template/session + `wa.me` Mark-as-sent; **Quote proposal template picker** | **Stronger foundation; uneven channel depth** — no Microsoft messaging claim; **HubSpot out of scope** |
| Itinerary creation | Productised ~60s workflow with costing | Flexible itinerary builder + public proposal; **package apply + rematch + Story seed**; FIT build minutes instrumented (do not claim 60s publicly) | **Sembark for polished speed**; we are closing via packages + telemetry |
| Quotation pricing | Multi-currency, tax, component markup, reusable supplier data | Versioned quotes; hotel/transfer/activity resolve; cost/sell/tax/margin; **fixed + % + agent markup**; **org default tax**; branded PDF/email/WA; public accept; **Quote FX lock** + **Settings live FX refresh (Frankfurter)** | **Near parity on INR FIT path**; **Sembark** on tax regimes / cross-pair / auto FX |
| Supplier contracts | Mature rates, seasons, stop/blackout, bulk upload, occupancy grids | **Supplier Directory + Profile V1**; hotel/transfer/activity charts; seasons/weekend/gala/occupancy extras; **SGL/DBL/TPL adultBands** + **copy-as-meal** + **meal×occupancy matrix (Wk/We)** + **weekend-per-band** + **min stay (hard gate)** + **IN/INTL + per-ISO + full ISO-3166 + multi-guest mixed nationality** + **hotel/transfer/activity rate version chains** + **hotel/transfer/activity tip diffs**; **hotel/transfer/activity tip dual-control Activate (`rates.approve`)**; blackout vs stop-sale; CSV/XLSX + import audit; hard allotment + capacity gates; cancel policy stamp | **Near parity** on daily contracting thin path; multi-step quorum still open |
| Booking operations | Reservations, assignment, vouchers, movement charts | Booking components + readiness; hotel/transfer/activity enquiry→confirm→payable→voucher; **movement board + calendar**; driver/fleet assign + DriverJob sync; **allotment release+reallocate**; type-aware partner Confirm | **Near parity on agency ops thin slice**; partner fleet OS depth still open |
| Payments and accounting | Receivables, payables, instalments, payment links, ledgers | Per-trip AR/AP + margin; payment links + Razorpay; org aging/portfolio; **chase + AP Mark paid/Unmark**; report packs + scheduled CSV email; **FX honesty cues** | **Sembark** on full ledger; **near parity** on collect/chase thin path |
| Multi-brand / multi-org | Multiple brands under one login | Org kinds (agency, hotel, DMC, driver, …), multi-membership, org switcher; partner OS / Travel Exchange unfinished | **Structural advantage; productized partner network still early** |
| Digital presence | No equivalent found | Hosted sites, themes, modules, platform hosts, forms→CRM; custom-domain TLS/verify deferred | **Ours** if framed as embedded travel site + CRM — not finished hosting ops |
| Partner ecosystem | Primarily one company’s internal ops | Planned connected partner OSes and network; inbound confirm + docs thin | **Long-term ours** — not a current sales wedge |
| Integrations | Lead APIs, email parsing, flights, calling, WhatsApp | Broader connector contract; channel depth uneven | **Foundation ours; depth mixed** |
| Onboarding | Mandatory consultant-led setup + extensive guides | Register, org seed, claim invite; **checklist + first-quote walkthrough + sample FIT pack** (quote/trips empty CTAs) | **Sembark** on consultant depth; **we closed self-serve thin wedge** |
| Reporting | Extensive ops reports + saved presets | Role dashboards; finance CSV + personal presets + **org-shared packs + weekly email**; sales/ops strips | **Sembark** on breadth of ops reports; finance packs thin-complete |
| Market credibility | Public release notes, docs, claimed scale | Early-stage; **claim registry + in-app About + public `/changelog` + named demo trip**; no public scale claim | **Near parity** on buyer-safe notes; **Sembark** on docs/scale |

### Where we are already better (qualified)

- **True multi-organization platform** — architecture differentiates; do not sell as a finished partner network.
- **Omnichannel CRM foundation** — fair for agency inbox; qualify Microsoft messaging depth. **HubSpot discarded** (not on roadmap).
- **Digital Presence** — strongest current differentiator among the four; secondary in sales narrative after quote/ops outcomes.

### Where the gap flipped or narrowed (Jul 2026)

| Gap that used to be “Sembark” | Now |
|-------------------------------|-----|
| FX stub / no live rates | **Quote lock + Settings Frankfurter refresh** — still no auto-cron / AED feed / cross-pair |
| Package library depth | **Versioning + history/diff (side-by-side) + tags + slash-path folder nav** — still no server folder index |
| Onboarding “no product” | **Checklist + FIT pack + empty-state Install** — still no consultant implementation centre |
| Movement / vouchers “missing” | **Board + vouchers + DriverJob sync thin-complete** |
| Collect & chase | **Payment links + aging chase + AP settle thin-complete** |

### Honest remaining Sembark leads (do not paper over)

1. **Tax / ledger depth** — full accounting ledger / e-invoice (CGST/SGST/IGST **display** thin-complete including Finance + public pay-page + receivable CD; compliance **do not claim**)
2. **Quote speed productisation** — measured sub-3-minute FIT median + public claim gated by `fitClaimProtocol` (demo-travel seed can clear n≥20 locally; production waits on real samples)  
3. **Market credibility** — *(About + public `/changelog` thin-complete)* · docs / scale proof still open
4. **Partner fleet OS** — *(booking-linked holds + allocate UI thin-complete)* · full unit board / utilization still deal-gated
5. **Rate-grid leftovers** — *(per-pax depth through rooming / multiplicity / 3A×N thin-complete)* · uneven 6A/4R board + named pax slots deferred

---

## 2. Ninety-day Priority 0 sequence

Do **not** ship the full costing/contracting wishlists as one epic. Three releases, then movement board.

### Release 1 — Quote speed path (days 1–30)

**Target:** Trained sales exec creates a normal INR FIT quotation in **under three minutes**. Public “60 seconds” only after median FIT build minutes is measured (now instrumented — do not claim publicly until sample is healthy).

#### Prod-ready ladder — Quote FIT → send → accept (current program)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Accept rejects expired quotes; re-checks readiness; public accept requires family PIN when set; accept binds to share `quotationVersionId`; accept CAS (`updateMany` status); margin floor for all senders (not only `quote.view_cost`); UI flushes dirty autosave before send / request-approval / mark-sent |
| **2 Channels** | **Done** | WA `wa.me` fallback requires explicit **Mark as sent**; Cloud cold-send uses Meta template (`Quote proposal` / `quoteProposalTemplateId`) else fail-closed; session text only inside 24h window; email `transition(send)` before outbox; `SendQuoteEmailSchema` validates `toEmail`; validity auto-extend only after other gates |
| **3 Ops honesty** | **Done** | Template apply clears stale buy/sell + rate snapshots (even without trip start); accept surfaces materialize failures (audit + owner notify); approve runs readiness; checklist “Create your first quote” needs ≥1 quotation |
| **4 Proof** | **Done** | Journey contract/guard specs; FIT build timing (`POST /quotations/fit-timing` + median on sales strip); this ladder in memo |

#### Prod-ready ladder — Hotel enquiry → confirm → payable → voucher (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Confirm requires confirmation ref + allowed status; payable create result returned (no silent “scheduled”); missing-supplier skips warned on accept; cancel closes payable commercial docs; partial unique index on payable↔booking |
| **2 Channels / UI** | **Done** | Enquiry WA mark-as-sent; voucher WA fallback uses warning + **Mark vouchers sent**; accept surfaces `materializeFailures`; pipeline highlights Payable when confirmed without invoice; quote currency on materialize |
| **3 Proof** | **Done** | Booking status + missing-supplier specs; memo ladder |

#### Prod-ready ladder — Movement + transfer assign (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Assign validates driver + fleet unit (org / linked asset); blocks driver/vehicle overlap unless `allowConflict`; DriverJob sync returns status (never silent catch); cancel-before-hard-delete sync; partial unique on `driver_jobs.booking_component_id`; board conflict scan includes assigned transfers outside window |
| **2 Channels / UI** | **Done** | Movement board + Ops edit warn on skipped/failed partner job sync; home movement stats stop perpetual Loading on API error; edit preserves `fleetUnitId` |
| **3 Proof** | **Done** | Transfer-assignment merge/conflict specs; this ladder in memo |

**Next journey after this ladder stays green:** Collect & chase.

#### Prod-ready ladder — Collect & chase (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Mock settle fail-closed outside local (`ALLOW_MOCK_PAYMENTS` / `APP_ENV=local`); Razorpay order bound to instalment (order id + paise); confirm rejects order/amount mismatch + duplicate `reference`; settle CAS via `updateMany`; cancel clears payment-link token; receivable CD amount sync on instalment edit |
| **2 Channels / UI** | **Done** | Reuse unexpired payment-link token (regenerate opt-in); wa.me chase uses warning + **Mark as sent**; public page hides Pay for cancelled; report-pack worker does not advance `lastSentAt` when SMTP skipped |
| **3 Proof** | **Done** | Checkout guard + aging multi-currency summary specs; toast mark-sent cue; this ladder in memo |

**Next after Collect & chase:** pick by ops urgency (fleet OS polish, FX, or package depth).

#### Prod-ready ladder — Fleet hold: Assign → Partner ledger → Duty writeback (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Agency assign upserts booking-linked `InventoryAllocation` + allocation calendar (not notes-only); clear/cancel releases hold; soft conflict surfaced (not quiet tag only); duty window prefers explicit clock; `syncBookingInventory` uses assignment `fleetUnitId` + returns status |
| **2 Channels / UI** | **Done** | Partner Holds show trip/booking cue; DriverOps **Agency duty** badge; Ops/Movement warn on soft conflict / celebrate hold sync |
| **3 Proof** | **Done** | Window clock-time spec; this ladder in memo |

**Next after Quote FX lock:** Portfolio FX honesty (done below) or package template versioning — pick by sales urgency.

#### Prod-ready ladder — Quote FX lock (INR base) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Kill fake `{ USD: 0.012 }` stub; structured `exchangeRatesJson` lock; create quote uses org currency; send/approve blocks when foreign quote lacks lock; `POST …/fx/lock` converts INR lines; Match-safe convert helper |
| **2 Channels / UI** | **Done** | Quote sidebar currency + Lock FX; send gate copy when FX missing; cost-compare excludes other-currency bookings; aging shows other-currency count |
| **3 Proof** | **Done** | `quote-fx` unit specs; this ladder in memo |

**Defer:** *(closed — see Live FX refresh below)* · cross-pair (non-INR chart) convert.

#### Prod-ready ladder — Portfolio FX honesty (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Portfolio summary totals use dominant currency only (no silent FX mix); `otherCurrencyCount` on summary |
| **2 Channels / UI** | **Done** | Portfolio page exclusion cue; home stats use portfolio currency + FX-excl. label when mixed |
| **3 Proof** | **Done** | Mixed INR+USD unit spec; this ladder in memo |

**Defer:** live provider rollup of all currencies into one total; cross-pair convert.

**Next after Portfolio FX honesty:** package template versioning (done below), live FX refresh (done below), or cross-pair convert.

#### Prod-ready ladder — Package template versioning (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `QuoteTemplate` version chain (`versionNumber` / `status` / `supersedesId`); same-name save supersedes prior active; content PATCH creates next version; apply rejects superseded ids |
| **2 Channels / UI** | **Done** | Save dialog version cue + keep-both (`asNew`); list shows `vN`; toast when previous retired |
| **3 Proof** | **Done** | `quote-template-version` unit specs; this ladder in memo |

**Defer:** *(closed — see Package template history + restore below)*

**Next after Package template versioning:** Guided FIT quote speed (travel-start gate — done below), onboarding Install-pack CTA (done below), live FX refresh (done below), or cross-pair convert.

#### Prod-ready ladder — Package template history + restore (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `GET …/quote-templates/:id/versions` chain walk; `POST …/restore` copies prior content into new active tip (supersedes current); apply was active-only until superseded-apply ladder |
| **2 Channels / UI** | **Done** | Use-template dialog **History** (v2+) + **Restore** prior → toast + refresh |
| **3 Proof** | **Done** | Chain/restore plan specs + web history cue specs; this ladder in memo |

**Defer:** *(closed — see Apply superseded template without restore below)*

#### Prod-ready ladder — Apply superseded template without restore (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `createFromTemplate` allows `active` \| `superseded` via `templateApplyBlockedReason` (no tip rewrite) |
| **2 Channels / UI** | **Done** | History prior rows: **Use** beside **Restore** + Use-vs-Restore cue |
| **3 Proof** | **Done** | Apply-gate + history helper specs; this ladder in memo |

**Defer:** *(closed — see Package template History Diff below)*

#### Prod-ready ladder — Package template History Diff (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `diffQuoteTemplateContent` (lines by type+title + meta); `listTemplateVersions` stamps `diffVsActive` vs active tip |
| **2 Channels / UI** | **Done** | History prior **Diff** expand (+ summary inline); titles/meta bullets |
| **3 Proof** | **Done** | Diff + History helper specs; this ladder in memo |

**Defer:** *(closed — see Package template tags below)*

#### Prod-ready ladder — Package template tags (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `contentJson.tags` on schema; `normalizeTemplateTags`; create/version paths preserve; FIT pack + seed stamp demo tags; Diff meta when tags change |
| **2 Channels / UI** | **Done** | Save-as-template Tags field; Use-template filter + clickable chips |
| **3 Proof** | **Done** | normalize + filter helper specs; this ladder in memo |

**Defer:** *(closed — see Package template folders below)*

#### Prod-ready ladder — Package template folders (label filter) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `contentJson.folder` on schema; `normalizeTemplateFolder`; create/version paths preserve; FIT pack + seed stamp; Diff meta when folder changes |
| **2 Channels / UI** | **Done** | Save-as-template Folder field; Use-template folder filter + chip (with tags) |
| **3 Proof** | **Done** | normalize + filter helper specs; this ladder in memo |

**Defer:** *(closed — see New-trip package picker folder/tag filter below)*

#### Prod-ready ladder — New-trip package picker folder/tag filter (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Shared `filterTemplatesByFolderAndTag` + clear selection when filtered out |
| **2 Channels / UI** | **Done** | New trip Package: folder/tag filters + richer option descriptions (folder · tags · lines) |
| **3 Proof** | **Done** | Picker-filter helper specs; this ladder in memo |

**Defer:** *(closed — see New-trip package picker chips below)*

#### Prod-ready ladder — New-trip package picker clickable chips (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `pickerMetaChips` + `collectUniquePickerMetaChips` (dedupe/cap) |
| **2 Channels / UI** | **Done** | New trip Package: folder/tag chips under Combobox (toggle filters; active state) |
| **3 Proof** | **Done** | Chip helper specs; this ladder in memo |

**Defer:** *(closed — see Package folder hierarchy/nav below)*

#### Prod-ready ladder — Package folder hierarchy/nav (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Slash-path `contentJson.folder` (normalize segments, max 80); prefix-match filter; FIT pack + seed `Hill stations/Darjeeling`, `Beach/Goa` |
| **2 Channels / UI** | **Done** | Save-as-template path hint; New-trip + Use-template breadcrumb + child chips; row segment chips |
| **3 Proof** | **Done** | Folder path/nav helper specs; this ladder in memo |

**Defer:** *(closed — see Package template History Diff side-by-side below)* · server-side tag/folder index; full tree CRUD / drag-drop.

#### Prod-ready ladder — Package template History Diff side-by-side (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `diffQuoteTemplateContent.rows` Field / This tip / Current (commercial + add/remove + meta); stamped on `listTemplateVersions` `diffVsActive` (cap 24) |
| **2 Channels / UI** | **Done** | Use-template History Diff expands side-by-side table (bullet fallback if no rows) |
| **3 Proof** | **Done** | Diff row + History helper specs; this ladder in memo |

**Defer:** server-side tag/folder index; full tree CRUD / drag-drop; itinerary day-level Diff; field-level restore.

#### Prod-ready ladder — Quote post-expiry grace (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `quoteValidityGraceHours` (0–72, default 24); in-grace send skips auto-extend; past grace / grace=0 keep extend; `validityGraceUsed` on send/approval responses |
| **2 Channels / UI** | **Done** | Settings grace hours; workspace expired-grace cue; toast suffix for grace vs extend |
| **3 Proof** | **Done** | Grace boundary + settings specs (API + web); this ladder in memo |

**Defer:** *(closed — see Block send past grace below)*

#### Prod-ready ladder — Block send past grace (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Expired outside grace → 400 on send/approval (no auto-extend); in-grace still keeps date |
| **2 Channels / UI** | **Done** | Send gate + checklist/readiness block copy; past-grace cue; Settings grace=0 = no grace |
| **3 Proof** | **Done** | Block/extend boundary specs; this ladder in memo |

**Defer:** *(closed — see Extend on send in grace below)*

#### Prod-ready ladder — Extend on send in grace (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `extendValidity` on send email/WhatsApp; in-grace + flag → refresh; omit/false → keep date; past grace still blocks |
| **2 Channels / UI** | **Done** | Send dialog checkbox when in grace; included on email + WhatsApp POST; resets on close |
| **3 Proof** | **Done** | `shouldExtendValidityOnSend` specs; this ladder in memo |

**Defer:** *(closed — see Near-expiry opt-in extend below)*

#### Prod-ready ladder — Near-expiry opt-in extend (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | No silent near-expiry auto-extend; `extendValidity` required for near-expiry and grace; omit/false keeps current date |
| **2 Channels / UI** | **Done** | Send dialog checkbox for near-expiry + grace; cues say check Extend on send |
| **3 Proof** | **Done** | `shouldExtendValidityOnSend` opt-in specs; web cue copy; this ladder in memo |

**Defer:** *(closed — see Extend on request-approval / mark-sent below)*

#### Prod-ready ladder — Extend on request-approval / mark-sent (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `RequestQuoteApprovalSchema` + `MarkQuoteSentSchema.extendValidity`; `transition` opts pass-through; mark-sent / request-approval / send transitions honor flag |
| **2 Channels / UI** | **Done** | Request-approval dialog with checkbox when near-expiry/grace; mark-sent POST includes flag; checkbox stays visible during wa.me Mark as sent |
| **3 Proof** | **Done** | Schema parse specs; this ladder in memo |

**Defer:** *(validity extend opt-in closed — larger leftovers: Meta sync; multi-band transfer)*

#### Prod-ready ladder — Guided FIT speed: template travel-start gate (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `ApplyQuoteTemplate.startDate`; resolve helper; stamp `trip.startDate` when missing/changed; shift uses resolved day; API rejects undated apply |
| **2 Channels / UI** | **Done** | Use-template dialog requires travel start DatePicker; Use disabled until set; walkthrough copy “Set travel start · Use template” |
| **3 Proof** | **Done** | `resolveTemplateApplyTravelStart` unit specs; this ladder in memo |

**Defer:** *(closed — see Onboarding Install pack CTAs below)* · occupancy grid.

#### Prod-ready ladder — Onboarding: quote empty-state Install pack (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Shared `installAgencyFitPack` + toast formatter (same `POST …/starter-packs/fit_templates_v1/install`) |
| **2 Channels / UI** | **Done** | Walkthrough + EmptyState + Use-template zero-list show Install; stays on current trip (no demo `walkthroughHref`); opens Use-template after install |
| **3 Proof** | **Done** | `agencyFitPack` toast unit specs; this ladder in memo |

**Defer:** *(closed — see Trips empty-state Install pack below)*

#### Prod-ready ladder — Trips empty-state Install pack (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Reuse install API; `tripsEmptyShowInstallPack` + `agencyFitPackWalkthroughPath` helpers |
| **2 Channels / UI** | **Done** | Trips list empty (planning) shows **Install sample FIT pack** when no templates; navigates to demo trip quotations after install |
| **3 Proof** | **Done** | Helper specs; this ladder in memo |

**Defer:** market credibility content; occupancy grid.

#### Prod-ready ladder — New trip travel dates (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `tripTravelEndOnOrAfterStart`; `CreateTripSchema` refine end ≥ start (dates stay optional) |
| **2 Channels / UI** | **Done** | New trip sheet Travel start / end DatePickers → POST; Use-template can prefill from trip start |
| **3 Proof** | **Done** | `tripTravelDates` + CreateTripSchema specs; this ladder in memo |

**Defer:** market credibility content.

#### Prod-ready ladder — Edit trip travel dates (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `UpdateTripDatesSchema` + `PATCH /trips/:id/dates`; end ≥ start; audit `trip.dates_update`; no line rematch |
| **2 Channels / UI** | **Done** | Workspace header + Overview **Travel dates** → Edit sheet (same DatePickers); soft toast when quote lines exist |
| **3 Proof** | **Done** | `UpdateTripDatesSchema` specs; this ladder in memo |

**Defer:** market credibility content.

#### Prod-ready ladder — Date-shift on edit travel start (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `shiftQuoteDates` on `UpdateTripDatesSchema` (default on); draft/pending_approval lines shift via `shiftQuoteItemsToTripStart` + rate clear; story reanchor; opt-out supported |
| **2 Channels / UI** | **Done** | Travel dates sheet checkbox; toast shift summary; autosave draft cleared; auto rematch after shift |
| **3 Proof** | **Done** | `trip-date-shift` + UpdateTripDatesSchema specs; this ladder in memo |

**Defer:** *(closed — see Sent/accepted version rewrite below)*

#### Prod-ready ladder — One-shot create-trip+package (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `planCreateTripFromPackage` — package requires travel start; create → apply compose |
| **2 Channels / UI** | **Done** | New trip sheet optional Package Combobox + Install pack; Create & apply → Quotations tab; walkthrough copy |
| **3 Proof** | **Done** | `createTripFromPackage` specs; this ladder in memo |

**Defer:** *(closed — see Transactional create-trip+package below)*

#### Prod-ready ladder — Pax in apply dialog (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `ApplyQuoteTemplateSchema` adults/children; `stampApplyPaxOntoQuoteItems` on hotel/transfer/activity before rematch; audit stamps |
| **2 Channels / UI** | **Done** | Use-template Adults/Children (default 2/0); New trip package path same; toast shows `NA+MC on lines` |
| **3 Proof** | **Done** | Stamp helper + createTripFromPackage specs; this ladder in memo |

**Defer:** *(closed — see Transactional create-trip+package below)*

#### Prod-ready ladder — Child ages on apply (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `ApplyQuoteTemplateSchema` childAges + childrenWithoutBed; `normalizeApplyChildAges` pads to children (default 8); stamp onto hotel/transfer/activity before rematch |
| **2 Channels / UI** | **Done** | Use-template + New trip package: Child ages + Children without bed when children &gt; 0; toast shows ages |
| **3 Proof** | **Done** | Stamp + createTripFromPackage specs; this ladder in memo |

**Defer:** *(closed — see Per-line age overrides below)*

#### Prod-ready ladder — Hotel occupancy child-age bands (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `classifyHotelOccupancyPax` — ages above `childAgeMax` count as adults before extras; Match explain + provenance stamps |
| **2 Channels / UI** | **Done** | Rate chart Child age max; hotel drawer Ages · cue + child-ages copy; attention Ages chip (shared with activity) |
| **3 Proof** | **Done** | Occupancy classify + priced reclassify specs; this ladder in memo |

**Defer:** *(closed — see Hotel SGL/DBL/TPL adult bands below)*

#### Prod-ready ladder — Hotel SGL/DBL/TPL adult bands (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `adultBands` on `occupancyPricingJson` (≤3); Match picks band by adults/room; weekend scales with chart ratio; extras beyond band adults; Heritage seed SGL&lt;DBL&lt;TPL |
| **2 Channels / UI** | **Done** | Rate chart Single/Double/Triple cost rows; Match Occupancy cue shows `NA band · ₹…/n` |
| **3 Proof** | **Done** | Band parse/pick + cue specs; this ladder in memo |

**Defer:** *(closed — see Copy rate as other meal plan below)*

#### Prod-ready ladder — Copy rate as other meal plan (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `cloneHotelRateFormForMealPlan` keeps season window + bands/extras; nudges costs by EP/CP/MAP/AP index; Heritage spring Deluxe **CP** sister seeded |
| **2 Channels / UI** | **Done** | Rate chart **Copy as other meal plan** (utensils) beside Duplicate season |
| **3 Proof** | **Done** | Clone/scale helper specs; this ladder in memo |

**Defer:** *(closed — see Compact meal × occupancy matrix below)*

#### Prod-ready ladder — Compact meal × occupancy matrix (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Season-family key + `buildMealOccupancyMatrix` / `diffMealOccupancyMatrix`; upserts sibling meal rows with `adultBands` (preserve extras/gala); weekend scales from anchor ratio on create |
| **2 Channels / UI** | **Done** | Rate chart **Meal × occupancy matrix** (grid) — EP/CP/MAP/AP × SGL/DBL/TPL sheet; Save creates/patches meal rows for one season window |
| **3 Proof** | **Done** | Matrix helper specs; this ladder in memo |

**Defer:** CSV matrix columns; matrix delete of cleared meals; *(matrix weekend cells — see ladder below)*.

#### Prod-ready ladder — Weekend-per-band hotel costs (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `adultBands[].weekendUnitCostPerNight` optional; Match prefers absolute band weekend over chart ratio; provenance stamps `adultBandWeekendUnitCost`; Heritage seasons seeded with band weekends |
| **2 Channels / UI** | **Done** | Rate chart SGL/DBL/TPL weekday + weekend fields; copy-as-meal scales band weekends; matrix save preserves/stamps band weekends |
| **3 Proof** | **Done** | parse/pick + clone/matrix merge specs; this ladder in memo |

**Defer:** *(closed — see Matrix weekend columns + CSV band weekend below)* · CSV band weekend columns.

#### Prod-ready ladder — Matrix weekend columns (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Matrix cells carry `weekendUnitCost`; build/diff load + emit `weekendUnitCostPerNight`; blank weekend preserves prior / ratio-stamp |
| **2 Channels / UI** | **Done** | Meal × occupancy matrix Wk / We fields per SGL/DBL/TPL |
| **3 Proof** | **Done** | Matrix weekend helper specs; this ladder in memo |

**Defer:** *(closed — see CSV band weekend columns below)* · matrix delete of cleared meals.

#### Prod-ready ladder — CSV band weekend columns (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Optional `sgl`/`dbl`/`tpl` + `*Weekend` CSV cols → `adultBands[].weekendUnitCostPerNight`; chart-only rows unchanged |
| **2 Channels / UI** | **Done** | Hotel import template includes band weekday/weekend headers + demo row |
| **3 Proof** | **Done** | occupancy-pricing band-from-CSV specs; claim registry; About note; this ladder in memo |

**Defer:** matrix delete of cleared meals; CSV matrix meal columns.

#### Prod-ready ladder — Hotel min stay on rate card (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `minStayNights` on `occupancyPricingJson`; Match stamps `minStayShort` / note on calculation when nights &lt; min; Match explain accepted line; Heritage spring min 2n |
| **2 Channels / UI** | **Done** | Rate chart **Min stay** field; drawer Min stay cue; attention **Min stay** chip |
| **3 Proof** | **Done** | hotel-min-stay + cue specs; this ladder in memo |

**Follow-on:** hard send gate — see ladder below.

#### Prod-ready ladder — Hard min-stay at quote (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Match stamps `minStayWarn` / `minStayNote`; `assertNoBlockingMinStay` on send/approve; `inventory_risk.approve` ack fingerprints note + reason; autosave cannot forge acks |
| **2 Channels / UI** | **Done** | Drawer Send anyway ack (same permission as allotment/capacity); attention chip clears when acked; client send preflight copy; Rate chart field copy updated |
| **3 Proof** | **Done** | `lineNeedsMinStayRiskAck` + provenance/preserve specs; this ladder in memo |

**Defer:** max stay; auto-extend nights on Match.

#### Prod-ready ladder — Hotel rate version chain (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `versionNumber` + `supersedesId` on `SupplierHotelRate`; `POST …/new-version` deactivates tip + creates vN+1; History + restore-as-new-tip; contract clone `copyRates` now copies `occupancyPricingJson` + links `supersedesId`; Match stamps rate version in explain |
| **2 Channels / UI** | **Done** | Rate chart **vN** badge, **New version** (branch) + **History**; restore opens edit on new tip |
| **3 Proof** | **Done** | hotel-rate-version + web label specs; this ladder in memo |

**Defer:** *(closed — see Multi-approver hotel rate inbox)* · multi-approver rate inbox.

#### Prod-ready ladder — Transfer + activity rate version chains (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `versionNumber` + `supersedesId` on `TransferFare` + `SupplierActivityRate`; `POST …/new-version`, `GET …/versions`, `POST …/restore-version` (mirror hotel); Match stamps `rateVersionNumber` |
| **2 Channels / UI** | **Done** | Transfer + activity Rate chart **vN** badge, **New version** + **History** restore |
| **3 Proof** | **Done** | Shared `rate-version-chain` specs; this ladder in memo |

**Defer:** side-by-side rich Diff sheet (hotel tip diff shipped below; transfer/activity tip diff also shipped).

#### Prod-ready ladder — Hotel rate tip diff (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `diffHotelRateTips` on History list (`diffVsActive` vs active tip — cost/meal/dates/occupancy) |
| **2 Channels / UI** | **Done** | Hotel History sheet shows **Diff vs current** cue on superseded tips |
| **3 Proof** | **Done** | hotel-rate-diff + web cue specs; this ladder in memo |

**Defer:** *(closed — see Hotel tip Diff side-by-side below)* · *(multi-approver closed — see Multi-approver hotel rate inbox)*.

#### Prod-ready ladder — Hotel tip Diff side-by-side (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Reuse versions payload + `diffVsActive.changes` (no new endpoint); tip fields already on History list |
| **2 Channels / UI** | **Done** | Hotel History **Diff** expand — Field / This tip / Current table for changed commercial rows |
| **3 Proof** | **Done** | `buildHotelRateTipDiffRows` specs; claim registry; About release note; this ladder in memo |

**Defer:** *(multi-approver closed — see Multi-approver hotel rate inbox)* · field-level restore (transfer/activity side-by-side closed below).

#### Prod-ready ladder — Transfer + activity tip diff (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `diffTransferFareTips` / `diffActivityRateTips` on History list (`diffVsActive` vs active tip) |
| **2 Channels / UI** | **Done** | Transfer + activity History sheets show **Diff vs current** cue on superseded tips |
| **3 Proof** | **Done** | transfer-activity-rate-diff + web cue specs; this ladder in memo |

**Defer:** *(closed — see Transfer/activity tip Diff side-by-side below)* · *(multi-approver closed — see Multi-approver hotel rate inbox)* · field-level restore.

#### Prod-ready ladder — Transfer + activity tip Diff side-by-side (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Reuse versions payload + `diffVsActive.changes` (no new endpoint) |
| **2 Channels / UI** | **Done** | Transfer + activity History **Diff** expand — Field / This tip / Current (mirror hotel) |
| **3 Proof** | **Done** | `buildTransferFareTipDiffRows` / `buildActivityRateTipDiffRows` specs; this ladder in memo |

**Defer:** *(closed — see Multi-approver hotel rate inbox below)* · field-level restore.

#### Prod-ready ladder — Multi-approver hotel rate inbox (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `rates.approve` RBAC; non-approvers create inactive tip + leave live tip Match-active; `POST …/activate` swaps live tip; pending blocks further branch/restore; activation Task + notify assignee |
| **2 Channels / UI** | **Done** | Rate chart **Pending activation** + **Activate**; History Activate; Tasks link → supplier rate chart; toast when submitted for approval |
| **3 Proof** | **Done** | hotel-rate-pending specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see Transfer/activity tip dual-control Activate below)* · field-level restore; ApprovalRequest schema.

#### Prod-ready ladder — Transfer + activity tip dual-control Activate (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Without `rates.approve`, transfer/activity new-version + restore create inactive tip; prior tip stays Match-live; Activate swaps; pending blocks branch/restore |
| **2 Channels / UI** | **Done** | Supplier transfer + activity History Activate / Pending cues (mirror hotel) |
| **3 Proof** | **Done** | hotel-rate-pending aliases; claim registry; About note; this ladder in memo |

**Defer:** multi-step quorum; ApprovalRequest schema; field-level restore; activation Task enqueue for transfer/activity.

#### Prod-ready ladder — Hotel nationality markets (IN / INTL) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `nationality` on `occupancyPricingJson` (`IN` / `INTL`); Match prefers market-specific then any; season overlap keyed by nationality; resolve accepts party/line nationality; Heritage spring MAP IN + INTL sisters |
| **2 Channels / UI** | **Done** | Rate chart nationality chips + list badge; quote drawer guest nationality; Match cue + attention **Nationality** chip |
| **3 Proof** | **Done** | hotel-nationality + cue specs; this ladder in memo |

**Defer:** *(closed — see Full ISO-3166 + Multi-guest ladders below)*.

#### Prod-ready ladder — Hotel per-ISO nationality tips (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Rate `nationality` stores ISO-2 (US/GB/…) without collapsing to INTL; Match prefers exact ISO → INTL catch-all → any; season overlap keyed by exact code; Heritage spring US MAP sister |
| **2 Channels / UI** | **Done** | Rate chart + quote drawer chips include common ISO tips; cues/labels show country names |
| **3 Proof** | **Done** | hotel-nationality + cue specs; this ladder in memo |

**Defer:** multi-guest mixed nationality per room (see ladder below).

#### Prod-ready ladder — Full ISO-3166 nationality picker (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Shared `ISO_3166_ALPHA2_CODES` + `iso3166RegionLabel` in contracts; API/web labels resolve any ISO-2 |
| **2 Channels / UI** | **Done** | Rate chart quick chips + searchable full-country Combobox; quote drawer searchable full catalog |
| **3 Proof** | **Done** | Catalog + picker option specs; this ladder in memo |

**Defer:** *(closed — see Multi-guest mixed nationality below)*.

#### Prod-ready ladder — Multi-guest mixed nationality (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `details.nationalities[]` + collapse `effectiveGuestNationality` (IN+foreign / multi-ISO → INTL); Match + rematch pass codes; provenance `guestNationalities` / `guestNationalityMixed` |
| **2 Channels / UI** | **Done** | Quote drawer multi-add guest nationality chips + Match cue; Attention/Nationality note shows mixed |
| **3 Proof** | **Done** | Collapse + rematch + cue specs; this ladder in memo |

**Defer:** *(closed — see Add traveller nationality / Per-pax buy splits below)*.

#### Prod-ready ladder — Traveller nationality → Match default (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Line nationality wins; blank line falls back to trip travellers (lead-first / mixed list); rematch + template apply pass traveller ctx; North Bengal seed IN+US demo |
| **2 Channels / UI** | **Done** | Hotel drawer soft-seeds from travellers; cue **From travellers** / **Seeded from trip travellers** |
| **3 Proof** | **Done** | Traveller derive + rematch opts specs; this ladder in memo |

**Defer:** *(closed — see Per-pax buy splits below)*.

#### Prod-ready ladder — Add traveller nationality (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Create traveller normalizes/stores `nationality` (ISO / IN / INTL) |
| **2 Channels / UI** | **Done** | Trip **Add traveller** searchable nationality; travellers table Nationality column |
| **3 Proof** | **Done** | This ladder in memo; About release note |

**Defer:** *(closed — see Edit traveller nationality / Per-pax buy splits below)*.

#### Prod-ready ladder — Edit traveller nationality (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `PATCH /trips/:id/travellers/:travellerId` (`UpdateTravellerSchema`: nationality / name / lead) |
| **2 Channels / UI** | **Done** | Travellers table **Edit** sheet — nationality Combobox + lead flag |
| **3 Proof** | **Done** | This ladder in memo; About release note |

**Defer:** *(closed — see Per-pax buy splits below)* · companion type edit on sheet.

#### Prod-ready ladder — Per-pax buy splits (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Mixed IN+foreign (exactly 2 adult codes), 1 room / 2A: Match composes buy as DBL/2 share per tip (`buyMode: per_pax_split`); children allowed (extras after split); falls back to collapsed room tip when a tip is missing |
| **2 Channels / UI** | **Done** | Occupancy cue **Split · IN ₹… + US ₹…**; Match explain **Per-pax buy · …** (no new Rate chart fields) |
| **3 Proof** | **Done** | hotel-pax-buy-split + occupancy cue specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see Per-pax buy + children below)* · 3+ adults / multi-room splits; full Sembark per-pax matrix; activity changes (already adult/child).

#### Prod-ready ladder — Per-pax buy + children extras (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Dropped 0C gate on DBL/2 split (still 1 room / 2A / exactly 2 mixed codes); child extras stay on collapsed Match tip via `applyOccupancyPricing` |
| **2 Channels / UI** | **Done** | Occupancy cue **Split · … · +₹… · N child…** when extras present |
| **3 Proof** | **Done** | Gate + cue specs; this ladder in memo |

**Defer:** *(closed — see Multi-room 2A×N per-pax buy below)* · 3+ adults / 1 room; per-child nationality tips; full Sembark per-pax matrix.

#### Prod-ready ladder — Multi-room 2A×N per-pax buy (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Gate `adults === 2 × rooms` (was rooms===1); same DBL/2 shares; `hotelStayCalculation` already × rooms |
| **2 Channels / UI** | **Done** | Occupancy / Match explain cue appends **× N rooms** when N>1 |
| **3 Proof** | **Done** | hotel-pax-buy-split + cue specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see 3A TPL/3 per-pax buy below)* · uneven multi-room (3A/2R); >2 codes on 2A; 3A×N; per-child nationality tips; full Sembark per-pax matrix.

#### Prod-ready ladder — 3A TPL/3 per-pax buy (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Gate 1 room / 3 adults / exactly 3 codes; TPL band `/3` shares; `bandAdults` drives extras `baseAdults` (no hardcoded 2) |
| **2 Channels / UI** | **Done** | Occupancy cue already joins N shares (`Split · IN + US + GB`) |
| **3 Proof** | **Done** | hotel-pax-buy-split + cue specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see Uneven 3A/2R DBL+SGL below)* · weighted 2-code 3A; 3A×N; per-child nationality tips; full Sembark per-pax matrix.

#### Prod-ready ladder — Uneven 3A/2R DBL+SGL per-pax buy (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Gate 2 rooms / 3 adults / 3 codes; slots DBL+DBL+SGL (code order); stayRooms=1 so night unit is not ×2; `composition: dbl_sgl` |
| **2 Channels / UI** | **Done** | Cue **· DBL+SGL** (not × 2 rooms) |
| **3 Proof** | **Done** | hotel-pax-buy-split + cue specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see Weighted 2-code 3A below)* · who sleeps alone (rooming UI); 3A×N; per-child nationality tips; full Sembark matrix.

#### Prod-ready ladder — Weighted 2-code 3A per-pax buy (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | 3A with exactly 2 distinct codes expands to `[c0,c0,c1]` (lead-weighted); tip reuse allowed across duplicate slots; still needs ≥2 distinct tips |
| **2 Channels / UI** | **Done** | Cue already lists repeated nationality shares (e.g. IN + IN + US) |
| **3 Proof** | **Done** | hotel-pax-buy-split specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see Rooming + multiplicity + 3A×N below)* · per-child nationality tips; full Sembark matrix.

#### Prod-ready ladder — Rooming alone + traveller multiplicity + 3A×N (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Guest **bag** (duplicates kept); expand by counts; `orderBagWithAloneLast`; gate `adults === 3 × rooms` after DBL+SGL |
| **2 Channels / UI** | **Done** | Quote drawer **Alone (single)** when 3A/2R; traveller seed preserves multiplicity |
| **3 Proof** | **Done** | hotel-nationality + hotel-pax-buy-split + web nationality specs; claim registry; About note; this ladder in memo |

**Defer:** uneven 6A/4R rooming board; named travellers on slots; per-child nationality tips; full Sembark matrix.

#### Prod-ready ladder — Tax identity on proposals (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `business.placeOfSupply`; `parseOrgTaxIdentity` (taxLabel + GSTIN + POS); demo seed GSTIN/KA |
| **2 Channels / UI** | **Done** | Settings Business place of supply; proposal PDF/email/public preview + trip summary use tax label + identity lines |
| **3 Proof** | **Done** | org-tax-identity specs; claim registry; About release note; this ladder in memo |

**Defer:** *(closed — see CGST/SGST/IGST display split below)* · full accounting ledger / GST compliance claim.

#### Prod-ready ladder — CGST/SGST/IGST display split (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `business.destinationPlaceOfSupply`; `splitTaxDisplay` — same POS → CGST+SGST, different → IGST; line `taxPercent` / stored `taxTotal` unchanged |
| **2 Channels / UI** | **Done** | Settings destination POS; workspace + proposal PDF/email/public preview show breakdown + “not a GST invoice claim” cue |
| **3 Proof** | **Done** | tax-display-split + org-tax-identity specs; claim registry; About note; this ladder in memo |

**Defer:** *(closed — see Trip destination POS override + freeze/infer below)* · place-of-supply–driven hotel buy rates; e-invoice / GSTR; GST compliance claim (stays do-not-claim).

#### Prod-ready ladder — Trip destination POS override (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `Trip.destinationPlaceOfSupply`; `PATCH /trips/:id/destination-place-of-supply`; `parseOrgTaxIdentity(…, { destinationPlaceOfSupply })` → trip ?? org |
| **2 Channels / UI** | **Done** | Overview field beside Destinations; workspace + proposal PDF/email/preview use trip override |
| **3 Proof** | **Done** | org-tax-identity override specs; this ladder in memo |

**Defer:** *(closed — freeze + infer below)* · hotel buy rates; e-invoice / compliance.

#### Prod-ready ladder — Quote freeze + destination POS infer (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `QuotationVersion.taxIdentityJson` write-once stamp on send / first PDF; live resolve = trip override ?? place-label infer (`POS_ALIASES` / parent chain) ?? org; infer never persisted on trip |
| **2 Channels / UI** | **Done** | Overview soft cue + placeholder when suggested; proposals/preview prefer stamped identity when present |
| **3 Proof** | **Done** | infer + freeze + precedence specs; this ladder in memo |

**Defer:** hotel buy rates; *(Finance display parity closed below)* · e-invoice / GST compliance claim (stays do-not-claim).

#### Prod-ready ladder — Trip Finance accepted-quote tax display parity (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `getFinanceSummary` returns `quote.taxTotal` + `taxIdentity` via `resolveQuoteTaxIdentityForDisplay` (stamp ?? live trip/infer/org) — no new stamp write |
| **2 Channels / UI** | **Done** | Finance accepted-quote card shows sell-ex-tax, tax label/total, CGST/SGST or IGST lines, identity + display-only cue (mirror Quotes) |
| **3 Proof** | **Done** | quote-tax-identity display resolve specs; claim registry; About release note; this ladder in memo |

**Defer:** place-of-supply hotel buy rates; *(pay-page + receivable CD tax closed below)* · e-invoice / GSTR / full GL (do not claim).

#### Prod-ready ladder — Public pay-page tax breakdown (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `composePublicPaymentTaxDisplay` — pro-rate accepted-quote tax onto instalment; same CGST/SGST/IGST display split; no ledger write |
| **2 Channels / UI** | **Done** | Public `/pay/:token` shows before-tax / tax / split + GSTIN/POS + display-only cue |
| **3 Proof** | **Done** | payment-link-tax-display specs; claim registry; About note; this ladder in memo |

**Defer:** place-of-supply hotel buy rates; *(commercial-document closed below)* · e-invoice / GSTR / full GL (do not claim).

#### Prod-ready ladder — Commercial-document instalment tax split (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Receivable CD from trip instalment stores net `amount` + `taxAmount` via same pro-rate as pay-page; notes carry CGST/SGST/IGST + display-only cue; settle total = amount+tax |
| **2 Channels / UI** | **Done** | Commerce Invoices list shows total + tax when set |
| **3 Proof** | **Done** | hotel-payable-settle + payment-link-tax-display specs; claim registry; About note; this ladder in memo |

**Defer:** place-of-supply hotel buy rates; e-invoice / GSTR / full GL (do not claim).

#### Prod-ready ladder — FIT &lt;3m claim protocol gate (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `buildFitClaimProtocol` on `GET /dashboard/sales` (`definition`, target 3m, min sample 20, `testing`/`ready`, `publicClaimAllowed`) |
| **2 Channels / UI** | **Done** | Sales strip FIT card + samples line show testing/ready cue; copy says public claim gated |
| **3 Proof** | **Done** | Protocol + cue specs; claim registry + 90-day scorecard in memo |

**Defer:** *(closed — see Demo FIT n≥20 timing seed below)* · public marketing page; help centre; Settings-configurable protocol; 60s claim.

#### Prod-ready ladder — Demo FIT n≥20 timing seed (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `buildDemoFitBuildTimingSamples` (20 under-3m minutes); `seedDemoFitBuildTimingSamples` writes `quote.fit_build` audits on **demo-travel only** (`source: demo_seed`); idempotent; not on FIT pack install |
| **2 Channels / UI** | **Done** | Existing sales strip shows claim-ready after `pnpm db:seed` on demo org (no new UI) |
| **3 Proof** | **Done** | Demo sample + claim-gate specs; this ladder in memo |

**Defer:** production sample growth; public marketing page; 60s claim; FIT-pack telemetry.

#### Prod-ready ladder — In-app release notes (About) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `releaseNotes.ts` claim-safe filter (proven/architecture only; testing + do-not-claim hidden) |
| **2 Channels / UI** | **Done** | Settings → **About** release notes list + Proven/Architecture badges |
| **3 Proof** | **Done** | Filter specs; scorecard credibility row; this ladder in memo |

**Defer:** *(closed — see Public changelog below)* · help centre; case studies.

#### Prod-ready ladder — Public changelog (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Reuse `visibleReleaseNotes()` (proven/architecture only) — no new claims |
| **2 Channels / UI** | **Done** | Login-free `/changelog`; Settings → About links to it |
| **3 Proof** | **Done** | Scorecard credibility row; About release note; this ladder in memo |

**Defer:** help centre; case studies; public scale / FIT-speed marketing claims; marketing site polish.

#### Prod-ready ladder — Demo-org polish (named FIT demo trip) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Demo trip title `Darjeeling classic FIT — demo`; install returns `demoTrip` meta (`title`, `includes`, `created`); upgrades legacy `Darjeeling hills — sample` title on re-find |
| **2 Channels / UI** | **Done** | Install toast names demo + Open cue; onboarding **Open demo trip** (idempotent install → Quotations); About release note |
| **3 Proof** | **Done** | Starter-pack + agencyFitPack toast/path specs; scorecard credibility row; this ladder in memo |

**Defer:** public demo tenant; guided product tour video; seed rewrite beyond FIT pack.

#### Prod-ready ladder — Hotel children without bed picker (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `clampHotelChildrenWithoutBed`; validate without-bed ≤ children; Match payload forwards `childAges` + `childrenWithoutBed`; occupancy fields on `HOTEL_RATE_MATCH_KEYS` (rematch) |
| **2 Channels / UI** | **Done** | Hotel quote drawer **Children without bed** NumberField (when children > 0); shrinks when children decrease |
| **3 Proof** | **Done** | `quoteServiceDetails.hotel-without-bed` specs; this ladder in memo |

**Defer:** *(closed — see Compact meal × occupancy matrix)* · nationality grids elsewhere.

#### Prod-ready ladder — Hard allotment at quote (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Match stamps `Insufficient allotment` + `allotmentWarn`; `assertNoBlockingAllotment` on send/approve/request-approval; legacy `Soft warning` stamps still block |
| **2 Channels / UI** | **Done** | Send gate includes allotment shortfalls; drawer destructive Allotment cue; soft “send still allowed” toast removed; itinerary avail copy aligned |
| **3 Proof** | **Done** | `hotelAllotmentNote` + attention allotment specs; this ladder in memo |

**Defer:** *(closed — see Allotment / capacity override ack below)*

#### Prod-ready ladder — Allocate-on-accept hotel hold (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Accept/materialize places allotment **hold** via `syncBookingInventory` (rooms qty); no-inventory stays non-blocking; insufficient → warning on materialize |
| **2 Channels / UI** | **Done** | Accept toast shows allotment hold count; ops warnings include hold failures |
| **3 Proof** | **Done** | `hotel-allocation-quantity` + hotel-chain materialize hold specs; this ladder in memo |

**Defer:** *(closed — see Auto-confirm allotment on supplier confirm below)*

#### Prod-ready ladder — Auto-confirm allotment on supplier confirm (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `syncBookingInventory` upgrades existing **hold → confirmed** when booking confirms (idempotent if already confirmed) |
| **2 Channels / UI** | **Done** | Ops Confirm toast cues when allotment hold was upgraded |
| **3 Proof** | **Done** | Upgrade decision + sync specs; this ladder in memo |

**Defer:** *(closed — see Partner-only hotel confirm UX below)*

#### Prod-ready ladder — Partner-only hotel confirm UX (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Confirm requires `confirmationRef`; inbound confirm upgrades allotment hold → confirmed; schedules agency AUTO-payable via `ensurePayableOnBookingConfirm` (agency org actor); returns `payable` + `allotmentUpgraded` |
| **2 Channels / UI** | **Done** | Partner inbound Confirm `RecordSheet` (ref required) replaces `window.prompt`; toast cues payable / allotment like Ops |
| **3 Proof** | **Done** | `ConfirmInboundBookingSchema` specs; this ladder in memo |

**Defer:** *(closed — see Partner inbound confirmation attachment below)*

#### Prod-ready ladder — Partner inbound confirmation attachment (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `POST …/inbound-bookings/:id/confirmation-document`; Document on **agency** org (`booking_component` + `partner_confirmation`); mirror ownership; PDF/image ≤8MB; `FilesService` optional `documentType` |
| **2 Channels / UI** | **Done** | Confirm sheet optional file; confirm then upload; toast cues attach / attach-failed |
| **3 Proof** | **Done** | Binding + MIME specs; this ladder in memo |

**Defer:** *(closed — see Agency Ops partner confirmation docs below)*

#### Prod-ready ladder — Agency Ops partner confirmation docs (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `GET /files` optional `documentType` filter; query helper for `partner_confirmation` on `booking_component` |
| **2 Channels / UI** | **Done** | Ops Edit booking lists partner confirmation files + Download (apiBlob) |
| **3 Proof** | **Done** | Files-query helper specs (API + web); this ladder in memo |

**Defer:** *(closed — see Confirm qty resync below)*

#### Prod-ready ladder — Confirm qty resync (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | On hold→confirmed, stay allotment `quantity` resyncs to `hotelAllocationQuantity`; soft capacity check (`remaining` covers delta); returns `quantityResynced` / `allotmentSyncFailed`; already-confirmed still idempotent |
| **2 Channels / UI** | **Done** | Ops + Partner confirm toasts: `· rooms qty synced` / `· allotment not synced — …` |
| **3 Proof** | **Done** | Resync/capacity helpers + sync specs; toast cue specs; this ladder in memo |

**Defer:** *(closed — see Ops list-row partner-doc badge below)*

#### Prod-ready ladder — Ops list-row partner-doc badge (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `GET /files` batch via repeated `entityId` / `entityIds` CSV → `listForEntities`; `parseFileListEntityIds` |
| **2 Channels / UI** | **Done** | Ops booking list loads partner confirmations in batch; **Partner file** badge + Download button without opening Edit |
| **3 Proof** | **Done** | Batch path / map / parse specs; this ladder in memo |

**Defer:** *(closed — see Qty sync on already-confirmed below)*

#### Prod-ready ladder — Qty sync on already-confirmed (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Confirmed stay allotment qty-only resync on sync; Ops update accepts `requiredQuantity` + stamps `rooms`; sync runs on save for confirmed/requested (not only status change) |
| **2 Channels / UI** | **Done** | Edit booking **Rooms** for hotel; save toasts reuse `· rooms qty synced` / not-synced cues |
| **3 Proof** | **Done** | Already-confirmed qty resync sync specs; this ladder in memo |

**Defer:** *(closed — see Type-aware partner Confirm sheet below)*

#### Prod-ready ladder — Type-aware partner Confirm sheet (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Inbound list projects `startAt`/`endAt` + `confirmCue` (vehicleLabel / vehicles) via `inboundPartnerConfirmCueFromBooking` |
| **2 Channels / UI** | **Done** | Inbound type badge; Confirm sheet placeholder/description by type; service-date / vehicle cues on row + sheet |
| **3 Proof** | **Done** | Cue + copy specs; this ladder in memo |

**Defer:** *(closed — see Transfer capacity soft cue on partner confirm below)*

#### Prod-ready ladder — Transfer capacity soft cue on partner confirm (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Transfer materialize stamps adults/children/vehicleSeats; inbound cue computes soft `capacityNote`/`capacityWarn` (VehicleType seats + inquiry party fallback); confirm returns same fields (never blocks) |
| **2 Channels / UI** | **Done** | Partner Confirm sheet capacity banner; inbound “over capacity” cue; toast `· capacity short — confirm still applied` |
| **3 Proof** | **Done** | Cue + stamp + copy specs; this ladder in memo |

**Defer:** *(closed — see Ops Confirm type-aware copy below)*

#### Prod-ready ladder — Ops Confirm type-aware copy (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `opsConfirmCueFromBooking` projects vehicle/party/seats + soft capacity from Ops booking requirements (client; never blocks) |
| **2 Channels / UI** | **Done** | Ops Confirm sheet reuses type placeholder/label/service cue; Ops-voiced descriptions; capacity banner + toast soft cue |
| **3 Proof** | **Done** | Copy helper specs; this ladder in memo |

**Defer:** *(closed — see Stay-dates release+reallocate below)*

#### Prod-ready ladder — Stay-dates release+reallocate (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | When stay allotment `checkIn`/`checkOut` ≠ booking days, soft capacity on new window (overlap credit) then release+reallocate same asset/product/status+qty; soft-fail leaves old allotment; returns `datesResynced` / `allotmentSyncFailed` |
| **2 Channels / UI** | **Done** | Ops/Partner toasts: `· stay dates synced` via `allotmentConfirmToastCue` |
| **3 Proof** | **Done** | Date helpers + sync specs + toast specs; this ladder in memo |

**Defer:** *(closed — see Cross-asset / supplier rebind below)*

#### Prod-ready ladder — Cross-asset / supplier rebind (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Ops `updateBooking` restamps `partnerAssetId` from supplier `linkedAssetId`; stay sync release+reallocates onto target asset (soft capacity, no roomProduct carry); soft-fail keeps old allotment; returns `assetRebound` |
| **2 Channels / UI** | **Done** | Toast `· property rebound` via `allotmentConfirmToastCue` |
| **3 Proof** | **Done** | Rebind helpers + sync specs + toast specs; this ladder in memo |

**Defer:** *(closed — see Release+reallocate completion below)*

#### Prod-ready ladder — Release+reallocate completion (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Orphan release when target asset null; stay room-product rematch (`roomProductId` stamped on materialize + Ops PATCH); transfer fleet window/unit resync (conflict soft-fail excludes self) |
| **2 Channels / UI** | **Done** | Toasts: `· allotment released` / `· room product synced` / `· transfer window synced` |
| **3 Proof** | **Done** | Helper + sync + toast specs; this ladder closes the release+reallocate defer |

**Defer:** *(closed — see Ops room-product picker below)*

#### Prod-ready ladder — Ops room-product picker (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | *(reuse)* Ops PATCH `roomProductId` already rematches allotment |
| **2 Channels / UI** | **Done** | Edit booking Combobox loads `/inventory/assets/:id/rooms` for linked hotel supplier; save stamps `roomProductId` |
| **3 Proof** | **Done** | This ladder in memo |

**Defer:** *(closed — see Transfer cross-asset rebind below)*

#### Prod-ready ladder — Transfer cross-asset rebind (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Transfer target asset prefers `driverSupplierId` link; Ops restamps `partnerAssetId` on driver change; fleet sync release+reallocates onto new asset (unit must belong to target); soft conflict excludes self |
| **2 Channels / UI** | **Done** | Toast reuses `· property rebound` (+ `· transfer window synced` when window also moves) |
| **3 Proof** | **Done** | Fleet rebind sync spec; this ladder in memo |

**Defer:** *(closed — see RoomType name rematch below)*

#### Prod-ready ladder — RoomType name rematch (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | When `roomProductId` missing, unique normalized `roomType` ↔ product name match rematches allotment (zero/ambiguous → no-op) |
| **2 Channels / UI** | **Done** | Toast reuses `· room product synced` |
| **3 Proof** | **Done** | Match helpers + sync specs; this ladder in memo |

**Defer:** *(none — release+reallocate polish ladder complete)*.

#### Prod-ready ladder — Hard capacity at quote (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Match stamps `Insufficient capacity` + `capacityWarn`; `assertNoBlockingCapacity` on send/approve; legacy Soft warning capacity stamps still block |
| **2 Channels / UI** | **Done** | Send gate includes capacity shortfalls; drawer destructive Capacity cue; soft “send still allowed” toast removed |
| **3 Proof** | **Done** | `transferCapacityNote` + attention capacity specs; this ladder in memo |

**Defer:** *(closed — see Auto vehicle-count bump below)*

#### Prod-ready ladder — Allotment / capacity override ack (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `allotmentRiskAckForNote` / `capacityRiskAckForNote` fingerprints; `lineNeeds*RiskAck` clears send block when ack matches note; rematch with new note re-blocks |
| **2 Channels / UI** | **Done** | Drawer **Send anyway (acknowledge)** on allotment/capacity shortfalls; attention chips clear after ack |
| **3 Proof** | **Done** | `quote-inventory-risk-ack` + allotment/capacity/attention specs; this ladder in memo |

**Defer:** *(closed — see Live capacity stamp on Vehicles edit below)*

#### Prod-ready ladder — Auto vehicle-count bump on Match (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `bumpTransferVehiclesForCapacity` raises `details.vehicles` to `ceil(party/seats)` on Match before qty/sell; never decreases; stamps info “fits” note (no `capacityWarn`) |
| **2 Channels / UI** | **Done** | Match toast: **vehicles set to N for party of P**; Vehicles field + sell update via existing apply path |
| **3 Proof** | **Done** | Bump helper + `applyRateResolveHit` transfer specs; this ladder in memo |

**Defer:** *(closed — see Live capacity stamp on Vehicles edit below)*

#### Prod-ready ladder — Live capacity stamp on Vehicles edit (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Match stamps `vehicleSeats` on provenance; `restampTransferCapacity` recomputes note/warn/ack on Vehicles change + Save (no rematch) |
| **2 Channels / UI** | **Done** | Vehicles onChange updates Capacity cue live; lowering below fit re-blocks send until raise / ack |
| **3 Proof** | **Done** | `restampTransferCapacity` + Match `vehicleSeats` specs; this ladder in memo |

**Defer:** *(closed — see Live capacity stamp on party edit below)*

#### Prod-ready ladder — Live capacity stamp on transfer party edit (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Adults/Children edits call `restampTransferCapacity` (same as Vehicles); raise party re-blocks; lower clears warn/ack |
| **2 Channels / UI** | **Done** | Transfer drawer **Adults** / **Children** beside Vehicles; Capacity cue updates live |
| **3 Proof** | **Done** | Party restamp specs; this ladder in memo |

**Defer:** *(closed — see Reason-required inventory override ack below)*

#### Prod-ready ladder — Reason-required inventory override ack (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `allotmentRiskAckReason` / `capacityRiskAckReason` required with note fingerprint; fingerprint-only ack still blocks send |
| **2 Channels / UI** | **Done** | Drawer reason field + **Send anyway** disabled until reason; rematch/note change clears reason |
| **3 Proof** | **Done** | Ack helper + allotment/capacity/attention specs; this ladder in memo |

**Defer:** *(closed — see Rate-drift Keep-buy reason below)*

#### Prod-ready ladder — Rate-drift Keep-buy reason (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `rateDriftAckReason` required with `rateDriftAckForUpdatedAt`; fingerprint-only Keep-buy still blocks send |
| **2 Channels / UI** | **Done** | Drawer reason field + **Keep buy** disabled until reason (hotel + transfer banners) |
| **3 Proof** | **Done** | Drift helper + attention/reprice specs; this ladder in memo |

**Defer:** *(closed — see Manager-gated inventory risk ack below)*

#### Prod-ready ladder — Manager-gated inventory risk ack (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `POST …/inventory-risk-acks` (`below_margin.approve`); autosave strips forged allotment/capacity acks |
| **2 Channels / UI** | **Done** | Drawer Send anyway gated; non-managers see “Ask a manager…” |
| **3 Proof** | **Done** | Preserve helper specs; this ladder in memo |

**Defer:** *(closed — see Auto vehicle bump on party edit below)*

#### Prod-ready ladder — Auto vehicle bump on transfer party edit (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Adults/Children + Save call `bumpAndRestampTransferCapacity` (same ceil as Match); never decreases higher vehicle count |
| **2 Channels / UI** | **Done** | Toast when vehicles raised; sell recomputed when not sellManual |
| **3 Proof** | **Done** | `bumpAndRestampTransferCapacity` specs; this ladder in memo |

**Defer:** *(closed — see Dedicated inventory_risk.approve below)*

#### Prod-ready ladder — Dedicated inventory_risk.approve (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `inventory_risk.approve` permission; `POST …/inventory-risk-acks` gated on it (not `below_margin.approve`) |
| **2 Channels / UI** | **Done** | Drawer Send anyway / Ask a manager copy uses new key; sales_manager role map grants it |
| **3 Proof** | **Done** | CAP + rbac-matrix specs; this ladder in memo |

**Defer:** *(closed — see Rate-drift Keep-buy RBAC below)*

#### Prod-ready ladder — Rate-drift Keep-buy RBAC (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `rate_drift.approve`; `POST …/rate-drift-acks` stamps live chart `updatedAt` + reason; autosave strips forged Keep-buy acks |
| **2 Channels / UI** | **Done** | Drawer Keep buy gated; non-managers see Rematch + “Ask a manager…”; sales_manager role map grants it |
| **3 Proof** | **Done** | Preserve helper + CAP/rbac-matrix specs; this ladder in memo |

**Defer:** *(closed — see Rematch inside from-package below)*

#### Prod-ready ladder — Transactional create-trip+package (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `POST /trips/from-package` — Prisma `$transaction` create trip + `createFromTemplate` (rollback on apply fail); no orphan trip |
| **2 Channels / UI** | **Done** | New trip Package path uses one call; failure → error toast (no keep-orphan warn) |
| **3 Proof** | **Done** | `fromPackageRequestBody` + planner specs; this ladder in memo |

**Defer:** *(closed — see Rematch inside from-package below)*

#### Prod-ready ladder — Rematch inside from-package / from-template (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `createFromTemplate` rematches via `RatesService.resolve` before create (shared by from-package + workspace apply) |
| **2 Channels / UI** | **Done** | Toast shows rate-matched / need-rates counts; workspace skips redundant client rematch when server counted |
| **3 Proof** | **Done** | `quote-rate-rematch` + toast specs; this ladder in memo |

**Defer:** *(closed — see Sent/accepted version rewrite below)*

#### Prod-ready ladder — Sent/accepted version rewrite on date shift (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | When travel-start shift finds no draft, clone newest locked quote (`accepted`→`approved`→`sent`) into rematched draft; drafts still shift in place + rematch |
| **2 Channels / UI** | **Done** | Travel-dates sheet copy; toast + select new draft; skip redundant client rematch when server counts present |
| **3 Proof** | **Done** | `pickCommercialQuoteSourceForRewrite` specs; this ladder in memo |

**Defer:** *(closed — see Per-line age overrides below)*

#### Prod-ready ladder — Per-line age overrides (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Date-shift / rematch preserve line `childAges`; transfer `per_adult` uses line adults/children; adults/children invalidate transfer Match |
| **2 Channels / UI** | **Done** | Transfer drawer Child ages (trim on Children change); activity Children trims ages |
| **3 Proof** | **Done** | trim/preserve/per_adult specs; this ladder in memo |

**Defer:** *(closed — see Compact meal × occupancy matrix)*

#### Prod-ready ladder — Transfer child-age banding on fares (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `TransferFare.childAgeMin`/`Max`; per_adult resolve reuses `classifyActivityPax`; stamps charged heads + calculation; `childAges` invalidates transfer Match |
| **2 Channels / UI** | **Done** | Supplier transfer Rate chart age min/max; drawer Ages · cue (same helper as activity) |
| **3 Proof** | **Done** | Resolve reclassify + match-key specs; this ladder in memo |

**Defer:** *(closed — see Transfer infant age banding)* multi-band grids; per-vehicle child discounts.

#### Prod-ready ladder — Transfer CSV child-age columns (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `ImportTransferFareCsvRowSchema` `childAgeMin`/`Max`; import commit passes ages into `createTransferFare` |
| **2 Channels / UI** | **Done** | Transfer CSV/XLSX template + parse columns (mirror activity) |
| **3 Proof** | **Done** | Import commit age-pass specs; this ladder in memo |

**Defer:** *(closed — see Transfer infant fare surface below)*

#### Prod-ready ladder — Transfer infant fare surface (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Line `infants` on quote details + resolve item; per_adult prefers line infants; stamps `infantUnit` / party infants; CSV `infantUnitCost`; Match keys include infants |
| **2 Channels / UI** | **Done** | Supplier + catalog Rate chart Infant field; CSV column; transfer drawer Infants + Match cue |
| **3 Proof** | **Done** | Resolve infant pricing + CSV pass-through specs; this ladder in memo |

**Defer:** *(closed — see Transfer infant age banding below)*

#### Prod-ready ladder — Transfer infant age banding (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `classifyTransferPax`: age `< min` → infant · `[min,max]` → child · `> max` → adult; per_adult resolve stamps `infantsCharged` / `usedChildAges` (ages override declared infants) |
| **2 Channels / UI** | **Done** | Transfer drawer Ages cue for infant reclass; Infants cue `(from ages)`; child-ages + Infants field copy |
| **3 Proof** | **Done** | classify + resolve under-age specs; Ages note specs; this ladder in memo |

**Defer:** multi-band grids; per-vehicle child discounts.

#### Prod-ready ladder — Org sales SLA targets (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Optional `settingsJson` first-touch / lead→quote / FIT-build targets (nullable clear); `salesSlaTargetsFromSettings` + `salesSlaMedianTone`; dashboard sales returns targets |
| **2 Channels / UI** | **Done** | Settings → General target fields beside Inbox aging; Sales response strip tones + target cues |
| **3 Proof** | **Done** | Tone/parse specs (API + web); this ladder in memo |

**Defer:** Meta template library sync; Microsoft messaging.

#### Prod-ready ladder — Org FX rates Settings UI (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `settingsJson.fxRates` on org settings schema; Lock FX already reads via `parseOrgFxRates` |
| **2 Channels / UI** | **Done** | Settings → General USD/EUR/AED/GBP editor; Lock FX blank-rate cue → Settings |
| **3 Proof** | **Done** | Org override beats defaults in `quote-fx.spec`; this ladder in memo |

**Defer:** *(closed — see Live FX refresh below)* · cross-pair convert; portfolio FX rollup.

#### Prod-ready ladder — Live FX refresh (Frankfurter) (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `POST /organizations/current/fx/refresh` → Frankfurter/ECB into `settingsJson.fxRates` + `fxRatesMeta`; AED skipped (not in feed); Lock FX unchanged consumer |
| **2 Channels / UI** | **Done** | Settings → General **Refresh from market** + last-fetched cue; toast lists refreshed / kept codes |
| **3 Proof** | **Done** | `org-fx-refresh` + cue helper specs; this ladder in memo |

**Defer:** auto-refresh cron; live fetch inside quote Lock FX; paid providers; cross-pair convert; portfolio FX rollup; AED via another feed.

#### Prod-ready ladder — Inbox / WA: Quote proposal template designation (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `quoteProposalTemplateId` on WA settings schema; `pickQuoteProposalTemplate` (id → name/`quote_proposal`); cold send fail-closed message points to Integrations |
| **2 Channels / UI** | **Done** | Integrations → WhatsApp **Quote proposal template** Combobox; Send dialog readiness cue + link; seed designates Quote proposal template |
| **3 Proof** | **Done** | `quote-whatsapp-template` + web cue specs; this ladder in memo |

**Defer:** Meta template library sync; Microsoft messaging.

#### Prod-ready ladder — Inbox WA: 24h session clock + template reply (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Shared `evaluateWhatsappCustomerSession`; quote send reuses it; Inbox text reply fail-closed outside 24h; `GET …/whatsapp/session/:id` |
| **2 Channels / UI** | **Done** | Inbox composer session cue (countdown); outside window → Meta template Combobox → `reply-template` |
| **3 Proof** | **Done** | Session eval + cue specs; this ladder in memo |

**Defer:** Meta template library sync; Microsoft messaging.

#### Prod-ready ladder — Inbox Cloud/Connect banner (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `inboxWhatsappCloudBanner` (off vs incomplete); Inbox reply gate uses full Cloud ready (`enabled` + phone + token), not toggle alone |
| **2 Channels / UI** | **Done** | Inbox header banner + **Open Integrations** when Cloud off/incomplete |
| **3 Proof** | **Done** | Banner helper specs; this ladder in memo |

**Defer:** Meta template library sync; Microsoft messaging.

#### Prod-ready ladder — Collect/ops: Voucher WA Mark as sent (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `POST …/mark-vouchers-whatsapp-sent`; `selectVoucherBookingsForMarkSent`; audit `trip.vouchers_whatsapp_marked_sent`; fail-closed when none eligible |
| **2 Channels / UI** | **Done** | Ops WhatsApp vouchers → wa.me → **Mark vouchers sent** (parity with enquiry + payment-link chase) |
| **3 Proof** | **Done** | Mark-sent select specs; this ladder in memo |

**Defer (same leftovers bucket):** *(closed — see Finance home AR/AP FX cue below)*

#### Prod-ready ladder — Movement voucher_pending for transfer/activity (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Board includes activities; `voucher_pending` on confirmed hotel/transfer/activity without note; service-status display matches; summary `voucherPending` + `activities` |
| **2 Channels / UI** | **Done** | `?voucherPending=1` + type=activity chips; home stats click-through; week-view activity icon |
| **3 Proof** | **Done** | Movement board + filter + booking-status specs; this ladder in memo |

**Defer (same leftovers bucket):** *(closed — see Finance home AR/AP FX cue below)*

#### Prod-ready ladder — Aging bucket chip → Age facet (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | `?bucket=` parse/validate; invalid bucket cleared on overdue/payables mode switch |
| **2 Channels / UI** | **Done** | Clickable Age summary chips toggle `?bucket=`; DataTable Age facet via `defaultFacetValues`; Clear age filter cue |
| **3 Proof** | **Done** | `financeAgingFilters` specs; this ladder in memo |

**Defer (same leftovers bucket):** *(closed — see Finance home AR/AP FX cue below)*

#### Prod-ready ladder — Payables Unmark from aging (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Reuse `POST …/unmark-paid` (same as trip Finance + CD sync) |
| **2 Channels / UI** | **Done** | Mark paid toast **Unmark** action; sticky “Just marked paid” strip; Unmark on partial rows still in the list |
| **3 Proof** | **Done** | This ladder in memo |

**Defer (same leftovers bucket):** *(none — Collect/ops leftovers thin-closed)*

#### Prod-ready ladder — Finance home AR/AP FX cue (**done**)

| Wave | Status | What shipped |
|------|--------|----------------|
| **1 Integrity** | **Done** | Home stats read aging `otherCurrencyCount` (already on API summary; dominant-currency totals unchanged) |
| **2 Channels / UI** | **Done** | Dashboard Finance cards: Open / Overdue AR + Supplier AP labels show `· N FX excl.` when mixed |
| **3 Proof** | **Done** | `agingHomeStatLabel` specs; this ladder in memo |

| Work item | Build on | Notes |
|-----------|----------|-------|
| Reusable itinerary / quote templates + package clone | `QuoteTemplate` (seeded packages) | Seed: Darjeeling + Goa priced FIT packages; trip UI sorts by destination match; save-as-template stores `destinationHint`. **Thin slice complete:** apply (`POST …/from-template`) shifts line `checkIn`/`checkOut`/`serviceDate`/`activityDate` from template anchor → trip `startDate`, clears rate snapshots, then **server rematch** in `createFromTemplate` via `RatesService.resolve` (from-package + workspace); **reanchors existing story itinerary `day.date`** to trip start + (dayNumber−1); **save embeds trip Story days/meta** into `contentJson.itinerary` (`tripId` / `versionId`); **apply seeds empty trip Story** from template (reminted ids + date reanchor; story meta if missing); **else scaffolds days from hotel lines** (check-in→check-out span + Check-in items). **Versioning thin-complete:** supersede-on-save + active-only list. **History + restore thin-complete:** versions API + Use-template History/Restore. **Travel-start gate thin-complete:** apply requires/stamps `startDate` so undated trips still shift. **New trip dates thin-complete:** create sheet optional Travel start/end → POST. **Edit trip dates thin-complete:** `PATCH /trips/:id/dates` + workspace sheet (no auto line shift). **One-shot create+package thin-complete:** New trip optional Package → create + apply → Quotations. **Pax in apply thin-complete:** adults/children stamp hotel/transfer/activity before rematch. **Folder hierarchy thin-complete:** slash-path `contentJson.folder` + breadcrumb/prefix filter. **History Diff side-by-side thin-complete.** Defer: date-shift-on-edit; server folder index |
| **Sales response / quote-turnaround telemetry** | `GET /dashboard/sales`, Lead/Activity/Inquiry→Trip→Quotation | **Thin + FIT minutes:** overdue lead follow-ups + median first-touch + median lead→quote (30d) + **median FIT build minutes** (workspace open → first send via `quote.fit_build` audit). `/leads?followUp=overdue` click-through. **Task→followUpAt sync:** creating a lead (or inquiry→lead) task with `dueAt` stamps `Lead.followUpAt`. **Reverse:** editing lead `followUpAt` stamps the newest open lead-linked task `dueAt`. **Inbox unread SLA thin:** unread + aging thread counts + `/inbox?unread=1` / `?aging=1`; **org `settingsJson.inboxAgingHours` (1–72, default 4)** on Settings → General, dashboard, and aging list filter. **Org sales SLA targets thin-complete:** optional `firstTouchTargetHours` / `leadToQuoteTargetHours` / `fitBuildTargetMinutes` on Settings → General; dashboard returns targets; Sales response strip tones medians (success / warn / danger) + target cues. **`conversation.unread_sla` fire:** worker 15m tick + opportunistic on sales dashboard / aging inbox; idempotent `[unread_sla:…]` subject marker; Integrations rule UI. **`conversation.waiting` fire** when status set to waiting. **Round-robin polish:** skip inactive members, preserve cursor on save, next-up / last-assigned on Lead sources, create toast shows owner, `/leads?owner=me`. Defer: dual-source merge / task PATCH |
| Itinerary → priced lines loop | `POST /rates/resolve`, Trip workspace quote UI | Live auto-rematch in hotel/transfer drawer when match keys change; bulk refresh uses same apply helper |
| Markup presets (fixed + %) | Org `defaultMarkupPercent`, rate resolve | **Thin slice complete:** Fixed ₹ and % both persist on open/save/rematch (no longer force-percent); Match apply keeps Fixed; **Apply default markup** uses org `defaultMarkupPercent` (not hardcoded 20%). **Agent / B2B markup:** org `agentMarkupPercent` for travel_agency / reseller / DMC parties (Settings + Match / rematch / Apply default via `partyId`). Defer: preset libraries |
| Tax default apply | Org `defaultTaxPercent` | **Thin slice complete:** new/import lines + unmatched resolve stamp org default (fallback 5%); **Apply default tax** (attention strip + ···) sets 0% billable lines to org default without overwriting set tax. **Tax identity thin-complete:** org `taxLabel` + business `gstin` / `placeOfSupply` on proposal PDF/email/public preview + workspace summary (display only). **CGST/SGST/IGST display split thin-complete:** destination POS vs agency POS drives breakdown of the same tax total (not filing). **Trip destination POS override thin-complete.** **Quote freeze + destination infer thin-complete** (`taxIdentityJson` on send/PDF; infer from place labels, never persisted). **Finance accepted-quote tax display parity thin-complete.** **Public pay-page tax breakdown thin-complete** (pro-rated instalment share). **Receivable commercial-document instalment tax split thin-complete.** Defer: place-of-supply–driven hotel buy rates / e-invoice / GST compliance |
| Margin warning + `below_margin.approve` | Org `minMarginPercent` + line override audit | API blocks send/approval; UI Send opens override when margin is the only gate |
| One-click branded proposal | PDF + email already | WhatsApp Cloud send (`POST …/send-whatsapp`) with public proposal link; **cold send requires Meta template** designated via Integrations `quoteProposalTemplateId` (or name/`quote_proposal` fallback); `wa.me` fallback + **Mark as sent** when Cloud is off; Send dialog readiness cue |
| Quote revision UX polish | Versioning + revise-from-accepted | **Thin slice complete:** org `defaultQuoteValidityDays` stamped on create/clone/template/revise; **missing `validUntil` blocks send**; **near-expiry / grace extend is opt-in** on send, request-approval, and mark-sent; **post-expiry grace** keeps date in-window; **past grace blocks send** (reset required); Reset to org default + cues; attention click-through + Save & next; rate-drift strip/preflight; **attention table auto-scroll**; **version label display + edit + preset picker**. Defer: *(validity extend opt-in closed)* |

**Defer past R1:** live FX auto-cron / quote-path fetch / AED feed (manual refresh thin-complete); country tax regimes (beyond org default %); full adult/child matrix everywhere; customer-facing quote comparison UI.

### Release 2 — Hotel + transfer contracting (days 31–60)

| Work item | Build on | Notes |
|-----------|----------|-------|
| Seasonal / weekend / occupancy-meal depth for hotels | `SupplierHotelRate`, supplier Rate chart | **Thin slice complete:** season windows + meal match + weekend night cost; occupancy extras (`occupancyPricingJson`: base adults + extra adult / child with|without bed) fold into resolve `unitCost` + provenance. **SGL/DBL/TPL adultBands** pick contracted base by adults/room (**weekend-per-band** absolute when set, else chart ratio). **Gala / date supplements** (nested `dateSupplements` on same JSON) fold in after occupancy — per-room on matching stay nights; Rate chart UI (≤3 nights); demo winter Heritage Deluxe MAP (24 Dec / 31 Dec). **Drawer cues:** Match with extras/bands shows **Occupancy · …** beside Rooms/Adults; Match with gala shows **Gala · +₹…** beside stay dates (matched labels preserved on provenance); Match with weekend nights shows **Weekend · …** beside stay dates. **Attention chips:** Occupancy / Gala / Weekend from stamped `rateProvenance.calculation` (soft; does not block send). **Child-age bands thin-complete:** occupancy `childAgeMax` + quote `childAges` reclassify over-age kids as extra adults on Match (Ages cue + chip). **Children without bed thin-complete:** drawer picker + Match rematch; remaining kids priced with bed. **Meal×occupancy matrix thin-complete:** Rate chart grid upserts EP/CP/MAP/AP × SGL/DBL/TPL sibling rows for one season. **Min stay thin-complete:** `minStayNights` Match cue + **hard send gate** (ack via `inventory_risk.approve`). **Nationality thin-complete:** `IN` / `INTL` + full ISO-3166 picker + **multi-guest** + **traveller CRM default** when line blank; Match prefers exact → INTL → any. **Rate version chains thin-complete:** hotel + transfer + activity (`versionNumber`/`supersedesId`; New version + History restore); hotel/transfer/activity tip Diff vs current + hotel side-by-side Diff expand; contract clone copies occupancy. Defer: 3+A / children / multi-room per-pax splits / multi-approver inbox |
| **Activity / attraction rate cards** | `SupplierActivityRate`, quote Activity drawer Match rate | **Complete (thin):** adult + child per-person cards; `childAgeMin`/`Max` reclassify quote `childAges`; contract blackout/stop-sale soft/hard in resolve; supplier Rates CRUD + CSV/XLSX import; quote Match rate. Seed: Tiger Hill (0–11), SpiceJet cruise (3–12). **Drawer cues:** Match with ages outside card window shows **Ages · N priced as adult (card …)** beside Child ages; soft blackout / hard stop-sale Match shows same **Open contracts** banners as hotel/transfer. **Attention chip:** Ages when children reclassify to adult. Defer: full adult/child matrix everywhere |
| Hotel supplier contracting foundations (V1 lock) | `AssetRoomProduct`, `SupplierContract`, `SupplierHotelRate.roomProductId` | **Complete:** room product link + contract-owned rates + version chain; blackout (soft) vs stop-sale (hard) in resolve; explainable match (`rateMeta.matchExplain`) + quote provenance (`matchSummary`); seeded Darjeeling Heritage Lodge alignment. **Cancellation thin slice:** contract `cancellationPolicyJson` (PolicyRules tiers) → Match explain + provenance `cancellationSummary` + quote line stamp; Contracts UI (days/% tiers); Heritage demo free-7d / 50%-3d / 100%-1d. **Drawer cue:** Match shows **Cancel · …** beside allotment (not only buried in Match explain). **Attention chip:** Cancel composes with other attention reasons (not alone — avoids perpetual strip noise). **Ops CancellationCase UI:** preview + draft→request→approve→apply from booking Cancel. **Apply drafts open credit note** when `expectedRefund > 0` (idempotent on case); Changes & incidents lists cases + credit-note cue. Defer: settle/allocate automation / agencyAbsorption / PolicyAttachment graph |
| **Hotel Supplier, Contract, Rate & Allotment Foundation — Release 1** | Property / Rates / Contracts / Rooms & allotments / quote Match rate | **Complete:** canonical rooms + `customerFacingName`; contract versions; soft blackout vs hard stop-sale (copy + enforce); season overlap blocked; room edit/archive; rich Match rate explain in quote drawer. **Allotment remaining** on hotel quote Match (`GET /inventory/availability` banner). **Hard allotment at quote:** Match/Save stamps `rateProvenance.allotmentWarn` → attention **Allotment** chip + **blocks** send/approve when remaining &lt; rooms (no inventory linked stays non-blocking). **Allocate-on-accept:** materialize places allotment **hold** (rooms qty); confirm upgrades hold → confirmed. **Override ack + reason + manager gate:** fingerprint + reason via `POST …/inventory-risk-acks` (`inventory_risk.approve`) + **rate-drift Keep-buy RBAC** (`rate_drift.approve`) |
| **Accepted hotel quote → enquiry → confirm → payable → voucher** | `BookingComponent.quotationLineId`, `ServiceRequest`, `SupplierInvoice`, `TripPayment` | **Complete (thin slice):** accept materializes hotel bookings + SR `sent`; Ops **Send enquiry** (WhatsApp Cloud or `wa.me` + **Mark enquiry sent**); Confirm schedules AUTO- payable + dual-writes payable `CommercialDocument` (idempotent on booking); Mark vouchered; customer hotel voucher PDF; Ops **WhatsApp vouchers** (text + Cloud PDF ≤5; wa.me + **Mark vouchers sent**) + **Email vouchers** (outbox PDF pack ≤5). Supplier TripPayment mark paid / unmark syncs CD + outbound `PaymentRecord`. Customer instalments dual-write receivable CD on create / payment-link; settle / unmark syncs inbound `PaymentRecord`. Demo: TRP-SEED-02 / TRP-SEED-03. **Transfer + activity accept→enquiry thin:** materialize lines with `supplierId` + SR `TRANSFER`/`ACTIVITY`; Ops Send enquiry for hotel/transfer/activity; Confirm/AUTO- payable type-agnostic. Seed QT-SEED-02 Bagdogra→Darjeeling + Tiger Hill sunrise. **Transfer + activity voucher PDF** download + WA/email PDF attach (≤5) shipped. **CancellationCase thin UI:** Ops Cancel sheet → fee preview (quote stamp / contract) → create+request → approve → apply (+ ops cascade); apply drafts credit note when refund expected; Changes & incidents lists cases. Bypass “without policy case” remains |
| Blackout / stop-sale **enforced** in `rates/resolve` | `SupplierContract.blackoutJson`, inventory stop-sell | Soft blackout (manual allowed) vs hard stop-sale; room-scoped contract + allotment stop-sale; quote UI distinguishes both. **Drawer:** soft blackout Match shows amber **Blackout · …** + **Open contracts**; hard stop-sale shows destructive **Stop-sale · …** + **Open contracts** (`/suppliers/:id#contracts`) |
| Transfer capacity / closing dates / point-to-point polish | `TransferFare`, transfer matrix, `rates/resolve` | **Thin slice complete:** supplier contract stop-sale (hard) + blackout (soft) on transfer resolve; `matchExplain` + vehicle capacity seats; reverse-corridor P2P hints; catalog season labeled as closing window; seeded North Bengal Fleet contract (Puja blackout + July stop-sale). **Supplier-owned TransferFare** (`supplierId`) + Rate chart on transport suppliers; resolve prefers supplier corridor (+40) over org/system; seed Siliguri/Bagdogra → Darjeeling Innova. **Ops fleet unit pick + vehicle_conflict + DriverJob↔unit / calendar writeback + partner create-job unit picker shipped.** **CSV supplierName on transfer import** shipped (optional; locked on supplier Rate chart). **Partner allocate holds UI** thin-shipped. **Hard capacity at quote:** Match stamps `rateProvenance.capacityWarn` (party vs seats × vehicles) → attention **Capacity** chip + drawer destructive cue + **blocks** send/approve. **Override ack + reason + manager gate** + **auto vehicle bump on Match + party edit** + **live Vehicles/party capacity restamp** shipped + **dedicated `inventory_risk.approve`** + **rate-drift Keep-buy RBAC** (`rate_drift.approve`). **Per-adult child-age banding thin-complete:** `childAgeMin`/`Max` on TransferFare + Match reclassify + Ages cue|
| CSV/XLSX bulk import + draft preview | Negotiated-rate CSV pattern | **Thin slice complete:** hotel + transfer + activity import accepts `.xlsx`/`.xls`/`.csv` (first sheet → existing preview/commit APIs); **import batch audit** (`rates.import.commit` + Import dialog **Recent imports**). Supplier Rate chart + Catalog Rates. **Recent imports show sample skip reasons** (`sampleSkips` from audit metadata, ≤3 lines). Defer: row replay |
| Rate-change detection + effective dates | Rate date windows | **Thin slice complete:** Match rate shows chart last updated + matched-at; soft drift when live chart `updatedAt` is newer than snapshot; rematch toast when buy changes; **send/approve blocked** until rematch or **Keep buy (acknowledge)** (`rateDriftAckForUpdatedAt` + `rateDriftAckReason`). Quote Contract badge tooltip includes chart updated. **Attention Rate drift chip + send preflight:** `POST /rates/chart-freshness` feeds strip/Save&next + client send blocked copy (aligned with API gate). **Rematch drifted:** attention strip + ··· rematch only `rate_drift` lines via `/rates/resolve`. **Hotel rate version chain thin-complete.** **Transfer + activity version chains thin-complete.** **Hotel tip Diff vs current + side-by-side expand thin-complete.** **Multi-approver hotel tip Activate thin-complete** (`rates.approve` + pending tip + Task). **Transfer + activity tip Activate thin-complete.** Defer: field-level restore / quorum |

**Defer past P0.5 thin slices:** credit-note settle/allocate automation, agencyAbsorption, PolicyAttachment graph. (Contract cancel tiers + Match stamp + Ops cancel preview/request/approve/apply + draft credit note thin-complete.)

### Release 3 — Trip control centre (days 61–90)

Compose existing surfaces — do **not** rebuild booking.

| Work item | Build on | Notes |
|-----------|----------|-------|
| Single trip control screen | `OperationsPanel`, `FinancePanel`, readiness, `GET /trips/:id/control` | **Complete (thin + remains):** Overview Trip control + compact risk strip; flags include near-departure hotel/transfer, voucher, missing transfer, balances, open incidents/change cases, readiness. Jump to Ops/Finance/Quotes/Commerce. |
| Service status vocabulary | Booking component statuses | **Complete (display layer):** unrequested → enquiry → awaiting → available → on hold → confirmed → payment pending → voucher pending → cancelled. Derived from stored status + invoices + voucherNote; edit form uses friendly labels |
| Unconfirmed / risk flags | Readiness + control API | **Complete:** missing transfer, unconfirmed hotel near departure, balance pending (+ incidents/changes) |

### After R3 — Movement and conflict board

**Thin slice shipped:** org-wide **Movement board** (`GET /operations/movement-board`, `/operations/movement`) — table + **calendar day-strip** of upcoming hotel check-ins + transfers (7/14/30) with risk chips. **Transfer driver/fleet assignment** on ops bookings (`travellerRequirementsJson.driverSupplierId` + vehicle label + dates) with **driver double-book conflict flags** on the board. **Calendar drag-assign** + **drag-to-reschedule**. **Partner DriverJob sync:** agency assign/reschedule/clear upserts `DriverJob` on `Supplier.linkedAssetId`; **reverse writeback** on accept/start/complete/cancel → agency booking status (+ `DRV-` confirmationRef / soft demote on cancel). Seed links Delhi fleet partner asset. **Fleet unit pick** (`fleetUnitId` from linked `AssetFleetUnit`) + **`vehicle_conflict`** when the same plate overlaps another transfer; Ops create/edit combobox; Delhi seed units. **DriverJob↔unit binding:** agency `fleetUnitId` stamped on `DriverJob` + unit-scoped `AssetCalendarBlock` upsert/clear on sync. **Home-stat click-through:** dashboard + board summary chips filter via `?type=hotel|transfer`, `?flagged=1`, `?overduePay=1`.

**Thin slice shipped:** partner **Holds & allocations** on inventory (allocate hold/confirm + release clears calendar). **Prod-ready:** agency transfer assign upserts booking-linked allocation on partner ledger (see Fleet hold ladder).

### Priority 1 (after P0 wedge)

- Trip finance panel: payment links · org AR/AP aging · portfolio profitability — **thin slices shipped.** CSV download on aging + portfolio; personal portfolio presets (local) + **org-shared report packs** with optional **weekly scheduled CSV email** (worker hourly tick) + **Email now**. Public pay page + guest companion QR use Razorpay Checkout.js when keys are set. **Aging chase:** Copy payment link / Send WhatsApp from receivables & overdue rows (same APIs as trip Finance). **Age bucket chips** toggle `?bucket=` → Age facet. **Payables settle:** Mark paid + **Unmark** (toast Undo + sticky strip) from `/finance/payables` (same paid/unmark APIs + CD sync as trip Finance). **Home finance stats:** AR/AP cards show `· N FX excl.` when aging totals omit other currencies (parity with portfolio).
- Role dashboards — **thin slice shipped**
- Guided onboarding — **thin slice shipped** (checklist + first-quote walkthrough + sample FIT starter pack)
- Downloadable / saved report presets — **thin slice shipped** (finance CSV + personal portfolio presets + org-shared packs + scheduled delivery)
### Phase 3 differentiators (parallel demo only — not the sales wedge)

Hosted agency websites, forms→CRM, customer portal, hotel/DMC/driver partner orgs, shared inventory, marketplace. Keep Product Bible Stages B–D as unlock order. Do **not** pause Phase 1 agency depth to polish Presence for competitive messaging.

---

## 3. Appendix — Already built (polish, don’t re-spec)

| Capability | Maturity | Primary paths |
|------------|----------|---------------|
| Versioned quotations, approval, accept, revise-from-accepted | Partial → mature-leaning | `apps/api/src/modules/quotations/` · org default validity on create/clone/revise |
| Quote templates (list/save/apply) + quotation clone | Thin complete | Apply remaps service dates to trip start + auto rematch + **itinerary day reanchor / seed from template story / scaffold from hotels**; **version supersede-on-save** + **history/restore/diff** + **tags + slash-path folders** + **History Diff side-by-side**; clone unchanged. Defer: server folder index / tree CRUD |
| Quote cost-safety + sticky pricing summary + guided empty state | Partial → thin attention | Trip Quotations tab: incomplete cost banner, **per-line attention click-through** (+ table scroll/highlight), send/approval gate, Add service / Import / Preview / Send |
| Margin gate (below-cost + org `minMarginPercent` floor) | Prod-ready (quote path) | Enforced for all senders on API (not only `quote.view_cost`); `below_margin.approve` overrides |
| Quote service drawers (hotel / transfer / activity V1) | Partial → activity match wired | `QuoteServiceDetailSheet.tsx` — hotel/transfer/activity Match rate from directory; **hotel hard allotment** (blocks send) + **hotel hard min-stay** (blocks send) + **occupancy extras** + **weekend nights** + **gala/date supplements** + **cancel summary** + **soft blackout / hard stop-sale Open contracts** (hotel + transfer + **activity**) + **transfer hard capacity** (blocks send) + **reverse-corridor Swap** + **activity child-age reclassify** banners + provenance stamps → attention chips (**Allotment / Capacity / Min stay / Occupancy / Gala / Weekend / Cancel / Ages** + pricing gates) |
| Branded proposal PDF + email | Partial → mature-leaning | `branded-proposal-pdf.ts`, quotation email send |
| Public itinerary / proposal share + accept | Prod-ready (quote path) | Share binds `quotationVersionId`; public accept requires PIN when set; expired quotes cannot accept |
| Hotel rates + transfer fares + activity rates + `rates/resolve` | Partial | `apps/api/src/modules/rates/`, Catalog & transfers, supplier Rate chart (stay + **activity** + **transfer/fleet**); `SupplierActivityRate` CRUD on `/activity-rates`; TransferFare optional `supplierId` |
| Supplier quick-create + type-specific profiles | Partial | `SuppliersPage.tsx`, `SupplierProfilePanel.tsx` — accommodation / restaurant / fleet / driver / activity / guide / DMC |
| Itinerary builder (story, not priced) | Partial | `ItineraryBuilder.tsx`, itinerary versions |
| Trip booking components + supplier assign | Partial → chain wired | `operations` module — hotel chain + **transfer driver/fleet assignment** (JSON) |
| Trip readiness checklist (incl. voucher note) | Partial | Trip workspace / ops — Mark vouchered ticks “Vouchers issued” |
| Trip finance summary (AR/AP, margin, est vs actual) | Partial | payment links, AR/AP aging, portfolio profitability, **CSV + personal presets + org-shared packs + weekly email delivery**; **aging row Chase** (link + WhatsApp) |
| Trip control centre | Partial → thin complete | `GET /trips/:id/control`, `TripControlCentre.tsx` — Overview + risk strip |
| Movement board (org-wide) | Partial → thin complete | `GET /operations/movement-board`, table + calendar; hotel + transfer + **activity**; driver assign + conflicts; drag-assign + reschedule; **bidirectional DriverJob sync** (`linkedAssetId` + status writeback + `fleetUnitId` / unit calendar block); **home-stat / summary click-through** (`?type=hotel|transfer|activity`, `?flagged=1`, `?overduePay=1`, `?voucherPending=1`) |
| Role-composed dashboards | Partial → thin complete | `composeDashboard.ts`, `DashboardPage.tsx` — finance aging/portfolio + ops movement strips (**click-through filters**); **sales response SLA strip**; sales Inbox primary |
| Unified engagement inbox | Partial | `InboxPage.tsx`, `interactions`, connectors — `?unread=1` / `?aging=1` from dashboard |
| Multi-org kinds + membership + switcher | Mature (arch) | `organizations`, RBAC, `OrgKindSchema` |
| Digital Presence builder + publish + forms→CRM | Mature core / partial hosting | `apps/api/src/modules/presence/`, `apps/web/src/pages/presence/` |
| Progressive complexity / capability gating | Partial | `apps/web/src/lib/progressiveComplexity/` |
| Agency onboarding checklist | Partial → thin complete | `GET /organizations/onboarding-status`, `AgencyOnboardingChecklist.tsx`; first-quote walkthrough; sample FIT pack `POST /organizations/starter-packs/fit_templates_v1/install` (templates + **demo trip `TRP-DEMO-01`**); **quote empty-state Install pack** stays on current trip |
| Sales response telemetry | Partial → FIT minutes | `sales-sla-metrics.ts`, `SalesSlaHomeStats.tsx` — derived medians + overdue follow-ups + **FIT build minutes**; **task↔followUpAt**; **inbox unread + org aging hours**; **`conversation.unread_sla` / `waiting` automation fire** (`unread-sla-fire.ts`, worker tick) |

### Intentionally not built yet (expect greenfield or thin stubs)

- Movement / conflict board across trips → **table + calendar + driver assign + conflicts + drag-assign + reschedule + bidirectional DriverJob sync + fleet unit pick / vehicle_conflict + DriverJob↔unit calendar writeback + partner create-job unit picker + partner allocate holds UI shipped**; full fleet inventory OS still open
- Customer voucher PDFs and bulk voucher send → **shipped** (Download + WA/email for hotel **+ transfer + activity**; Cloud PDF attach ≤5; Email outbox pack ≤5; `wa.me` text fallback when Cloud is off)
- Trip payment links / instalment checkout → **shipped** (Copy / WhatsApp send + public `/p/pay/:token` with **Razorpay Checkout.js** when keys are set; mock confirm when keys are absent). Guest companion QR pay also uses Checkout.js (same helper; mock when keys absent)
- Activity rate catalog → **shipped** (`SupplierActivityRate`: resolve Match rate, Rates CRUD, child age bounds, contract blackout/stop-sale, CSV/XLSX import)
- Guided implementation / onboarding centre → **checklist + first-quote walkthrough shipped**; **sample FIT starter pack shipped** (`POST /organizations/starter-packs/fit_templates_v1/install` → Darjeeling + Goa templates **+ `TRP-DEMO-01` sample planning trip** with draft quote). Partner seed still seed-only
- Org-wide ledger and scheduled report packs → **CSV + personal presets + org-shared packs + weekly scheduled email shipped** (`delivery` on pack + worker tick + `POST …/report-packs/:id/send`)
- Live FX auto-cron / quote-path fetch / AED alternate feed (Settings refresh + quote lock thin-complete) and place-of-supply tax regimes

---

## 4. Positioning (adopt for site and sales)

### Do not lead with

> A multi-tenant connected travel-commerce operating ecosystem.

### Lead with

> **Capture every enquiry, create professional quotations faster, manage bookings and suppliers, collect payments and operate every trip from one place.**

Then introduce differentiators: connected WhatsApp and email → agency website → customer-facing proposals → hotel/DMC collaboration → multi-organization network → AI assistance.

### Primary website message

**Headline:** From Travel Enquiry to Successful Trip — All in One Place

**Supporting statement:** Capture leads, build professional itineraries, manage suppliers and bookings, collect payments, coordinate operations and grow your agency from one connected Travel OS.

**Outcome cards:**

- Reply faster
- Quote accurately
- Never miss follow-ups
- Control every booking
- Track every rupee
- Deliver better trips

**Secondary brand line (after outcomes):** Run your travel company and grow your travel brand from one platform.

### Claim discipline

- Public quote-speed target: **under three minutes** only when `fitClaimProtocol.publicClaimAllowed` is true (median ≤3m and n≥20 over 30d). Until then status is **testing** — do not put on the website.
- Do not copy unverified “10X / 95% faster” marketing without methodology.
- Prefer telemetry: median quote time, lead response time, follow-up completion, conversion, collection time, confirmation time.
- Do not imply finished custom-domain hosting or Microsoft inbox until shipped. HubSpot is out of scope.

#### Claim registry (sales / marketing / product)

| Claim | Status |
|-------|--------|
| Build a standard FIT quotation in under three minutes | **Testing** — gated by dashboard `fitClaimProtocol`; demo-travel seed can clear n≥20 locally |
| Integrated lead → quote → book → collect → ops workflow | **Proven** (thin-complete) |
| Multi-organization travel operating platform | **Architecture proven** — do not claim finished partner network |
| Automated GST-compliant / full accounting ledger | **Do not claim** |
| Full supplier / partner network | **Do not claim yet** |
| Live FX market refresh (Settings) | **Proven** (manual Frankfurter refresh; not auto-cron) |
| Hotel SGL/DBL/TPL contracted bases on Match | **Proven** (thin) |
| Meal × occupancy matrix (Rate chart) | **Proven** (thin) |
| Hotel weekend-per-band on Match | **Proven** (thin) |
| Matrix weekend columns (Rate chart) | **Proven** (thin) |
| CSV band weekend columns (hotel import) | **Proven** (thin) |
| Hotel min stay cue on Match | **Proven** (thin · hard gate + ack) |
| Hotel nationality IN/INTL Match | **Proven** (thin) |
| Hotel per-ISO nationality tips | **Proven** (thin) |
| Full ISO-3166 nationality picker | **Proven** (thin) |
| Multi-guest mixed nationality | **Proven** (thin) |
| Traveller nationality → Match default | **Proven** (thin) |
| Add traveller nationality | **Proven** (thin) |
| Edit traveller nationality | **Proven** (thin) |
| Tax identity on proposals (label / GSTIN / POS) | **Proven** (thin · display only) |
| CGST/SGST/IGST display split (POS-driven) | **Proven** (thin · display only) |
| Trip destination POS override | **Proven** (thin · display only) |
| Quote tax identity freeze + destination POS infer | **Proven** (thin · display only) |
| Trip Finance accepted-quote tax display parity | **Proven** (thin · display only) |
| Public pay-page tax breakdown | **Proven** (thin · display only) |
| Receivable CD instalment tax split | **Proven** (thin · display only) |
| Automated GST-compliant ledger | **Do not claim** |
| Hotel rate version chain | **Proven** (thin) |
| Transfer + activity rate version chains | **Proven** (thin) |
| Hotel rate tip diff | **Proven** (thin) |
| Hotel tip Diff side-by-side | **Proven** (thin) |
| Multi-approver hotel rate inbox | **Proven** (thin · dual-control Activate) |
| Transfer + activity tip dual-control Activate | **Proven** (thin · dual-control Activate) |
| Per-pax buy splits (2A mixed DBL/2) | **Proven** (thin) |
| Per-pax buy + children extras (2A mixed) | **Proven** (thin) |
| Multi-room 2A×N per-pax buy | **Proven** (thin) |
| 3A TPL/3 per-pax buy | **Proven** (thin) |
| Uneven 3A/2R DBL+SGL per-pax buy | **Proven** (thin) |
| Weighted 2-code 3A per-pax buy | **Proven** (thin · lead-weighted) |
| Rooming alone + traveller multiplicity + 3A×N | **Proven** (thin) |
| Transfer + activity tip diff | **Proven** (thin) |
| Transfer + activity tip Diff side-by-side | **Proven** (thin) |
| Package template History Diff side-by-side | **Proven** (thin) |
| Hard min-stay send gate | **Proven** (thin) |

#### 90-day execution scorecard

| Bet | Done when | Status |
|-----|-----------|--------|
| Hotel occupancy depth | Contracting enters SGL/DBL/TPL without sales spreadsheet override on seeded FIT | **Adult bands → nationality + per-pax through rooming / multiplicity / 3A×N done**; uneven 6A/4R board open |
| FIT speed claim | Protocol stamped; n≥20; median ≤3m; `publicClaimAllowed` | **Gate shipped**; **demo-travel seed stamps n=20 under 3m** (local demos only — production still waiting on real samples) |
| Market credibility | Claim registry live; release notes + polished demo org | **Registry + About + public `/changelog` + named demo trip done**; public scale claim still open |
| Deal-gated FX/fleet | Open only with signed need; keep locks/meta pluggable | **Discipline** |

### What we should not copy from Sembark

- Feature-first complexity without progressive defaults
- Their multi-brand model (preserve our org-kind architecture)
- Unverified marketing numbers

---

## 5. Alignment with Product Bible

| Bible stage | This memo |
|-------------|-----------|
| Stage A — Agency PMF | Releases 1–3 + trip finance foothold |
| Stage B–D — invite, exchange, kind portals | Phase 3 differentiators; secondary in sales |
| Commercial sell boundary | Section 4 outcome messaging |

When this memo and older PRD wishlists conflict on near-term order, **this memo wins for the next 90 days**; Bible still wins on vision and staged unlock.
