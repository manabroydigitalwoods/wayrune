# Wayrune Queue Standard

**Status:** Frozen · 2026-07-21  
**Principle:** Simple by default, powerful when needed, travel-workflow aware.  
**Reference implementation:** [`apps/web/src/pages/LeadsPage.tsx`](../../apps/web/src/pages/LeadsPage.tsx) — do not invent parallel chrome.

Adopt Linear’s **interaction architecture**, not its visual density or vocabulary.

## The three layers

| Layer | Controls | Does **not** |
| --- | --- | --- |
| **View** | How data is presented / broad working mode (Board / Table, Open / Completed) | Change which records match |
| **Filters** | Which records are visible (Owner, Overdue, Stage, Departure window) | Change columns or density |
| **Display** | Presentation prefs (columns, sort, group, density) | Change the result set |

Attention shortcuts (Overdue, Unread, Departing soon) are **preset filters**: they write the same URL chip state. Do not invent a second filtering mechanism for SLA cards.

## Page chrome (canonical · frozen)

```text
AppShell top nav:  {Title + subtitle}          [global actions + subdued GlobalSearch]

[View segmented control]   Attention presets   [Primary action] [⋯]

[Page search…]  [Due range?]  [ + Filter ]  [ Display ]

Active chips…                              Clear

[Board | Table body — same URL filters]
```

Use shared layout: `QueuePageChrome` (+ `QueueViewToggle`) in `apps/web/src/components/queue/`.

### Rules

- Title and subtitle live in the **AppShell top nav** (`usePageChrome`), not a large in-page `PageHeader`.
- Shell: `ListPageShell className="gap-1"`; chrome stack `flex flex-col gap-1`.
- Import and other infrequent actions live in **⋯**, not beside filters.
- **Display** owns columns (no separate top-level Columns control).
- Frequent view toggles (Board / Table) stay visible as a segmented control (`QueueViewToggle`).
- Menus (Filter, Display, row actions, ⋯): `--control-text-sm` + small icons (`size-3.5`).

### Search hierarchy

| Surface | Role | Visual |
| --- | --- | --- |
| **GlobalSearch** (top nav) | Find anything across Wayrune | Narrow, low contrast, placeholder `Search Wayrune…`, ⌘K / Ctrl+K |
| **Page search** (queue toolbar) | Filter **this** list | Dominant: `h-[var(--control-h)]`, stronger border/fill, URL `q=` |

Page search is not a chip. Clear-search lives inside the page search field.

### DataTable on queue pages

- Parent owns search and columns: `showSearch={false}`, `showColumnsMenu={false}` (skip empty built-in FilterBar).
- Full-width sortable column headers; sticky `actions` column when present.
- Sortable queues persist `sort` + `dir` in the URL (controlled `sorting` / `onSortingChange`).

## URL state

Queue state is the source of truth in the query string (stable, readable, backward-compatible schemas per module). Benefits: refresh, deep-links, share, back/forward, support reproduce.

- Search: URL-backed (`q=`); not a chip.
- Switching View (Board ↔ Table) **must not** clear or change filters.
- `clearFilters` keeps `view` + `q` + sort (sort is display chrome).
- Pattern helpers after [`leadsQueryState.ts`](../../apps/web/src/lib/queue/leadsQueryState.ts): parse / serialize / patch / hasFilters / apiQuery.

**Defer** formal saved views. Use browser bookmarks, Wayrune pins (path + query), and dashboard deep-links for the pilot.

## Shared vs domain

Shared primitives (`QueuePageChrome`, `QueueViewToggle`, `ActiveFilterChips`, `FilterMenu`, `DisplayMenu`, `AttentionPresets`, `omitEmptyParams`). Each domain supplies its own filter definitions, attention presets, and `*QueryState.ts`.

## Vocabulary

Use travel language: Owner, Overdue, Open / Won / Lost, Upcoming / Travelling — not Triage, Issues, Cycles, Backlog.

## Sidebar density

Appearance density adjusts row height and section spacing only. Same IA, labels, icons, order, and badge rules. Badges mean actionable attention, not total record counts.

## Board and list

The same URL-backed filters apply to every presentation mode.

## Rollout order

Wave 1 (done / frozen):

1. **Leads** — canonical reference  
2. **Inbox** — unread / aging; channel, assignee  
3. **Inquiries** — incomplete / stale / unassigned  
4. **Tasks** — due / overdue / mine  
5. **Movement** — flagged / voucher pending / departure  
6. **Trips · Parties · Suppliers** — high-traffic CRM lists  

Wave 2 — remaining list queues (**Tier A · full QueuePageChrome**):

7. **Rates** — Hotel / Transfer view; import in ⋯  
8. **Finance aging** — aging buckets as attention presets  
9. **Finance profitability** — travel range + presets  
10. **Places** — kind / parent / category filters  
11. **Network** — Discover / Following / Commerce view  
12. **Presence pages** (pages table) — hub title via `usePageChrome`; list toolbar on pages index  
13. **Audit log** — light search; title in top nav  

Wave 2 — settings / team hubs (**Tier B · light chrome only**):

14. **Settings** · **Integrations** · **Team** (members / roles / permissions) — `usePageChrome` title only; keep hub/panel IA (no FilterMenu / DisplayMenu)

Still out of scope: detail workspaces, Presence builder CMS surfaces beyond the pages list, Partner hubs.
