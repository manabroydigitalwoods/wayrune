/**
 * Catalog module keys → HTML renderer keys used by `renderExtraModule` / built-in renderers.
 * Builder canvas and public runtime must both resolve through this map.
 */
export const PRESENCE_MODULE_RENDERER_ALIASES: Record<string, string> = {
  newsletter_form: 'newsletter',
  package_grid: 'package_cards',
  itinerary_timeline: 'itinerary',
  team_profiles: 'team',
  whatsapp_cta: 'widget_cta',
  split_content: 'feature_split',
  hero_search: 'trip_search_cta',
  offer_banner: 'season_promo',
  trip_inquiry: 'enquiry_split',
  destination_showcase: 'destination_grid',
  featured_package: 'package_cards',
  section_heading: 'page_header',
  inclusions: 'feature_grid',
  trip_facts: 'stats',
};

export function resolveRenderableModuleType(type: string): string {
  return PRESENCE_MODULE_RENDERER_ALIASES[type] ?? type;
}
