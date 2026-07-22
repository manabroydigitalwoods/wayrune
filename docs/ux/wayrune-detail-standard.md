# Wayrune Detail Standard

**Status:** Active · 2026-07-22  
**Principle:** Simple by default, powerful when needed, travel-workflow aware.  
**Reference implementation:** [`apps/web/src/pages/LeadDetailPage.tsx`](../../apps/web/src/pages/LeadDetailPage.tsx) — do not invent parallel chrome.

Queue list chrome stays governed by [`wayrune-queue-standard.md`](./wayrune-queue-standard.md). This document is the **detail-page** counterpart.

## Layout families

| Family | When | Body |
| --- | --- | --- |
| **CRM record** | Lead, Inquiry, Party (customer) | Full-height **3-panel**: About \| Activity \| Associations |
| **Workspace** | Trip, Supplier | AppShell chrome + **tabbed** body; do **not** force 3-panel |

Stay/partner portals and intake wizards are out of scope unless they borrow shared chrome helpers.

## Page chrome (canonical)

```text
AppShell top nav:  {icon} {Title}  {titleMeta}     [global actions + subdued GlobalSearch]
                   breadcrumbs: Parent › Record

[Action strip: status / primary CTA / ⋯]     ← page-local, not AppShell headerActions

[CRM 3-panel  ·or·  Workspace tabs]
```

### Rules

- Title, `titleMeta`, icon, and breadcrumbs live in the **AppShell top nav** via `usePageChrome`.
- **Do not** add new in-page `PageHeader` or `Breadcrumbs` on detail routes.
- Page actions sit in an in-page **action strip** (`DetailActionStrip`): primary/`sm` controls + overflow `⋯`.
- Rare / destructive actions live in **⋯**, not beside primary CTAs.
- Prefer `titleMeta` for a single secondary line (phone, email, status, party name).

## CRM 3-panel shell

Desktop (`lg+`):

```text
grid-cols-[272px_minmax(0,1fr)_288px]
About (self-start scroll) | Activity (min-h-0 flex) | Associations (self-start scroll)
```

Mobile:

- Stacked scroll; About / Related as accordions (`showHeader={false}` when wrapped).
- Activity / main content stays expanded and primary.

Use shared helpers:

- `DETAIL_PANEL_SHELL` / `DetailPanel` — `rounded-xl border p-3 glass md:p-3.5`
- `DetailPageShell` — viewport height + optional CRM grid
- `DetailActionStrip` — right-aligned action row

Reference columns:

| Column | Role |
| --- | --- |
| **About** | Identity + editable facts (inline edit where write perms exist) |
| **Activity** | Timeline / story; collapsed cards clamp to a few lines |
| **Associations** | Linked trips, tasks, inquiries, party, lead |

## Density & controls

- Prefer `size="sm"` / `xs` / `icon-sm` and `inputSize="sm"` in sheets, side panels, and action strips.
- Menus: `--control-text-sm` + small icons (`size-3.5` or `size-[0.875em]`).
- Forms in `RecordSheet` / `RecordDialog` / floating composers match About-panel density.

## Glass ladder

| Class | Role |
| --- | --- |
| `glass` | Panel shells (`DETAIL_PANEL_SHELL`) |
| `glass-row` | Timeline cards, association rows |
| `glass-strong` | Segmented filters, floating composers |

## Overlays

| Surface | Use |
| --- | --- |
| `RecordSheet` | Edit record, create linked task |
| `RecordDialog` | Confirm / short forms (lost, assign, merge) |
| Floating composers | Log note / email / call (lead family) |

## Vocabulary

Use travel language: Owner, Follow-up, Inquiry, Trip, Customer — not Issue, Ticket, Cycle.

## Verification checklist

- AppShell shows title + breadcrumbs; no duplicate in-page H1
- Action strip uses `sm` density; overflow for rare actions
- CRM pages: 3-panel on `lg`, accordion About/Related on mobile
- Workspace pages: chrome + strip only; tabs unchanged
- Sheets/dialogs: compact controls
