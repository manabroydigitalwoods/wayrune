# Presence catalog reset runbook

Destructive local/dev tooling to replace the Digital Presence system catalog with the Sprint 1 skeleton (8 theme families + ~26 travel modules).

## Warning

Default `reset` **deletes all org Presence data**:

- Sites, pages, sections, globals, collections, analytics, publish versions
- Org child themes, org modules/templates, form presets, catalog reviews
- Then wipes system themes/modules/templates and reseeds catalog v2

Non-Presence ERP data (orgs, users, CRM, bookings, etc.) is untouched.

## Commands

```bash
# Snapshot current catalog + sites (JSON under tmp/presence-catalog-backups/)
pnpm presence:catalog:backup

# Preview deletions (no writes)
pnpm presence:catalog:reset -- --dry-run

# Full purge + reseed (requires explicit confirm)
pnpm presence:catalog:reset -- --yes

# Seed only (upsert catalog onto existing DB)
pnpm presence:catalog:seed

# Assert Horizon/Atelier + module keys exist
pnpm presence:catalog:validate
pnpm presence:catalog:smoke
```

## Flags

| Flag | Effect |
|------|--------|
| `--yes` | Required for non-dry-run reset |
| `--dry-run` | Count/plan only |
| `--org=ID` | Limit org purge to one org (repeatable) |
| `--replace-system-only` | Skip org purge (fails if sites still pin themes) |
| `--preserve-legacy` | Archive non-v2 system themes/modules instead of deleting |
| `--no-purge-org-presence` | Same risk as replace-system-only for FK |
| `--seed-demo-sites` | Reserved (Sprint 1 no-op) |

## Recommended local flow

1. `pnpm presence:catalog:backup`
2. `pnpm presence:catalog:reset -- --dry-run`
3. `pnpm presence:catalog:reset -- --yes`
4. `pnpm presence:catalog:validate && pnpm presence:catalog:smoke`
5. Restart API; open Digital Presence hub and confirm Horizon / Atelier + component library

`seed` / `reset` also restore org Presence form presets (`contact`, travel enquiry, etc.) after a purge.

## Compat

Legacy key maps live in `apps/api/src/modules/presence/presence-catalog-compat.ts` for `--preserve-legacy` / future site remaps. Runtime aliases map new section types (e.g. `package_grid`) onto existing HTML renderers.
