# Catalog coverage matrix

Target end-state (later sprints): 8 theme families × 3–5 presets, 65–80 components × 3–8 variants, 12 site + 20 page starters.

## Themes

| Family | Seeded | Tokenized | Presets (live) | Production polish |
|--------|--------|-----------|----------------|-------------------|
| horizon | yes | yes | ocean, sunset, forest, urban | Sprint 2 |
| atelier | yes | yes | ivory, ink, champagne, slate | Sprint 2 |
| altitude | yes | shell | declared only | no |
| wildlands | yes | shell | declared only | no |
| marigold | yes | shell | declared only | no |
| coastline | yes | shell | declared only | no |
| meridian | yes | shell | declared only | no |
| localist | yes | shell | declared only | no |

Style presets apply via `site.settingsJson.stylePreset` at render time and via builder **Colors & type → Style preset**.

## Modules (canonical keys)

Spine variants (Sprint 2): hero, destination_grid / destination_showcase, package_grid / featured_package, trip_inquiry, whatsapp_cta, inclusions.

| Key | Seeded | Renderer | Notes |
|-----|--------|----------|-------|
| hero | yes | core | variants: spotlight, immersive, split, minimal |
| hero_search | yes | alias → trip_search_cta | |
| section_heading | yes | alias → page_header | |
| rich_text | yes | core | |
| split_content | yes | alias → feature_split | |
| destination_showcase | yes | alias → destination_grid | variants |
| destination_grid | yes | extra | variants |
| package_grid | yes | alias → package_cards | variants |
| featured_package | yes | alias → package_cards | variants |
| itinerary_timeline | yes | alias → itinerary | |
| inclusions | yes | alias → feature_grid | variants |
| trip_facts | yes | alias → stats | |
| gallery | yes | core | |
| stats | yes | extra | |
| testimonials | yes | core | |
| faq | yes | core | |
| form | yes | core | |
| trip_inquiry | yes | alias → enquiry_split | variants |
| cta | yes | core | |
| whatsapp_cta | yes | alias → widget_cta | variants |
| newsletter_form | yes | alias → newsletter | |
| offer_banner | yes | alias → season_promo | |
| team_profiles | yes | alias → team | |
| container | yes | core | |
| two_column | yes | core | |
| columns | yes | core | |

## Starters

| Starter | Status |
|---------|--------|
| `agency_marketing` (Horizon default) | Catalog module keys only (Sprint 2) |
| `home_default` page template | Catalog keys (Sprint 2) |
| Other site templates | Still mixed legacy keys — later sprint |

## Out of scope / later

- Full visual production for 6 shell families
- 65–80 production components with full variant packs
- 12 site / 20 page starters rewrite
- Media library + 90% pilot coverage gate
