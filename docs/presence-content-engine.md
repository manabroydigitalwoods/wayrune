# Presence Content Engine

Phase 4 shared layer for Dynamic Data Sources, Variables, Collections, Scheduling, Personalization, and A/B.

Product boundaries and architectural invariants: see [Digital Presence](./digital-presence.md).

## Resolve context

Available at render time:

- `org`, `site`, `page`
- `visitor` (country, device, UTM, variant seed)
- `now`, `preview`

## Variables

Builtin keys (examples):

- `organization.name`, `organization.logo`
- `phone`, `whatsapp`, `email`
- `address.*`, `social.*`
- `currency`, `timezone`
- `site.name`, `site.url`

Custom variables live in `site.settingsJson.variables` and override org `brandingJson.presenceVariables`.

Use `{{ path.to.value }}` in any string section prop. Output is HTML-escaped.

## Data sources

Attach to section props:

```json
{
  "dataSource": {
    "source": "trips",
    "filters": { "status": ["confirmed", "planning"] },
    "sort": { "field": "updatedAt", "dir": "desc" },
    "limit": 6
  }
}
```

Sources v1: `trips`, `quotations`, `collection:{key}`.

Legacy `liveFrom: "trips"` is mapped to `dataSource.source = "trips"`.

## Rules

Section `props.schedule` / `props.rules` / `props.ab`:

- **schedule** — `publishAt` / `unpublishAt`
- **personalize** — match visitor country / device / UTM, apply `propsOverride`
- **ab** — traffic split by visitor seed; track via analytics `ab_impression` / `ab_conversion`

Pages also support `publishAt` / `unpublishAt` columns.

## Collections

`PresenceCollection` + `PresenceCollectionEntry` register as `collection:{key}` sources and auto routes:

- listing: `/blog`
- detail: `/blog/:slug`

## Analytics

First-party beacon posts to `POST /presence/public/events`. Dashboard: `GET /presence/sites/:siteId/analytics`.
