/**
 * Legacy → canonical catalog key maps (used with --preserve-legacy / --replace-system-only).
 * Default full purge does not need remapping because org Presence trees are deleted.
 *
 * Runtime renderer aliases live in `@wayrune/contracts` (`resolveRenderableModuleType`)
 * so the builder canvas and public HTML share one map.
 */
import {
  PRESENCE_MODULE_RENDERER_ALIASES,
  resolveRenderableModuleType,
} from '@wayrune/contracts';

export const THEME_KEY_MAP: Record<string, string> = {
  coastal_light: 'horizon',
  hospitality_luxe: 'atelier',
  homestay_hearth: 'localist',
  portfolio_ink: 'meridian',
  slate_editorial: 'horizon',
  midnight_harbor: 'coastline',
  alpine_mist: 'altitude',
};

/** Old module keys → Sprint 1 canonical keys. */
export const MODULE_KEY_MAP: Record<string, string> = {
  hero_basic: 'hero',
  trip_cards: 'package_grid',
  package_cards: 'package_grid',
  image_text: 'split_content',
  feature_split: 'split_content',
  newsletter: 'newsletter_form',
  widget_cta: 'whatsapp_cta',
  trip_search_cta: 'hero_search',
  itinerary: 'itinerary_timeline',
  season_promo: 'offer_banner',
  banner_slim: 'offer_banner',
  team: 'team_profiles',
  enquiry_split: 'trip_inquiry',
};

/** @deprecated Prefer PRESENCE_MODULE_RENDERER_ALIASES from @wayrune/contracts */
export const MODULE_RENDERER_ALIASES = PRESENCE_MODULE_RENDERER_ALIASES;

export { resolveRenderableModuleType };

export function mapThemeKey(oldKey: string): string | null {
  return THEME_KEY_MAP[oldKey] ?? null;
}

export function mapModuleKey(oldKey: string): string | null {
  return MODULE_KEY_MAP[oldKey] ?? null;
}
