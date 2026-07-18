import type { ComponentType } from 'react';
import { CardGridSection, GallerySection } from './modules/catalog';
import {
  FaqSection,
  ItineraryTimelineSection,
  SectionHeadingSection,
  SplitContentSection,
  TeamProfilesSection,
  TextBlockSection,
} from './modules/content';
import {
  CtaSection,
  HeroSection,
  OfferBannerSection,
  StatsSection,
  TestimonialsSection,
} from './modules/marketing';
import { TripHighlightSection } from './modules/packages';
import type { SectionProps } from './types';

/**
 * Map Presence module keys → local React preview components.
 * Add new modules here when you extend site/structure.json.
 */
export const sectionRegistry: Record<string, ComponentType<SectionProps>> = {
  hero: HeroSection,
  offer_banner: OfferBannerSection,
  stats: StatsSection,
  testimonials: TestimonialsSection,
  cta: CtaSection,
  destination_grid: CardGridSection,
  package_grid: CardGridSection,
  gallery: GallerySection,
  section_heading: SectionHeadingSection,
  itinerary_timeline: ItineraryTimelineSection,
  split_content: SplitContentSection,
  team_profiles: TeamProfilesSection,
  faq: FaqSection,
  trip_inquiry: TextBlockSection,
  rich_text: TextBlockSection,
  'trip-highlight': TripHighlightSection,
};
