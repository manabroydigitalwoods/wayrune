# Presence design system (Sprint 1)

Token groups and recipes are the shared language between themes, site overrides, and component CSS.

## Token groups

| Group | Keys |
|-------|------|
| brand | primary, secondary, accent, neutral, success, warning |
| surfaces | background, foreground, muted, surface, surfaceMuted, border |
| shape | radius |
| hero | heroFrom, heroTo |
| type | fontDisplay, fontHeading, fontBody, fontLabel |

Source of truth in code:

- Seed: `apps/api/src/modules/presence/presence-catalog-v2-seed.ts` → `DESIGN_TOKEN_SCHEMA`
- Contracts: `PRESENCE_DESIGN_TOKEN_GROUPS` / `PRESENCE_DESIGN_RECIPES` in `@wayrune/contracts`

## Recipes (names only in Sprint 1)

- `button.primary`
- `card.package`
- `header`
- `hero`
- `form`
- `sectionHeading`

Later sprints bind recipes to CSS custom properties emitted by the public runtime.

## Theme families

| Key | Role | Sprint depth |
|-----|------|--------------|
| horizon | General agency | Full tokens + live presets (ocean/sunset/forest/urban) |
| atelier | Luxury | Full tokens + live presets (ivory/ink/champagne/slate) |
| altitude | Adventure | Directional shell |
| wildlands | Safari | Directional shell |
| marigold | India / cultural | Directional shell |
| coastline | Beach / honeymoon | Directional shell |
| meridian | Corporate / MICE | Directional shell |
| localist | DMC / local | Directional shell |

Style presets live on `schemaJson.stylePresets` / `stylePresetDeltas` and apply via `settingsJson.stylePreset` (see `presence-style-presets.ts`).
